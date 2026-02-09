# Monte Carlo Valuation Engine (EPS x P/E)

A professional web application that fetches real stock data and runs Monte Carlo simulations to estimate future stock valuations using EPS growth and P/E multiple distributions.

**Live Demo**: [https://allthingssecurity.github.io/montecarlopricing/](https://allthingssecurity.github.io/montecarlopricing/)

## Architecture

- **Frontend**: Vite + React + TypeScript with Recharts — deployed to GitHub Pages
- **Backend API**: Cloudflare Worker — serverless, globally distributed
- **Data Sources**: Moneycontrol (fundamentals) + Yahoo Finance (historical prices)

## How It Works

1. **Enter a ticker** (e.g., `FINEORG.NS`) and click Fetch
2. The API fetches real-time data:
   - Current price, trailing EPS, trailing P/E from Moneycontrol
   - Historical prices from Yahoo Finance for growth estimation
3. **Click "Run Monte Carlo Simulation"** to run 20,000 simulations
4. Each simulation samples:
   - `g ~ TruncatedNormal(mean_growth, sigma_growth)` — EPS growth rate
   - `PE_T ~ TruncatedNormal(mean_pe, sigma_pe)` — terminal P/E ratio
   - `EPS_T = EPS_0 * (1+g)^years`
   - `Price_T = EPS_T * PE_T`
5. Results show distribution of outcomes with probabilities

## Example Tickers

| Ticker | Company |
|--------|---------|
| `FINEORG.NS` | Fine Organic Industries |
| `TCS.NS` | Tata Consultancy Services |
| `RELIANCE.NS` | Reliance Industries |
| `INFY.NS` | Infosys |

## Features

- **Real-time data** from Moneycontrol + Yahoo Finance
- **Robust statistics**: Uses median and MAD/IQR-derived sigma to avoid outlier distortion
- **4 interactive charts**: Price distribution, CAGR distribution, Growth vs P/E scatter, Historical price
- **Scenario matrix**: 3x3 grid crossing growth percentiles with P/E percentiles
- **Sensitivity analysis**: Variance decomposition showing growth vs P/E contribution
- **CSV download**: Export all simulation results
- **Distribution overrides**: Manually set growth/P/E parameters

## Local Development

```bash
# Install
cd backend && npm install
cd ../frontend && npm install

# Run backend (port 3001)
cd backend && node server.js

# Run frontend (port 5173)
cd frontend && npm run dev
```

## API Endpoints (Cloudflare Worker)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stock/:ticker` | GET | Fetch stock data and compute distributions |
| `/api/simulate` | POST | Run Monte Carlo simulation |
| `/api/simulate/csv` | POST | Download simulation results as CSV |
| `/api/health` | GET | Health check |

## Deploy

**Frontend**: Automatically deployed to GitHub Pages on push to `main`.

**Backend Worker**:
```bash
cd worker
CLOUDFLARE_API_TOKEN=your_token wrangler deploy
```
