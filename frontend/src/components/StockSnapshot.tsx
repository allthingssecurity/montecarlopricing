import { TrendingUp, Clock, AlertTriangle, Info } from 'lucide-react';
import type { StockData } from '../types';

interface StockSnapshotProps {
  data: StockData;
}

export default function StockSnapshot({ data }: StockSnapshotProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: data.currency || 'INR',
      minimumFractionDigits: 2
    }).format(val);
  };

  return (
    <div className="stock-snapshot">
      <div className="snapshot-header">
        <div className="company-info">
          <h2 className="company-name">{data.companyName}</h2>
          <div className="ticker-badge">
            <span className="ticker-symbol">{data.ticker}</span>
            <span className="exchange-badge">{data.exchange}</span>
          </div>
        </div>
        <div className="price-display">
          <span className="current-price">{formatCurrency(data.currentPrice)}</span>
          <span className="market-state">{data.marketState === 'REGULAR' ? 'Market Open' : 'Market Closed'}</span>
        </div>
      </div>

      <div className="snapshot-metrics">
        <div className="metric-card">
          <div className="metric-label">Trailing EPS</div>
          <div className="metric-value">{formatCurrency(data.trailingEps)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Trailing P/E</div>
          <div className="metric-value">{data.trailingPE?.toFixed(2) || 'N/A'}x</div>
        </div>
        {data.forwardPE && (
          <div className="metric-card">
            <div className="metric-label">Forward P/E</div>
            <div className="metric-value">{data.forwardPE.toFixed(2)}x</div>
          </div>
        )}
        <div className="metric-card">
          <div className="metric-label">EPS History Points</div>
          <div className="metric-value">{data.epsHistory.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            <TrendingUp size={14} />
            Est. Growth (median)
          </div>
          <div className="metric-value growth-value">
            {(data.growthDistribution.meanGrowth * 100).toFixed(1)}%
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Growth Volatility</div>
          <div className="metric-value">{(data.growthDistribution.sigmaGrowth * 100).toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Est. Mean P/E</div>
          <div className="metric-value">{data.peDistribution.meanPE.toFixed(1)}x</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">P/E Volatility</div>
          <div className="metric-value">{data.peDistribution.sigmaPE.toFixed(1)}</div>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <div className="warnings-container">
          {data.warnings.map((w, i) => (
            <div key={i} className="warning-item">
              <AlertTriangle size={14} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="data-timestamp">
        <Clock size={12} />
        <span>Data fetched: {new Date(data.fetchTimestamp).toLocaleString()}</span>
        <Info size={12} className="info-icon" />
        <span className="source-label">Yahoo Finance</span>
      </div>
    </div>
  );
}
