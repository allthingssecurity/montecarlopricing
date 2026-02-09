import { TrendingUp, TrendingDown, Shield, AlertCircle } from 'lucide-react';
import type { SimulationOutput } from '../types';

interface SimulationSummaryProps {
  result: SimulationOutput;
  currency: string;
}

export default function SimulationSummary({ result, currency }: SimulationSummaryProps) {
  const { summary, inputParams } = result;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val);

  const formatPct = (val: number) => `${(val * 100).toFixed(1)}%`;

  const medianUpside = ((summary.price.p50 - inputParams.price0) / inputParams.price0) * 100;

  return (
    <div className="simulation-summary">
      <div className="summary-header">
        <h2>Simulation Results</h2>
        <div className="sim-meta">
          {summary.numSimulations.toLocaleString()} simulations &middot; {summary.years}Y horizon
        </div>
      </div>

      <div className="headline-cards">
        <div className={`headline-card ${medianUpside >= 0 ? 'positive' : 'negative'}`}>
          <div className="headline-icon">
            {medianUpside >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
          </div>
          <div className="headline-content">
            <div className="headline-label">Median Target Price</div>
            <div className="headline-value">{formatCurrency(summary.price.p50)}</div>
            <div className="headline-sub">
              {medianUpside >= 0 ? '+' : ''}{medianUpside.toFixed(1)}% from current {formatCurrency(inputParams.price0)}
            </div>
          </div>
        </div>

        <div className={`headline-card ${summary.cagr.p50 >= inputParams.fdRate ? 'positive' : 'warning'}`}>
          <div className="headline-icon">
            <TrendingUp size={24} />
          </div>
          <div className="headline-content">
            <div className="headline-label">Median CAGR</div>
            <div className="headline-value">{formatPct(summary.cagr.p50)}</div>
            <div className="headline-sub">
              vs FD hurdle {formatPct(summary.fdRate)}
            </div>
          </div>
        </div>

        <div className={`headline-card ${summary.probBeatsFD >= 0.5 ? 'positive' : 'warning'}`}>
          <div className="headline-icon">
            <Shield size={24} />
          </div>
          <div className="headline-content">
            <div className="headline-label">Prob. Beats FD</div>
            <div className="headline-value">{formatPct(summary.probBeatsFD)}</div>
            <div className="headline-sub">
              FD target: {formatCurrency(summary.fdTarget)}
            </div>
          </div>
        </div>

        <div className={`headline-card ${summary.probLoss <= 0.2 ? 'positive' : 'negative'}`}>
          <div className="headline-icon">
            <AlertCircle size={24} />
          </div>
          <div className="headline-content">
            <div className="headline-label">Prob. of Loss</div>
            <div className="headline-value">{formatPct(summary.probLoss)}</div>
            <div className="headline-sub">
              Price below {formatCurrency(inputParams.price0)}
            </div>
          </div>
        </div>
      </div>

      <div className="percentile-tables">
        <div className="percentile-table">
          <h3>Price Distribution</h3>
          <table>
            <thead>
              <tr>
                <th>Percentile</th>
                <th>Price</th>
                <th>vs Current</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'P10 (Bear)', key: 'p10' as const },
                { label: 'P25', key: 'p25' as const },
                { label: 'P50 (Median)', key: 'p50' as const },
                { label: 'P75', key: 'p75' as const },
                { label: 'P90 (Bull)', key: 'p90' as const }
              ].map(row => {
                const val = summary.price[row.key];
                const pctChange = ((val - inputParams.price0) / inputParams.price0) * 100;
                return (
                  <tr key={row.key} className={row.key === 'p50' ? 'highlight-row' : ''}>
                    <td>{row.label}</td>
                    <td className="mono">{formatCurrency(val)}</td>
                    <td className={`mono ${pctChange >= 0 ? 'text-green' : 'text-red'}`}>
                      {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="percentile-table">
          <h3>CAGR Distribution</h3>
          <table>
            <thead>
              <tr>
                <th>Percentile</th>
                <th>CAGR</th>
                <th>vs FD</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'P10 (Bear)', key: 'p10' as const },
                { label: 'P25', key: 'p25' as const },
                { label: 'P50 (Median)', key: 'p50' as const },
                { label: 'P75', key: 'p75' as const },
                { label: 'P90 (Bull)', key: 'p90' as const }
              ].map(row => {
                const val = summary.cagr[row.key];
                const diff = val - summary.fdRate;
                return (
                  <tr key={row.key} className={row.key === 'p50' ? 'highlight-row' : ''}>
                    <td>{row.label}</td>
                    <td className="mono">{formatPct(val)}</td>
                    <td className={`mono ${diff >= 0 ? 'text-green' : 'text-red'}`}>
                      {diff >= 0 ? '+' : ''}{(diff * 100).toFixed(1)}pp
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
