import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, ScatterChart, Scatter, Cell,
  AreaChart, Area
} from 'recharts';
import type { SimulationOutput, StockData } from '../types';

interface DistributionChartsProps {
  result: SimulationOutput;
  stockData: StockData;
}

export default function DistributionCharts({ result, stockData }: DistributionChartsProps) {
  const { distributions, summary, inputParams, sampledResults } = result;
  const currency = stockData.currency || 'INR';

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val);

  const formatPct = (val: number) => `${(val * 100).toFixed(1)}%`;

  // Price distribution data
  const priceData = distributions.price.map(bin => ({
    price: bin.binMid,
    frequency: bin.frequency,
    count: bin.count
  }));

  // CAGR distribution data
  const cagrData = distributions.cagr.map(bin => ({
    cagr: bin.binMid * 100,
    frequency: bin.frequency,
    count: bin.count,
    isPositive: bin.binMid >= 0
  }));

  // Scatter plot: growth vs terminal price
  const scatterData = sampledResults.map(r => ({
    growth: r.g * 100,
    pe: r.peT,
    price: r.priceT,
    cagr: r.cagr * 100
  }));

  // Historical price chart
  const historicalData = stockData.historicalPrices.map(hp => ({
    date: new Date(hp.date).toLocaleDateString('en-IN', { year: '2-digit', month: 'short' }),
    price: hp.close
  }));

  return (
    <div className="distribution-charts">
      <h2>Distribution Analysis</h2>

      <div className="charts-grid">
        {/* Terminal Price Distribution */}
        <div className="chart-card chart-large">
          <h3>Terminal Price Distribution ({inputParams.years}Y)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={priceData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="price"
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
              />
              <YAxis
                tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
              />
              <Tooltip
                formatter={(value: unknown) => [`${(Number(value) * 100).toFixed(2)}%`, 'Probability']}
                labelFormatter={(label: unknown) => `Price: ${formatCurrency(Number(label))}`}
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              />
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6c5ce7" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#6c5ce7" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="frequency"
                stroke="#6c5ce7"
                fill="url(#priceGradient)"
                strokeWidth={2}
              />
              <ReferenceLine
                x={inputParams.price0}
                stroke="#ff6b6b"
                strokeDasharray="4 4"
                label={{ value: 'Current', fill: '#ff6b6b', fontSize: 11, position: 'top' }}
              />
              <ReferenceLine
                x={summary.price.p50}
                stroke="#00d2d3"
                strokeDasharray="4 4"
                label={{ value: 'Median', fill: '#00d2d3', fontSize: 11, position: 'top' }}
              />
              <ReferenceLine
                x={summary.fdTarget}
                stroke="#feca57"
                strokeDasharray="4 4"
                label={{ value: 'FD Target', fill: '#feca57', fontSize: 11, position: 'top' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* CAGR Distribution */}
        <div className="chart-card chart-large">
          <h3>CAGR Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cagrData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="cagr"
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
              />
              <YAxis
                tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
              />
              <Tooltip
                formatter={(value: unknown) => [`${(Number(value) * 100).toFixed(2)}%`, 'Probability']}
                labelFormatter={(label: unknown) => `CAGR: ${Number(label).toFixed(1)}%`}
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              />
              <Bar dataKey="frequency" radius={[2, 2, 0, 0]}>
                {cagrData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.cagr >= inputParams.fdRate * 100 ? '#00b894' : entry.cagr >= 0 ? '#fdcb6e' : '#e17055'}
                  />
                ))}
              </Bar>
              <ReferenceLine
                x={inputParams.fdRate * 100}
                stroke="#feca57"
                strokeDasharray="4 4"
                label={{ value: `FD ${formatPct(inputParams.fdRate)}`, fill: '#feca57', fontSize: 11, position: 'top' }}
              />
              <ReferenceLine
                x={0}
                stroke="#ff6b6b"
                strokeWidth={1}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: '#00b894' }} /> Beats FD</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#fdcb6e' }} /> Positive but below FD</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#e17055' }} /> Loss</span>
          </div>
        </div>

        {/* Growth vs P/E Scatter */}
        <div className="chart-card chart-large">
          <h3>Growth vs Terminal P/E (Sampled Outcomes)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="growth"
                name="Growth"
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                label={{ value: 'EPS Growth Rate', position: 'bottom', fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
              />
              <YAxis
                dataKey="pe"
                name="P/E"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                label={{ value: 'Terminal P/E', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: unknown, name?: string) => {
                  const v = Number(value);
                  if (name === 'Growth') return [`${v.toFixed(1)}%`, name];
                  if (name === 'P/E') return [`${v.toFixed(1)}x`, name];
                  return [v, name ?? ''];
                }}
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              />
              <Scatter data={scatterData} fill="#6c5ce7" opacity={0.4}>
                {scatterData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.cagr >= inputParams.fdRate * 100 ? '#00b894' : entry.cagr >= 0 ? '#fdcb6e' : '#e17055'}
                    opacity={0.35}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Historical Price */}
        {historicalData.length > 0 && (
          <div className="chart-card chart-large">
            <h3>Historical Price ({stockData.ticker})</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={historicalData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={10} interval="preserveStartEnd" />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}K`}
                />
                <Tooltip
                  formatter={(value: unknown) => [formatCurrency(Number(value)), 'Price']}
                  contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                />
                <defs>
                  <linearGradient id="histGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d2d3" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#00d2d3" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#00d2d3"
                  fill="url(#histGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
