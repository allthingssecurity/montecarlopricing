import express from 'express';
import cors from 'cors';
import { fetchStockData } from './yahoo.js';
import { runSimulation } from './simulation.js';

const app = express();
app.use(cors());
app.use(express.json());

// ─── In-memory cache ────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── Fetch Stock Data ───────────────────────────────────────────

app.get('/api/stock/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    const lookbackYears = parseInt(req.query.lookbackYears) || 8;

    const cacheKey = `${ticker}_${lookbackYears}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const result = await fetchStockData(ticker, lookbackYears);
    setCache(cacheKey, result);
    res.json(result);

  } catch (err) {
    console.error('Error fetching stock data:', err);
    res.status(err.message.includes('not available') ? 400 : 500).json({ error: err.message });
  }
});

// ─── Run Simulation ─────────────────────────────────────────────

app.post('/api/simulate', (req, res) => {
  try {
    const {
      price0, eps0, pe0,
      years = 5,
      numSimulations = 20000,
      fdRate = 0.07,
      meanGrowth, sigmaGrowth,
      meanPE, sigmaPE,
      growthMin = -0.20, growthMax = 0.40,
      peMin = 5, peMax = 60
    } = req.body;

    if (!price0 || !eps0) {
      return res.status(400).json({ error: 'price0 and eps0 are required.' });
    }

    const result = runSimulation({
      price0, eps0, pe0: pe0 || (price0 / eps0),
      years, numSimulations, fdRate,
      meanGrowth, sigmaGrowth,
      meanPE, sigmaPE,
      growthMin, growthMax,
      peMin, peMax
    });

    const { rawResults, ...resultWithoutRaw } = result;

    const sampledResults = [];
    const step = Math.max(1, Math.floor(rawResults.length / 2000));
    for (let i = 0; i < rawResults.length; i += step) {
      sampledResults.push(rawResults[i]);
    }
    resultWithoutRaw.sampledResults = sampledResults;

    res.json(resultWithoutRaw);
  } catch (err) {
    console.error('Simulation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── CSV Download ───────────────────────────────────────────────

app.post('/api/simulate/csv', (req, res) => {
  try {
    const params = req.body;
    if (!params.price0 || !params.eps0) {
      return res.status(400).json({ error: 'price0 and eps0 are required.' });
    }

    const result = runSimulation(params);
    const csv = ['SimulationIndex,GrowthRate,TerminalPE,TerminalEPS,TerminalPrice,CAGR,BeatsFD,IsLoss'];

    result.rawResults.forEach((r, i) => {
      csv.push(`${i + 1},${r.g.toFixed(6)},${r.peT.toFixed(2)},${r.epsT.toFixed(4)},${r.priceT.toFixed(2)},${r.cagr.toFixed(6)},${r.beatsFD},${r.isLoss}`);
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=monte_carlo_${params.ticker || 'simulation'}.csv`);
    res.send(csv.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Health Check ───────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Monte Carlo Valuation API running on http://localhost:${PORT}`);
});
