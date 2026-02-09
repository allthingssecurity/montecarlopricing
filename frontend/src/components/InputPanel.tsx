import { useState } from 'react';
import { Search, Play, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import type { SimParams } from '../types';

interface InputPanelProps {
  params: SimParams;
  onParamsChange: (params: SimParams) => void;
  onFetchStock: () => void;
  onRunSimulation: () => void;
  isLoadingStock: boolean;
  isLoadingSimulation: boolean;
  hasStockData: boolean;
}

export default function InputPanel({
  params,
  onParamsChange,
  onFetchStock,
  onRunSimulation,
  isLoadingStock,
  isLoadingSimulation,
  hasStockData
}: InputPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (key: keyof SimParams, value: string | number) => {
    onParamsChange({ ...params, [key]: value });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onFetchStock();
  };

  return (
    <div className="input-panel">
      <div className="panel-header">
        <h2>Simulation Parameters</h2>
      </div>

      <div className="input-section">
        <label className="input-label">Ticker Symbol</label>
        <div className="ticker-input-row">
          <input
            type="text"
            className="input-field ticker-input"
            value={params.ticker}
            onChange={e => update('ticker', e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="e.g. FINEORG.NS"
          />
          <button
            className="btn btn-primary btn-fetch"
            onClick={onFetchStock}
            disabled={isLoadingStock || !params.ticker}
          >
            {isLoadingStock ? (
              <span className="spinner" />
            ) : (
              <Search size={16} />
            )}
            {isLoadingStock ? 'Loading...' : 'Fetch'}
          </button>
        </div>
        <div className="ticker-hints">
          <span className="hint-chip" onClick={() => update('ticker', 'FINEORG.NS')}>FINEORG.NS</span>
          <span className="hint-chip" onClick={() => update('ticker', 'VINATIORGA.NS')}>VINATIORGA.NS</span>
          <span className="hint-chip" onClick={() => update('ticker', 'DEEPAKNTR.NS')}>DEEPAKNTR.NS</span>
          <span className="hint-chip" onClick={() => update('ticker', 'TCS.NS')}>TCS.NS</span>
          <span className="hint-chip" onClick={() => update('ticker', 'RELIANCE.NS')}>RELIANCE.NS</span>
        </div>
      </div>

      <div className="input-grid">
        <div className="input-section">
          <label className="input-label">Horizon (years)</label>
          <input
            type="number"
            className="input-field"
            value={params.years}
            onChange={e => update('years', parseInt(e.target.value) || 5)}
            min={1}
            max={20}
          />
        </div>

        <div className="input-section">
          <label className="input-label">Simulations</label>
          <input
            type="number"
            className="input-field"
            value={params.numSimulations}
            onChange={e => update('numSimulations', parseInt(e.target.value) || 20000)}
            min={1000}
            max={100000}
            step={1000}
          />
        </div>

        <div className="input-section">
          <label className="input-label">FD Hurdle Rate</label>
          <div className="input-with-suffix">
            <input
              type="number"
              className="input-field"
              value={(params.fdRate * 100).toFixed(1)}
              onChange={e => update('fdRate', parseFloat(e.target.value) / 100 || 0.07)}
              step={0.5}
              min={0}
              max={30}
            />
            <span className="suffix">%</span>
          </div>
        </div>

        <div className="input-section">
          <label className="input-label">Lookback (years)</label>
          <input
            type="number"
            className="input-field"
            value={params.lookbackYears}
            onChange={e => update('lookbackYears', parseInt(e.target.value) || 8)}
            min={3}
            max={20}
          />
        </div>
      </div>

      <div className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        <Settings size={14} />
        <span>Distribution Overrides</span>
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      {showAdvanced && (
        <div className="advanced-section">
          <div className="override-note">Leave blank to use data-driven estimates</div>
          <div className="input-grid">
            <div className="input-section">
              <label className="input-label">Mean Growth (%)</label>
              <input
                type="text"
                className="input-field"
                value={params.overrideMeanGrowth}
                onChange={e => update('overrideMeanGrowth', e.target.value)}
                placeholder="auto"
              />
            </div>
            <div className="input-section">
              <label className="input-label">Growth Vol (%)</label>
              <input
                type="text"
                className="input-field"
                value={params.overrideSigmaGrowth}
                onChange={e => update('overrideSigmaGrowth', e.target.value)}
                placeholder="auto"
              />
            </div>
            <div className="input-section">
              <label className="input-label">Mean P/E</label>
              <input
                type="text"
                className="input-field"
                value={params.overrideMeanPE}
                onChange={e => update('overrideMeanPE', e.target.value)}
                placeholder="auto"
              />
            </div>
            <div className="input-section">
              <label className="input-label">P/E Vol</label>
              <input
                type="text"
                className="input-field"
                value={params.overrideSigmaPE}
                onChange={e => update('overrideSigmaPE', e.target.value)}
                placeholder="auto"
              />
            </div>
            <div className="input-section">
              <label className="input-label">Override EPS</label>
              <input
                type="text"
                className="input-field"
                value={params.overrideEps}
                onChange={e => update('overrideEps', e.target.value)}
                placeholder="auto"
              />
            </div>
          </div>
        </div>
      )}

      <button
        className="btn btn-accent btn-simulate"
        onClick={onRunSimulation}
        disabled={!hasStockData || isLoadingSimulation}
      >
        {isLoadingSimulation ? (
          <>
            <span className="spinner" />
            Running {params.numSimulations.toLocaleString()} simulations...
          </>
        ) : (
          <>
            <Play size={16} />
            Run Monte Carlo Simulation
          </>
        )}
      </button>
    </div>
  );
}
