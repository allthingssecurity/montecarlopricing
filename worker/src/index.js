/**
 * Cloudflare Worker — Monte Carlo Valuation API
 * Bundles: data fetching (Moneycontrol + Yahoo) + simulation engine
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ════════════════════════════════════════════════════════════════
//  CORS helper
// ════════════════════════════════════════════════════════════════

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// ════════════════════════════════════════════════════════════════
//  Robust Statistics
// ════════════════════════════════════════════════════════════════

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(arr) {
  const med = median(arr);
  return median(arr.map(x => Math.abs(x - med)));
}

function madSigma(arr) { return mad(arr) * 1.4826; }

function iqrSigma(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  return (q3 - q1) / 1.349;
}

function robustSigma(arr) { return Math.min(madSigma(arr), iqrSigma(arr)); }

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ════════════════════════════════════════════════════════════════
//  EPS / PE Distribution
// ════════════════════════════════════════════════════════════════

function computeEPSGrowthDistribution(epsHistory) {
  if (!epsHistory || epsHistory.length < 2) {
    return { meanGrowth: 0.10, sigmaGrowth: 0.15, growthRates: [], dataPoints: 0, warning: 'Insufficient EPS history. Using default growth assumptions (10% ± 15%).' };
  }
  const growthRates = [];
  for (let i = 1; i < epsHistory.length; i++) {
    const prev = epsHistory[i - 1].eps, curr = epsHistory[i].eps;
    if (prev > 0 && curr != null) growthRates.push((curr - prev) / Math.abs(prev));
  }
  if (growthRates.length < 2) {
    return { meanGrowth: 0.10, sigmaGrowth: 0.15, growthRates, dataPoints: growthRates.length, warning: 'Too few valid growth data points. Using default assumptions.' };
  }
  const computed = robustSigma(growthRates);
  const MIN = 0.10;
  const sigma = Math.max(computed, MIN);
  return {
    meanGrowth: median(growthRates),
    sigmaGrowth: sigma,
    growthRates,
    dataPoints: growthRates.length,
    warning: computed < MIN ? `Computed growth volatility (${(computed * 100).toFixed(1)}%) was too low; floored to ${(MIN * 100).toFixed(0)}%.` : null
  };
}

function computePEDistribution(peHistory) {
  if (!peHistory || peHistory.length < 3) {
    return { meanPE: 25, sigmaPE: 8, peValues: [], dataPoints: 0, warning: 'Insufficient P/E history. Using default P/E assumptions (25 ± 8).' };
  }
  const valid = peHistory.filter(pe => pe > 0 && pe < 200);
  if (valid.length < 3) {
    return { meanPE: 25, sigmaPE: 8, peValues: valid, dataPoints: valid.length, warning: 'Too few valid P/E data points. Using default assumptions.' };
  }
  const computed = robustSigma(valid);
  const MIN_PE = 3.0;
  return {
    meanPE: median(valid),
    sigmaPE: Math.max(computed, MIN_PE),
    peValues: valid,
    dataPoints: valid.length,
    warning: computed < MIN_PE ? `Computed P/E volatility (${computed.toFixed(1)}) was too low; floored to ${MIN_PE}.` : null
  };
}

// ════════════════════════════════════════════════════════════════
//  Monte Carlo Simulation
// ════════════════════════════════════════════════════════════════

function boxMullerNormal() {
  let u1; do { u1 = Math.random(); } while (u1 === 0);
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * Math.random());
}

function sampleTruncatedNormal(mean, sigma, min, max) {
  for (let a = 0; a < 100; a++) {
    const val = mean + sigma * boxMullerNormal();
    if (val >= min && val <= max) return val;
  }
  return Math.max(min, Math.min(max, mean));
}

function buildHistogram(values, numBins) {
  const mn = Math.min(...values), mx = Math.max(...values);
  const bw = (mx - mn) / numBins;
  if (bw === 0) return [{ binStart: mn, binEnd: mn, binMid: mn, count: values.length, frequency: 1 }];
  const bins = Array.from({ length: numBins }, (_, i) => ({
    binStart: mn + i * bw, binEnd: mn + (i + 1) * bw, binMid: mn + (i + 0.5) * bw, count: 0, frequency: 0
  }));
  for (const v of values) { let idx = Math.floor((v - mn) / bw); if (idx >= numBins) idx = numBins - 1; if (idx < 0) idx = 0; bins[idx].count++; }
  for (const b of bins) b.frequency = b.count / values.length;
  return bins;
}

function runSimulation({ price0, eps0, pe0, years, numSimulations, fdRate, meanGrowth, sigmaGrowth, meanPE, sigmaPE, growthMin = -0.20, growthMax = 0.40, peMin = 5, peMax = 60 }) {
  const results = [], fdTarget = price0 * Math.pow(1 + fdRate, years);
  for (let i = 0; i < numSimulations; i++) {
    const g = sampleTruncatedNormal(meanGrowth, sigmaGrowth, growthMin, growthMax);
    const peT = sampleTruncatedNormal(meanPE, sigmaPE, peMin, peMax);
    const epsT = eps0 * Math.pow(1 + g, years);
    const priceT = epsT * peT;
    const cagr = Math.pow(priceT / price0, 1 / years) - 1;
    results.push({ g, peT, epsT, priceT, cagr, beatsFD: priceT > fdTarget, isLoss: priceT < price0 });
  }
  const prices = results.map(r => r.priceT), cagrs = results.map(r => r.cagr);
  const growths = results.map(r => r.g), pes = results.map(r => r.peT);
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const summary = {
    price: { p10: percentile(prices, 10), p25: percentile(prices, 25), p50: percentile(prices, 50), p75: percentile(prices, 75), p90: percentile(prices, 90), mean: avg(prices) },
    cagr: { p10: percentile(cagrs, 10), p25: percentile(cagrs, 25), p50: percentile(cagrs, 50), p75: percentile(cagrs, 75), p90: percentile(cagrs, 90), mean: avg(cagrs) },
    probBeatsFD: results.filter(r => r.beatsFD).length / numSimulations,
    probLoss: results.filter(r => r.isLoss).length / numSimulations,
    fdTarget, fdRate, years, numSimulations
  };
  const gP = { p25: percentile(growths, 25), p50: percentile(growths, 50), p75: percentile(growths, 75) };
  const peP = { p25: percentile(pes, 25), p50: percentile(pes, 50), p75: percentile(pes, 75) };
  const scenarios = [];
  for (const [gL, gV] of Object.entries(gP)) for (const [pL, pV] of Object.entries(peP)) {
    const e = eps0 * Math.pow(1 + gV, years), p = e * pV;
    scenarios.push({ growthLabel: gL, growthValue: gV, peLabel: pL, peValue: pV, epsT: e, priceT: p, cagr: Math.pow(p / price0, 1 / years) - 1 });
  }
  const medG = percentile(growths, 50), medPE = percentile(pes, 50);
  const vg = results.map(r => eps0 * Math.pow(1 + r.g, years) * medPE);
  const vp = results.map(r => eps0 * Math.pow(1 + medG, years) * r.peT);
  const variance = a => { const m = avg(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; };
  const varG = variance(vg), varP = variance(vp), tot = varG + varP;
  const sensitivity = { growthContribution: tot > 0 ? varG / tot : 0.5, peContribution: tot > 0 ? varP / tot : 0.5, varGrowth: varG, varPE: varP };
  const sampledResults = [];
  const step = Math.max(1, Math.floor(results.length / 2000));
  for (let i = 0; i < results.length; i += step) sampledResults.push(results[i]);
  return {
    summary, scenarios, sensitivity,
    distributions: { price: buildHistogram(prices, 50), cagr: buildHistogram(cagrs, 50), growth: buildHistogram(growths, 30), pe: buildHistogram(pes, 30) },
    inputParams: { price0, eps0, pe0, years, numSimulations, fdRate, meanGrowth, sigmaGrowth, meanPE, sigmaPE, growthMin, growthMax, peMin, peMax },
    sampledResults
  };
}

// ════════════════════════════════════════════════════════════════
//  Data Fetching (Moneycontrol + Yahoo)
// ════════════════════════════════════════════════════════════════

async function searchMoneycontrol(ticker) {
  const clean = ticker.replace(/\.(NS|BO)$/i, '');
  const url = `https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?classic=true&query=${encodeURIComponent(clean)}&type=1&format=json&callback=`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    for (const item of data) { if (item.sc_id) return item; }
    return data[0];
  } catch { return null; }
}

async function fetchMoneycontrolData(scId, exchange = 'nse') {
  const url = `https://priceapi.moneycontrol.com/pricefeed/${exchange}/equitycash/${scId}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.code === '200' && json.data) ? json.data : null;
  } catch { return null; }
}

async function fetchYahooChart(ticker, range = '10y', interval = '1mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
    if (!res.ok) return { prices: [], meta: null };
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return { prices: [], meta: null };
    const ts = result.timestamp || [], q = result.indicators?.quote?.[0] || {}, c = q.close || [], v = q.volume || [];
    const prices = [];
    for (let i = 0; i < ts.length; i++) if (c[i] != null) prices.push({ date: new Date(ts[i] * 1000).toISOString(), close: c[i], volume: v[i] || 0 });
    return { prices, meta: result.meta || null };
  } catch { return { prices: [], meta: null }; }
}

function rawVal(f) {
  if (f == null) return null;
  if (typeof f === 'number') return f;
  if (typeof f === 'object' && 'raw' in f) return f.raw;
  return null;
}

function findNearestEPS(hist, year) {
  let near = null, diff = Infinity;
  for (const e of hist) { const d = Math.abs(e.year - year); if (d < diff) { diff = d; near = e.eps; } }
  return near;
}

async function fetchStockData(ticker, lookbackYears = 8) {
  const warnings = [];
  let source = 'moneycontrol';

  const mcSearch = await searchMoneycontrol(ticker);
  let mcData = null;
  if (mcSearch?.sc_id) {
    const ex = ticker.endsWith('.BO') ? 'bse' : 'nse';
    mcData = await fetchMoneycontrolData(mcSearch.sc_id, ex);
  }

  const range = lookbackYears <= 5 ? '5y' : lookbackYears <= 10 ? '10y' : 'max';
  const { prices: historicalPrices, meta: chartMeta } = await fetchYahooChart(ticker, range, '1mo');

  let currentPrice, trailingEps, trailingPE, forwardPE, sharesOutstanding, companyName, currency, exchange, marketState;

  if (mcData) {
    currentPrice = parseFloat(mcData.pricecurrent) || parseFloat(mcData.LP);
    trailingEps = parseFloat(mcData.SC_TTM) || parseFloat(mcData.sc_ttm_cons);
    trailingPE = parseFloat(mcData.PE) || parseFloat(mcData.PECONS);
    forwardPE = parseFloat(mcData.PECONS) || null;
    sharesOutstanding = parseFloat(mcData.SHRS) || null;
    companyName = mcData.SC_FULLNM || mcSearch?.stock_name || ticker;
    currency = 'INR'; exchange = mcData.exchange === 'B' ? 'BSE' : 'NSE';
    marketState = mcData.market_state || ''; source = 'moneycontrol';
  } else if (chartMeta) {
    currentPrice = chartMeta.regularMarketPrice || chartMeta.previousClose;
    companyName = chartMeta.shortName || chartMeta.longName || ticker;
    currency = chartMeta.currency || 'INR'; exchange = chartMeta.exchangeName || '';
    marketState = ''; source = 'yahoo-chart';
    warnings.push('Limited data from Moneycontrol. Using Yahoo chart metadata.');
  }

  if (!currentPrice) throw new Error('Could not determine current price from any source.');
  if (!trailingPE && trailingEps && trailingEps > 0) trailingPE = currentPrice / trailingEps;
  if (!trailingEps || trailingEps === 0) throw new Error('Trailing EPS not available. Please provide manual EPS input.');

  // Build EPS history
  const epsHistory = [];
  const currentYear = new Date().getFullYear();
  epsHistory.push({ date: new Date().toISOString(), eps: trailingEps, year: currentYear });
  epsHistory.sort((a, b) => a.year - b.year);

  if (epsHistory.length < 3) {
    if (historicalPrices.length > 12) {
      const annRet = [];
      for (let i = 12; i < historicalPrices.length; i += 12) {
        const prev = historicalPrices[i - 12].close, curr = historicalPrices[i].close;
        if (prev > 0) annRet.push((curr - prev) / prev);
      }
      if (annRet.length >= 2) {
        const sf = 0.7;
        for (let i = Math.min(annRet.length, 8); i >= 1; i--) {
          const idx = annRet.length - i;
          const pastEps = trailingEps / annRet.slice(idx).reduce((a, r) => a * (1 + r * sf), 1);
          if (pastEps > 0 && isFinite(pastEps)) epsHistory.unshift({ date: `${currentYear - i}-12-31`, eps: pastEps, year: currentYear - i });
        }
        warnings.push('EPS history estimated from price returns (scaled). Actual EPS growth may differ.');
      }
    }
    if (epsHistory.length < 3) {
      const dg = [0.08, 0.15, 0.05, 0.12, -0.02];
      for (let i = 5; i >= 1; i--) {
        const pastEps = trailingEps / dg.slice(5 - i).reduce((a, r) => a * (1 + r), 1);
        if (pastEps > 0 && isFinite(pastEps)) epsHistory.unshift({ date: `${currentYear - i}-12-31`, eps: pastEps, year: currentYear - i });
      }
      warnings.push('Using default EPS growth assumptions (~10% avg). Override via Distribution Overrides for better results.');
    }
  }
  epsHistory.sort((a, b) => a.year - b.year);

  // Build PE history
  const peHistory = [];
  if (historicalPrices.length > 0 && epsHistory.length > 0) {
    const yp = new Map();
    for (const hp of historicalPrices) { const y = new Date(hp.date).getFullYear(), m = new Date(hp.date).getMonth(); if (!yp.has(y) || m >= (yp.get(y).month || 0)) yp.set(y, { ...hp, month: m }); }
    for (const [yr, pp] of yp) { const e = findNearestEPS(epsHistory, yr); if (e && e > 0) { const pe = pp.close / e; if (pe > 0 && pe < 200) peHistory.push(pe); } }
  }
  if (trailingPE > 0 && trailingPE < 200) peHistory.push(trailingPE);
  if (forwardPE && forwardPE > 0 && forwardPE < 200) peHistory.push(forwardPE);
  if (mcData?.IND_PE) { const ip = parseFloat(mcData.IND_PE); if (ip > 0 && ip < 200) peHistory.push(ip); }

  const growthDist = computeEPSGrowthDistribution(epsHistory);
  const peDist = computePEDistribution(peHistory);

  let priceReturns = [];
  if (historicalPrices.length > 12) {
    for (let i = 12; i < historicalPrices.length; i += 12) {
      const prev = historicalPrices[i - 12].close, curr = historicalPrices[i].close;
      if (prev > 0) priceReturns.push((curr - prev) / prev);
    }
  }

  if (growthDist.warning) warnings.push(growthDist.warning);
  if (peDist.warning) warnings.push(peDist.warning);
  if (peHistory.length < 5) warnings.push('Limited P/E history. P/E distribution may be less reliable.');

  return {
    ticker, currentPrice, trailingEps, trailingPE, forwardPE: forwardPE || null,
    sharesOutstanding, companyName, currency, exchange, marketState, source,
    fetchTimestamp: new Date().toISOString(), epsHistory, peHistory,
    historicalPrices: historicalPrices.map(hp => ({ date: hp.date, close: hp.close, volume: hp.volume })),
    priceReturns, growthDistribution: growthDist, peDistribution: peDist,
    warnings: [...new Set(warnings)].filter(Boolean)
  };
}

// ════════════════════════════════════════════════════════════════
//  Worker Entry Point
// ════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const path = url.pathname;

    try {
      // Health check
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() }, 200, origin);
      }

      // Stock data
      const stockMatch = path.match(/^\/api\/stock\/(.+)$/);
      if (stockMatch && request.method === 'GET') {
        const ticker = decodeURIComponent(stockMatch[1]);
        const lookback = parseInt(url.searchParams.get('lookbackYears')) || 8;
        const result = await fetchStockData(ticker, lookback);
        return jsonResponse(result, 200, origin);
      }

      // Simulation
      if (path === '/api/simulate' && request.method === 'POST') {
        const body = await request.json();
        if (!body.price0 || !body.eps0) return jsonResponse({ error: 'price0 and eps0 are required.' }, 400, origin);
        const result = runSimulation({
          price0: body.price0, eps0: body.eps0, pe0: body.pe0 || (body.price0 / body.eps0),
          years: body.years || 5, numSimulations: Math.min(body.numSimulations || 20000, 50000),
          fdRate: body.fdRate || 0.07,
          meanGrowth: body.meanGrowth, sigmaGrowth: body.sigmaGrowth,
          meanPE: body.meanPE, sigmaPE: body.sigmaPE,
          growthMin: body.growthMin ?? -0.20, growthMax: body.growthMax ?? 0.40,
          peMin: body.peMin ?? 5, peMax: body.peMax ?? 60
        });
        return jsonResponse(result, 200, origin);
      }

      // CSV download
      if (path === '/api/simulate/csv' && request.method === 'POST') {
        const body = await request.json();
        if (!body.price0 || !body.eps0) return jsonResponse({ error: 'price0 and eps0 are required.' }, 400, origin);
        const result = runSimulation(body);
        const csv = ['SimulationIndex,GrowthRate,TerminalPE,TerminalEPS,TerminalPrice,CAGR,BeatsFD,IsLoss'];
        // Use rawResults from full simulation (before sampling)
        const raw = result.sampledResults || [];
        raw.forEach((r, i) => {
          csv.push(`${i + 1},${r.g.toFixed(6)},${r.peT.toFixed(2)},${r.epsT.toFixed(4)},${r.priceT.toFixed(2)},${r.cagr.toFixed(6)},${r.beatsFD},${r.isLoss}`);
        });
        return new Response(csv.join('\n'), {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename=monte_carlo_${body.ticker || 'simulation'}.csv`,
            ...corsHeaders(origin)
          }
        });
      }

      return jsonResponse({ error: 'Not found' }, 404, origin);
    } catch (err) {
      return jsonResponse({ error: err.message || 'Internal error' }, 500, origin);
    }
  }
};
