import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { SimulationOutput } from '../types';

interface SensitivityAnalysisProps {
  result: SimulationOutput;
}

export default function SensitivityAnalysis({ result }: SensitivityAnalysisProps) {
  const { sensitivity, inputParams } = result;

  const pieData = [
    { name: 'EPS Growth', value: sensitivity.growthContribution, color: '#6c5ce7' },
    { name: 'P/E Multiple', value: sensitivity.peContribution, color: '#00d2d3' }
  ];

  const growthPct = (sensitivity.growthContribution * 100).toFixed(1);
  const pePct = (sensitivity.peContribution * 100).toFixed(1);

  const dominant = sensitivity.growthContribution > sensitivity.peContribution ? 'EPS growth' : 'P/E multiple';
  const dominantPct = Math.max(sensitivity.growthContribution, sensitivity.peContribution) * 100;

  return (
    <div className="sensitivity-section">
      <h2>What Drove Results?</h2>
      <p className="section-description">
        Variance decomposition showing how much of the price outcome uncertainty comes from EPS growth vs. P/E multiple changes.
      </p>

      <div className="sensitivity-content">
        <div className="sensitivity-chart">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                strokeWidth={0}
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: unknown) => `${(Number(value) * 100).toFixed(1)}%`}
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pie-center-label">Variance<br />Split</div>
        </div>

        <div className="sensitivity-details">
          <div className="sensitivity-bar">
            <div className="bar-label">
              <span className="bar-dot" style={{ background: '#6c5ce7' }} />
              EPS Growth
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${growthPct}%`, background: '#6c5ce7' }}>
                <span className="bar-value">{growthPct}%</span>
              </div>
            </div>
          </div>

          <div className="sensitivity-bar">
            <div className="bar-label">
              <span className="bar-dot" style={{ background: '#00d2d3' }} />
              P/E Multiple
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pePct}%`, background: '#00d2d3' }}>
                <span className="bar-value">{pePct}%</span>
              </div>
            </div>
          </div>

          <div className="sensitivity-insight">
            <strong>Insight:</strong> The {dominant} is the dominant driver of valuation uncertainty,
            accounting for {dominantPct.toFixed(0)}% of outcome variance.
            {dominantPct > 70 && ` This means your conviction on ${dominant} matters more than getting the other factor right.`}
            {dominantPct <= 55 && ' Both factors contribute roughly equally — consider both growth trajectory and multiple compression/expansion.'}
          </div>

          <div className="param-summary">
            <h4>Simulation Parameters Used</h4>
            <div className="param-grid">
              <div className="param-item">
                <span className="param-label">EPS Growth (mean)</span>
                <span className="param-value">{(inputParams.meanGrowth * 100).toFixed(1)}%</span>
              </div>
              <div className="param-item">
                <span className="param-label">Growth Vol (σ)</span>
                <span className="param-value">{(inputParams.sigmaGrowth * 100).toFixed(1)}%</span>
              </div>
              <div className="param-item">
                <span className="param-label">Mean P/E</span>
                <span className="param-value">{inputParams.meanPE.toFixed(1)}x</span>
              </div>
              <div className="param-item">
                <span className="param-label">P/E Vol (σ)</span>
                <span className="param-value">{inputParams.sigmaPE.toFixed(1)}</span>
              </div>
              <div className="param-item">
                <span className="param-label">Growth Range</span>
                <span className="param-value">[{(inputParams.growthMin * 100).toFixed(0)}%, {(inputParams.growthMax * 100).toFixed(0)}%]</span>
              </div>
              <div className="param-item">
                <span className="param-label">P/E Range</span>
                <span className="param-value">[{inputParams.peMin}, {inputParams.peMax}]</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
