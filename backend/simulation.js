/**
 * Monte Carlo EPS × P/E Valuation Simulation Engine
 *
 * Uses robust statistics (median, MAD) to avoid outlier distortion.
 * Supports truncated distributions for growth and P/E.
 */

// ─── Robust Statistics ───────────────────────────────────────────

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(arr) {
  const med = median(arr);
  const deviations = arr.map(x => Math.abs(x - med));
  return median(deviations);
}

function madSigma(arr) {
  // MAD-based sigma: MAD * 1.4826 ≈ std dev for normal distribution
  return mad(arr) * 1.4826;
}

function iqrSigma(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  return (q3 - q1) / 1.349; // IQR-based sigma for normal distribution
}

function robustSigma(arr) {
  const s1 = madSigma(arr);
  const s2 = iqrSigma(arr);
  return Math.min(s1, s2); // Use the more conservative estimate
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

// ─── Random Sampling ─────────────────────────────────────────────

function boxMullerNormal() {
  let u1, u2;
  do { u1 = Math.random(); } while (u1 === 0);
  u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function sampleTruncatedNormal(mean, sigma, min, max) {
  let val;
  let attempts = 0;
  do {
    val = mean + sigma * boxMullerNormal();
    attempts++;
    if (attempts > 100) return Math.max(min, Math.min(max, mean)); // fallback
  } while (val < min || val > max);
  return val;
}

// ─── EPS Growth Distribution ────────────────────────────────────

export function computeEPSGrowthDistribution(epsHistory) {
  if (!epsHistory || epsHistory.length < 2) {
    return {
      meanGrowth: 0.10,
      sigmaGrowth: 0.15,
      growthRates: [],
      dataPoints: 0,
      warning: 'Insufficient EPS history. Using default growth assumptions (10% ± 15%).'
    };
  }

  const growthRates = [];
  for (let i = 1; i < epsHistory.length; i++) {
    const prev = epsHistory[i - 1].eps;
    const curr = epsHistory[i].eps;
    if (prev > 0 && curr !== null && curr !== undefined) {
      growthRates.push((curr - prev) / Math.abs(prev));
    }
  }

  if (growthRates.length < 2) {
    return {
      meanGrowth: 0.10,
      sigmaGrowth: 0.15,
      growthRates,
      dataPoints: growthRates.length,
      warning: 'Too few valid growth data points. Using default assumptions.'
    };
  }

  const computedSigma = robustSigma(growthRates);
  // Enforce minimum volatility — real earnings never have 0% sigma
  const MIN_SIGMA_GROWTH = 0.10;
  const sigmaGrowthFinal = Math.max(computedSigma, MIN_SIGMA_GROWTH);
  const sigmaWarning = computedSigma < MIN_SIGMA_GROWTH
    ? `Computed growth volatility (${(computedSigma * 100).toFixed(1)}%) was too low; floored to ${(MIN_SIGMA_GROWTH * 100).toFixed(0)}%.`
    : null;

  return {
    meanGrowth: median(growthRates),
    sigmaGrowth: sigmaGrowthFinal,
    growthRates,
    dataPoints: growthRates.length,
    warning: sigmaWarning
  };
}

// ─── P/E Distribution ───────────────────────────────────────────

export function computePEDistribution(peHistory) {
  if (!peHistory || peHistory.length < 3) {
    return {
      meanPE: 25,
      sigmaPE: 8,
      peValues: [],
      dataPoints: 0,
      warning: 'Insufficient P/E history. Using default P/E assumptions (25 ± 8).'
    };
  }

  // Filter out extreme P/E values (negative or > 200)
  const validPEs = peHistory.filter(pe => pe > 0 && pe < 200);

  if (validPEs.length < 3) {
    return {
      meanPE: 25,
      sigmaPE: 8,
      peValues: validPEs,
      dataPoints: validPEs.length,
      warning: 'Too few valid P/E data points. Using default assumptions.'
    };
  }

  const computedPESigma = robustSigma(validPEs);
  const MIN_SIGMA_PE = 3.0; // P/E always has some spread
  const sigmaPEFinal = Math.max(computedPESigma, MIN_SIGMA_PE);

  return {
    meanPE: median(validPEs),
    sigmaPE: sigmaPEFinal,
    peValues: validPEs,
    dataPoints: validPEs.length,
    warning: computedPESigma < MIN_SIGMA_PE
      ? `Computed P/E volatility (${computedPESigma.toFixed(1)}) was too low; floored to ${MIN_SIGMA_PE}.`
      : null
  };
}

// ─── Monte Carlo Simulation ─────────────────────────────────────

export function runSimulation({
  price0,
  eps0,
  pe0,
  years,
  numSimulations,
  fdRate,
  meanGrowth,
  sigmaGrowth,
  meanPE,
  sigmaPE,
  growthMin = -0.20,
  growthMax = 0.40,
  peMin = 5,
  peMax = 60
}) {
  const results = [];
  const fdTarget = price0 * Math.pow(1 + fdRate, years);

  for (let i = 0; i < numSimulations; i++) {
    const g = sampleTruncatedNormal(meanGrowth, sigmaGrowth, growthMin, growthMax);
    const peT = sampleTruncatedNormal(meanPE, sigmaPE, peMin, peMax);
    const epsT = eps0 * Math.pow(1 + g, years);
    const priceT = epsT * peT;
    const cagr = Math.pow(priceT / price0, 1 / years) - 1;
    const beatsFD = priceT > fdTarget;
    const isLoss = priceT < price0;

    results.push({ g, peT, epsT, priceT, cagr, beatsFD, isLoss });
  }

  // Sort by priceT for percentile calculations
  const prices = results.map(r => r.priceT);
  const cagrs = results.map(r => r.cagr);
  const growths = results.map(r => r.g);
  const pes = results.map(r => r.peT);

  const summary = {
    price: {
      p10: percentile(prices, 10),
      p25: percentile(prices, 25),
      p50: percentile(prices, 50),
      p75: percentile(prices, 75),
      p90: percentile(prices, 90),
      mean: prices.reduce((a, b) => a + b, 0) / prices.length
    },
    cagr: {
      p10: percentile(cagrs, 10),
      p25: percentile(cagrs, 25),
      p50: percentile(cagrs, 50),
      p75: percentile(cagrs, 75),
      p90: percentile(cagrs, 90),
      mean: cagrs.reduce((a, b) => a + b, 0) / cagrs.length
    },
    probBeatsFD: results.filter(r => r.beatsFD).length / numSimulations,
    probLoss: results.filter(r => r.isLoss).length / numSimulations,
    fdTarget,
    fdRate,
    years,
    numSimulations
  };

  // ─── Scenario Table (Growth P25/P50/P75 × P/E P25/P50/P75) ───
  const gPercentiles = { p25: percentile(growths, 25), p50: percentile(growths, 50), p75: percentile(growths, 75) };
  const pePercentiles = { p25: percentile(pes, 25), p50: percentile(pes, 50), p75: percentile(pes, 75) };

  const scenarios = [];
  for (const [gLabel, gVal] of Object.entries(gPercentiles)) {
    for (const [peLabel, peVal] of Object.entries(pePercentiles)) {
      const epsScen = eps0 * Math.pow(1 + gVal, years);
      const priceScen = epsScen * peVal;
      const cagrScen = Math.pow(priceScen / price0, 1 / years) - 1;
      scenarios.push({
        growthLabel: gLabel,
        growthValue: gVal,
        peLabel: peLabel,
        peValue: peVal,
        epsT: epsScen,
        priceT: priceScen,
        cagr: cagrScen
      });
    }
  }

  // ─── Sensitivity Analysis ────────────────────────────────────
  // Simple variance decomposition:
  // fix P/E at median, vary growth → variance from growth
  // fix growth at median, vary P/E → variance from P/E
  const medianGrowth = percentile(growths, 50);
  const medianPE = percentile(pes, 50);

  const pricesVaryGrowth = results.map(r => {
    const epsFixed = eps0 * Math.pow(1 + r.g, years);
    return epsFixed * medianPE;
  });
  const pricesVaryPE = results.map(r => {
    const epsFixed = eps0 * Math.pow(1 + medianGrowth, years);
    return epsFixed * r.peT;
  });

  const variance = (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  };

  const varGrowth = variance(pricesVaryGrowth);
  const varPE = variance(pricesVaryPE);
  const totalVar = varGrowth + varPE;

  const sensitivity = {
    growthContribution: totalVar > 0 ? varGrowth / totalVar : 0.5,
    peContribution: totalVar > 0 ? varPE / totalVar : 0.5,
    varGrowth,
    varPE
  };

  // ─── Distribution Data for Charts ────────────────────────────
  const priceHistogram = buildHistogram(prices, 50);
  const cagrHistogram = buildHistogram(cagrs, 50);
  const growthHistogram = buildHistogram(growths, 30);
  const peHistogram = buildHistogram(pes, 30);

  return {
    summary,
    scenarios,
    sensitivity,
    distributions: {
      price: priceHistogram,
      cagr: cagrHistogram,
      growth: growthHistogram,
      pe: peHistogram
    },
    inputParams: {
      price0, eps0, pe0, years, numSimulations, fdRate,
      meanGrowth, sigmaGrowth, meanPE, sigmaPE,
      growthMin, growthMax, peMin, peMax
    },
    rawResults: results // For CSV download
  };
}

function buildHistogram(values, numBins) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = (max - min) / numBins;

  if (binWidth === 0) {
    return [{ binStart: min, binEnd: min, count: values.length, frequency: 1 }];
  }

  const bins = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({
      binStart: min + i * binWidth,
      binEnd: min + (i + 1) * binWidth,
      binMid: min + (i + 0.5) * binWidth,
      count: 0,
      frequency: 0
    });
  }

  for (const val of values) {
    let idx = Math.floor((val - min) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }

  const total = values.length;
  for (const bin of bins) {
    bin.frequency = bin.count / total;
  }

  return bins;
}
