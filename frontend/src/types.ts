export interface StockData {
  ticker: string;
  currentPrice: number;
  trailingEps: number;
  trailingPE: number;
  forwardPE: number | null;
  sharesOutstanding: number;
  companyName: string;
  currency: string;
  exchange: string;
  marketState: string;
  fetchTimestamp: string;

  epsHistory: Array<{ date: string; eps: number; year: number }>;
  peHistory: number[];
  historicalPrices: Array<{ date: string; close: number; volume: number }>;
  priceReturns: number[];

  growthDistribution: {
    meanGrowth: number;
    sigmaGrowth: number;
    growthRates: number[];
    dataPoints: number;
    warning: string | null;
  };
  peDistribution: {
    meanPE: number;
    sigmaPE: number;
    peValues: number[];
    dataPoints: number;
    warning: string | null;
  };

  warnings: string[];
}

export interface HistogramBin {
  binStart: number;
  binEnd: number;
  binMid: number;
  count: number;
  frequency: number;
}

export interface SimulationResult {
  g: number;
  peT: number;
  epsT: number;
  priceT: number;
  cagr: number;
  beatsFD: boolean;
  isLoss: boolean;
}

export interface Scenario {
  growthLabel: string;
  growthValue: number;
  peLabel: string;
  peValue: number;
  epsT: number;
  priceT: number;
  cagr: number;
}

export interface SimulationOutput {
  summary: {
    price: { p10: number; p25: number; p50: number; p75: number; p90: number; mean: number };
    cagr: { p10: number; p25: number; p50: number; p75: number; p90: number; mean: number };
    probBeatsFD: number;
    probLoss: number;
    fdTarget: number;
    fdRate: number;
    years: number;
    numSimulations: number;
  };
  scenarios: Scenario[];
  sensitivity: {
    growthContribution: number;
    peContribution: number;
    varGrowth: number;
    varPE: number;
  };
  distributions: {
    price: HistogramBin[];
    cagr: HistogramBin[];
    growth: HistogramBin[];
    pe: HistogramBin[];
  };
  inputParams: {
    price0: number;
    eps0: number;
    pe0: number;
    years: number;
    numSimulations: number;
    fdRate: number;
    meanGrowth: number;
    sigmaGrowth: number;
    meanPE: number;
    sigmaPE: number;
    growthMin: number;
    growthMax: number;
    peMin: number;
    peMax: number;
  };
  sampledResults: SimulationResult[];
}

export interface SimParams {
  ticker: string;
  years: number;
  numSimulations: number;
  fdRate: number;
  lookbackYears: number;
  overrideMeanGrowth: string;
  overrideSigmaGrowth: string;
  overrideMeanPE: string;
  overrideSigmaPE: string;
  overrideEps: string;
}
