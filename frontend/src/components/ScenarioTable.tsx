import type { SimulationOutput } from '../types';

interface ScenarioTableProps {
  result: SimulationOutput;
  currency: string;
}

export default function ScenarioTable({ result, currency }: ScenarioTableProps) {
  const { scenarios, inputParams } = result;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val);

  const formatPct = (val: number) => `${(val * 100).toFixed(1)}%`;

  const labelMap: Record<string, string> = {
    p25: 'P25 (Conservative)',
    p50: 'P50 (Base)',
    p75: 'P75 (Optimistic)'
  };

  // Organize into a 3x3 matrix: rows = growth, cols = P/E
  const growthLabels = ['p25', 'p50', 'p75'];
  const peLabels = ['p25', 'p50', 'p75'];

  const getScenario = (gLabel: string, peLabel: string) =>
    scenarios.find(s => s.growthLabel === gLabel && s.peLabel === peLabel);

  return (
    <div className="scenario-table-section">
      <h2>Scenario Matrix</h2>
      <p className="section-description">
        Growth percentiles (rows) crossed with P/E percentiles (columns). Prices and CAGRs for each combination.
      </p>

      <div className="scenario-table-wrapper">
        <table className="scenario-table">
          <thead>
            <tr>
              <th className="corner-cell">
                <div className="corner-label">
                  <span className="corner-row">Growth &darr;</span>
                  <span className="corner-col">P/E &rarr;</span>
                </div>
              </th>
              {peLabels.map(pe => {
                const scenario = getScenario('p50', pe);
                return (
                  <th key={pe} className="pe-header">
                    <div>{labelMap[pe]}</div>
                    <div className="header-value">{scenario?.peValue.toFixed(1)}x</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {growthLabels.map(g => (
              <tr key={g}>
                <td className="growth-header">
                  <div>{labelMap[g]}</div>
                  <div className="header-value">{formatPct(getScenario(g, 'p50')?.growthValue || 0)}</div>
                </td>
                {peLabels.map(pe => {
                  const scenario = getScenario(g, pe);
                  if (!scenario) return <td key={pe}>-</td>;
                  const upside = ((scenario.priceT - inputParams.price0) / inputParams.price0) * 100;
                  const isPositive = scenario.cagr >= 0;
                  const beatsFD = scenario.cagr >= inputParams.fdRate;
                  return (
                    <td key={pe} className={`scenario-cell ${beatsFD ? 'beats-fd' : isPositive ? 'positive-cell' : 'negative-cell'}`}>
                      <div className="scenario-price">{formatCurrency(scenario.priceT)}</div>
                      <div className={`scenario-cagr ${scenario.cagr >= 0 ? 'text-green' : 'text-red'}`}>
                        CAGR: {formatPct(scenario.cagr)}
                      </div>
                      <div className={`scenario-upside ${upside >= 0 ? 'text-green' : 'text-red'}`}>
                        {upside >= 0 ? '+' : ''}{upside.toFixed(0)}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="scenario-legend">
        <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(0, 184, 148, 0.2)' }} /> Beats FD hurdle</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(253, 203, 110, 0.15)' }} /> Positive return</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(225, 112, 85, 0.15)' }} /> Negative return</span>
      </div>
    </div>
  );
}
