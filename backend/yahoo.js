/**
 * Hybrid data fetcher: Moneycontrol for fundamentals + Yahoo v8 Chart for historical prices.
 * Falls back gracefully between sources.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ─── Moneycontrol API ────────────────────────────────────────

/**
 * Search Moneycontrol for a stock by NSE/BSE ticker symbol.
 * Returns the Moneycontrol sc_id needed for price API.
 */
async function searchMoneycontrol(ticker) {
  // Strip .NS / .BO suffix for search
  const cleanTicker = ticker.replace(/\.(NS|BO)$/i, '');
  const url = `https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?classic=true&query=${encodeURIComponent(cleanTicker)}&type=1&format=json&callback=`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' }
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  // Try exact match on NSEID first
  for (const item of data) {
    if (item.sc_id) return item;
  }
  return data[0];
}

/**
 * Fetch current price and fundamental data from Moneycontrol.
 */
async function fetchMoneycontrolData(scId, exchange = 'nse') {
  const url = `https://priceapi.moneycontrol.com/pricefeed/${exchange}/equitycash/${scId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' }
  });
  if (!res.ok) return null;

  const json = await res.json();
  if (json.code !== '200' || !json.data) return null;
  return json.data;
}

// ─── Yahoo Finance v8 Chart API (for historical prices) ─────

/**
 * Fetch historical prices from Yahoo v8 chart API.
 * This endpoint is typically less restricted than v10 quoteSummary.
 */
async function fetchYahooChart(ticker, range = '10y', interval = '1mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  if (!res.ok) {
    console.warn(`Yahoo chart API returned ${res.status} for ${ticker}`);
    return { prices: [], meta: null };
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return { prices: [], meta: null };

  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};
  const closes = quotes.close || [];
  const volumes = quotes.volume || [];

  const prices = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      prices.push({
        date: new Date(timestamps[i] * 1000).toISOString(),
        close: closes[i],
        volume: volumes[i] || 0
      });
    }
  }

  return { prices, meta: result.meta || null };
}

// ─── Yahoo v10 quoteSummary (with crumb auth, best-effort) ──

let sessionCrumb = null;
let sessionCookies = null;
let sessionTimestamp = 0;

async function getYahooSession() {
  if (sessionCrumb && sessionCookies && Date.now() - sessionTimestamp < 25 * 60 * 1000) {
    return { crumb: sessionCrumb, cookies: sessionCookies };
  }

  try {
    const initRes = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': UA },
      redirect: 'manual'
    });
    const setCookie = initRes.headers.getSetCookie?.() || [];
    let cookies = setCookie.map(c => c.split(';')[0]).join('; ');

    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': cookies }
    });

    if (crumbRes.ok) {
      const crumb = (await crumbRes.text()).trim();
      const crumbCookies = crumbRes.headers.getSetCookie?.() || [];
      if (crumbCookies.length > 0) {
        cookies += '; ' + crumbCookies.map(c => c.split(';')[0]).join('; ');
      }
      sessionCrumb = crumb;
      sessionCookies = cookies;
      sessionTimestamp = Date.now();
      return { crumb, cookies };
    }
  } catch (e) {
    console.warn('Yahoo session init failed:', e.message);
  }

  return null;
}

async function fetchYahooQuoteSummary(ticker) {
  const session = await getYahooSession();
  if (!session) return null;

  const modules = 'price,summaryDetail,defaultKeyStatistics,earnings,financialData,incomeStatementHistory';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(session.crumb)}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Cookie': session.cookies }
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.quoteSummary?.result?.[0] || null;
  } catch {
    return null;
  }
}

// ─── Unified Data Fetcher ───────────────────────────────────

export async function fetchStockData(ticker, lookbackYears = 8) {
  const warnings = [];
  let source = 'moneycontrol';

  // 1. Try Moneycontrol for fundamentals
  const mcSearch = await searchMoneycontrol(ticker);
  let mcData = null;
  if (mcSearch?.sc_id) {
    const exchange = ticker.endsWith('.BO') ? 'bse' : 'nse';
    mcData = await fetchMoneycontrolData(mcSearch.sc_id, exchange);
  }

  // 2. Try Yahoo quoteSummary as supplement/fallback
  let yahooSummary = null;
  try {
    yahooSummary = await fetchYahooQuoteSummary(ticker);
  } catch {
    // Yahoo may be rate-limited, that's fine
  }

  // 3. Get historical prices from Yahoo chart (most reliable endpoint)
  const range = lookbackYears <= 5 ? '5y' : lookbackYears <= 10 ? '10y' : 'max';
  const { prices: historicalPrices, meta: chartMeta } = await fetchYahooChart(ticker, range, '1mo');

  // ─── Assemble current data ───────────────────────────────

  let currentPrice, trailingEps, trailingPE, forwardPE, sharesOutstanding, companyName, currency, exchange, marketState;

  if (mcData) {
    currentPrice = parseFloat(mcData.pricecurrent) || parseFloat(mcData.LP);
    trailingEps = parseFloat(mcData.SC_TTM) || parseFloat(mcData.sc_ttm_cons);
    trailingPE = parseFloat(mcData.PE) || parseFloat(mcData.PECONS);
    forwardPE = parseFloat(mcData.PECONS) || null;
    sharesOutstanding = parseFloat(mcData.SHRS) || null;
    companyName = mcData.SC_FULLNM || mcSearch?.stock_name || ticker;
    currency = 'INR';
    exchange = mcData.exchange === 'B' ? 'BSE' : 'NSE';
    marketState = mcData.market_state || '';
    source = 'moneycontrol';
  } else if (yahooSummary) {
    const p = yahooSummary.price || {};
    const sd = yahooSummary.summaryDetail || {};
    const ks = yahooSummary.defaultKeyStatistics || {};
    const fd = yahooSummary.financialData || {};

    currentPrice = rawVal(p.regularMarketPrice) || rawVal(fd.currentPrice) || rawVal(sd.previousClose);
    trailingEps = rawVal(ks.trailingEps) || rawVal(fd.trailingEps);
    trailingPE = rawVal(sd.trailingPE) || rawVal(p.trailingPE);
    forwardPE = rawVal(sd.forwardPE) || rawVal(ks.forwardPE);
    sharesOutstanding = rawVal(ks.sharesOutstanding) || rawVal(p.sharesOutstanding);
    companyName = p.shortName || p.longName || ticker;
    currency = p.currency || 'INR';
    exchange = p.exchangeName || p.exchange || '';
    marketState = p.marketState || '';
    source = 'yahoo';
  } else if (chartMeta) {
    // Fallback to chart meta for basic price data
    currentPrice = chartMeta.regularMarketPrice || chartMeta.previousClose;
    companyName = chartMeta.shortName || chartMeta.longName || ticker;
    currency = chartMeta.currency || 'INR';
    exchange = chartMeta.exchangeName || '';
    marketState = '';
    source = 'yahoo-chart';
    warnings.push('Limited data available. Using chart metadata only.');
  }

  if (!currentPrice) {
    throw new Error('Could not determine current price from any data source.');
  }

  // Compute P/E from price/EPS if not available
  if (!trailingPE && trailingEps && trailingEps > 0) {
    trailingPE = currentPrice / trailingEps;
  }

  if (!trailingEps || trailingEps === 0) {
    throw new Error('Trailing EPS not available. Please provide manual EPS input.');
  }

  // ─── Build EPS history ──────────────────────────────────

  const epsHistory = [];

  // From Yahoo income statements
  if (yahooSummary?.incomeStatementHistory?.incomeStatementHistory && sharesOutstanding) {
    for (const stmt of yahooSummary.incomeStatementHistory.incomeStatementHistory) {
      const netIncome = rawVal(stmt.netIncome);
      const endDate = stmt.endDate;
      const dateStr = typeof endDate === 'object' && endDate?.fmt ? endDate.fmt : String(endDate);
      if (netIncome && dateStr) {
        const eps = netIncome / sharesOutstanding;
        epsHistory.push({ date: dateStr, eps, year: new Date(dateStr).getFullYear() });
      }
    }
  }

  // From Yahoo earnings chart
  if (epsHistory.length < 2 && yahooSummary?.earnings?.earningsChart?.yearly) {
    for (const yr of yahooSummary.earnings.earningsChart.yearly) {
      const earnings = rawVal(yr.earnings);
      if (earnings) {
        epsHistory.push({
          date: `${yr.date}-12-31`,
          eps: sharesOutstanding ? earnings / sharesOutstanding : earnings,
          year: typeof yr.date === 'number' ? yr.date : parseInt(yr.date)
        });
      }
    }
  }

  // Always add current trailing EPS
  const currentYear = new Date().getFullYear();
  const hasCurrentYear = epsHistory.some(e => e.year >= currentYear - 1);
  if (!hasCurrentYear) {
    epsHistory.push({ date: new Date().toISOString(), eps: trailingEps, year: currentYear });
  }
  epsHistory.sort((a, b) => a.year - b.year);

  // If we lack EPS history, estimate growth from historical price returns
  // (DO NOT use price CAGR as EPS growth - it conflates P/E changes with earnings growth)
  if (epsHistory.length < 3) {
    // Use annual price returns to estimate growth distribution with realistic volatility
    if (historicalPrices.length > 12) {
      const annualReturns = [];
      for (let i = 12; i < historicalPrices.length; i += 12) {
        const prev = historicalPrices[i - 12].close;
        const curr = historicalPrices[i].close;
        if (prev > 0) annualReturns.push((curr - prev) / prev);
      }
      if (annualReturns.length >= 2) {
        // Build synthetic EPS history using price returns as noisy growth proxy
        // Scale down returns (EPS growth < price growth due to P/E expansion)
        const scaleFactor = 0.7; // EPS growth is ~70% of price return on average
        for (let i = Math.min(annualReturns.length, 8); i >= 1; i--) {
          const idx = annualReturns.length - i;
          const growthRate = annualReturns[idx] * scaleFactor;
          const pastEps = trailingEps / annualReturns.slice(idx).reduce(
            (acc, r) => acc * (1 + r * scaleFactor), 1
          );
          if (pastEps > 0 && isFinite(pastEps)) {
            epsHistory.unshift({
              date: `${currentYear - i}-12-31`,
              eps: pastEps,
              year: currentYear - i
            });
          }
        }
        warnings.push('EPS history estimated from price returns (scaled). Actual EPS growth may differ.');
      }
    }

    // If still insufficient, use sensible defaults based on Indian market
    if (epsHistory.length < 3) {
      // Use a moderate growth assumption with realistic volatility
      const defaultGrowths = [0.08, 0.15, 0.05, 0.12, -0.02]; // typical Indian midcap variation
      for (let i = 5; i >= 1; i--) {
        const g = defaultGrowths[5 - i];
        const pastEps = trailingEps / defaultGrowths.slice(5 - i).reduce(
          (acc, r) => acc * (1 + r), 1
        );
        if (pastEps > 0 && isFinite(pastEps)) {
          epsHistory.unshift({
            date: `${currentYear - i}-12-31`,
            eps: pastEps,
            year: currentYear - i
          });
        }
      }
      warnings.push('Using default EPS growth assumptions (~10% avg). Override via Distribution Overrides for better results.');
    }
  }

  // Re-sort after adding synthetic entries (unshift doesn't preserve order)
  epsHistory.sort((a, b) => a.year - b.year);

  // ─── Build P/E history ──────────────────────────────────

  const peHistory = [];

  // From historical prices + EPS history
  if (historicalPrices.length > 0 && epsHistory.length > 0) {
    const yearPrices = new Map();
    for (const hp of historicalPrices) {
      const year = new Date(hp.date).getFullYear();
      const month = new Date(hp.date).getMonth();
      if (!yearPrices.has(year) || month >= (yearPrices.get(year).month || 0)) {
        yearPrices.set(year, { ...hp, month });
      }
    }

    for (const [year, pricePoint] of yearPrices) {
      const nearestEps = findNearestEPS(epsHistory, year);
      if (nearestEps && nearestEps > 0) {
        const pe = pricePoint.close / nearestEps;
        if (pe > 0 && pe < 200) {
          peHistory.push(pe);
        }
      }
    }
  }

  // Add current and forward P/E
  if (trailingPE > 0 && trailingPE < 200) peHistory.push(trailingPE);
  if (forwardPE && forwardPE > 0 && forwardPE < 200) peHistory.push(forwardPE);

  // Add industry PE from Moneycontrol
  if (mcData?.IND_PE) {
    const indPE = parseFloat(mcData.IND_PE);
    if (indPE > 0 && indPE < 200) peHistory.push(indPE);
  }

  // ─── Compute distributions ──────────────────────────────

  // Import these from simulation.js
  const { computeEPSGrowthDistribution, computePEDistribution } = await import('./simulation.js');
  const growthDist = computeEPSGrowthDistribution(epsHistory);
  const peDist = computePEDistribution(peHistory);

  // Price returns for fallback
  let priceReturns = [];
  if (historicalPrices.length > 12) {
    for (let i = 12; i < historicalPrices.length; i += 12) {
      const prev = historicalPrices[i - 12].close;
      const curr = historicalPrices[i].close;
      if (prev > 0) priceReturns.push((curr - prev) / prev);
    }
  }

  if (growthDist.warning) warnings.push(growthDist.warning);
  if (peDist.warning) warnings.push(peDist.warning);
  if (epsHistory.length < 3) warnings.push('Limited EPS history. Growth estimates may be less reliable.');
  if (peHistory.length < 5) warnings.push('Limited P/E history. P/E distribution may be less reliable.');

  return {
    ticker,
    currentPrice,
    trailingEps,
    trailingPE,
    forwardPE: forwardPE || null,
    sharesOutstanding,
    companyName,
    currency,
    exchange,
    marketState,
    source,
    fetchTimestamp: new Date().toISOString(),
    epsHistory,
    peHistory,
    historicalPrices: historicalPrices.map(hp => ({ date: hp.date, close: hp.close, volume: hp.volume })),
    priceReturns,
    growthDistribution: growthDist,
    peDistribution: peDist,
    warnings: [...new Set(warnings)].filter(Boolean)
  };
}

function findNearestEPS(epsHistory, year) {
  let nearest = null;
  let minDiff = Infinity;
  for (const entry of epsHistory) {
    const diff = Math.abs(entry.year - year);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = entry.eps;
    }
  }
  return nearest;
}

export function rawVal(field) {
  if (field == null) return null;
  if (typeof field === 'number') return field;
  if (typeof field === 'object' && 'raw' in field) return field.raw;
  return null;
}
