import { useState, useCallback } from 'react';
import { Download, BarChart3 } from 'lucide-react';
import InputPanel from './components/InputPanel';
import StockSnapshot from './components/StockSnapshot';
import SimulationSummary from './components/SimulationSummary';
import DistributionCharts from './components/DistributionCharts';
import ScenarioTable from './components/ScenarioTable';
import SensitivityAnalysis from './components/SensitivityAnalysis';
import type { StockData, SimulationOutput, SimParams } from './types';
import './App.css';

const API_BASE = import.meta.env.PROD
  ? 'https://montecarlo-api.jain-sm.workers.dev/api'
  : 'http://localhost:3001/api';

function App() {
  const [params, setParams] = useState<SimParams>({
    ticker: 'FINEORG.NS',
    years: 5,
    numSimulations: 20000,
    fdRate: 0.07,
    lookbackYears: 8,
    overrideMeanGrowth: '',
    overrideSigmaGrowth: '',
    overrideMeanPE: '',
    overrideSigmaPE: '',
    overrideEps: ''
  });

  const [stockData, setStockData] = useState<StockData | null>(null);
  const [simResult, setSimResult] = useState<SimulationOutput | null>(null);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [isLoadingSimulation, setIsLoadingSimulation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStock = useCallback(async () => {
    if (!params.ticker) return;
    setIsLoadingStock(true);
    setError(null);
    setSimResult(null);

    try {
      const res = await fetch(
        `${API_BASE}/stock/${encodeURIComponent(params.ticker)}?lookbackYears=${params.lookbackYears}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to fetch stock data');
        setStockData(null);
        return;
      }

      setStockData(data);
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}. Is the backend running on port 3001?`);
      setStockData(null);
    } finally {
      setIsLoadingStock(false);
    }
  }, [params.ticker, params.lookbackYears]);

  const buildSimParams = useCallback(() => {
    if (!stockData) return null;

    const eps0 = params.overrideEps
      ? parseFloat(params.overrideEps)
      : stockData.trailingEps;

    return {
      ticker: params.ticker,
      price0: stockData.currentPrice,
      eps0,
      pe0: stockData.trailingPE || stockData.currentPrice / eps0,
      years: params.years,
      numSimulations: params.numSimulations,
      fdRate: params.fdRate,
      meanGrowth: params.overrideMeanGrowth
        ? parseFloat(params.overrideMeanGrowth) / 100
        : stockData.growthDistribution.meanGrowth,
      sigmaGrowth: params.overrideSigmaGrowth
        ? parseFloat(params.overrideSigmaGrowth) / 100
        : stockData.growthDistribution.sigmaGrowth,
      meanPE: params.overrideMeanPE
        ? parseFloat(params.overrideMeanPE)
        : stockData.peDistribution.meanPE,
      sigmaPE: params.overrideSigmaPE
        ? parseFloat(params.overrideSigmaPE)
        : stockData.peDistribution.sigmaPE,
    };
  }, [stockData, params]);

  const runSimulation = useCallback(async () => {
    const simParams = buildSimParams();
    if (!simParams) return;
    setIsLoadingSimulation(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simParams)
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Simulation failed');
        return;
      }

      setSimResult(data);
    } catch (err) {
      setError(`Simulation error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setIsLoadingSimulation(false);
    }
  }, [buildSimParams]);

  const downloadCSV = useCallback(async () => {
    const simParams = buildSimParams();
    if (!simParams) return;

    try {
      const res = await fetch(`${API_BASE}/simulate/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simParams)
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monte_carlo_${params.ticker}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`CSV download failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }, [buildSimParams, params.ticker]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <BarChart3 size={28} />
          <div>
            <h1>Monte Carlo Valuation Engine</h1>
            <p className="subtitle">EPS x P/E probabilistic stock valuation</p>
          </div>
        </div>
        {simResult && (
          <button className="btn btn-outline btn-download" onClick={downloadCSV}>
            <Download size={16} />
            Download CSV
          </button>
        )}
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <InputPanel
            params={params}
            onParamsChange={setParams}
            onFetchStock={fetchStock}
            onRunSimulation={runSimulation}
            isLoadingStock={isLoadingStock}
            isLoadingSimulation={isLoadingSimulation}
            hasStockData={!!stockData}
          />
        </aside>

        <section className="content">
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button className="error-dismiss" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          {!stockData && !isLoadingStock && !error && (
            <div className="empty-state">
              <BarChart3 size={64} strokeWidth={1} />
              <h2>Enter a ticker to begin</h2>
              <p>
                Fetch real-time stock data from Yahoo Finance, then run a Monte Carlo
                simulation to estimate future valuations using EPS growth and P/E multiple distributions.
              </p>
              <div className="example-tickers">
                <span>Try:</span>
                {['FINEORG.NS', 'TCS.NS', 'RELIANCE.NS', 'INFY.NS'].map(t => (
                  <button
                    key={t}
                    className="example-ticker-btn"
                    onClick={() => setParams(p => ({ ...p, ticker: t }))}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {stockData && (
            <StockSnapshot data={stockData} />
          )}

          {simResult && stockData && (
            <>
              <SimulationSummary result={simResult} currency={stockData.currency} />
              <DistributionCharts result={simResult} stockData={stockData} />
              <ScenarioTable result={simResult} currency={stockData.currency} />
              <SensitivityAnalysis result={simResult} />
            </>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <p>
          Data sourced from Yahoo Finance. Simulation results are for educational purposes only and do not constitute financial advice.
          Past performance does not guarantee future results.
        </p>
      </footer>
    </div>
  );
}

export default App;
