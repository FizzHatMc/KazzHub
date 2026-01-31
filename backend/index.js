const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// In-memory storage (Replace with Redis/DB for production persistence)
const gameStateStore = {};
const layoutStore = {};

// --- ENDPOINTS ---

// 1. Sync Game State (Mod -> Server)
app.post('/api/sync/:gameId', (req, res) => {
  const { gameId } = req.params;
  const state = req.body;

  if (!state) {
    return res.status(400).json({ error: "Missing body" });
  }

  console.log(`[SYNC] Received state for ${gameId}`);
  gameStateStore[gameId] = {
    ...state,
    lastUpdated: Date.now()
  };

  res.json({ success: true });
});

// 2. Get Game State (Web -> Server)
app.get('/api/sync/:gameId', (req, res) => {
  const { gameId } = req.params;
  const state = gameStateStore[gameId];

  if (!state) {
    return res.status(404).json({ error: "No state found for this ID" });
  }

  res.json(state);
});

// 3. Upload Layout (Web -> Server)
app.post('/api/layout/:gameId', (req, res) => {
  const { gameId } = req.params;
  const layout = req.body;

  if (!layout) {
    return res.status(400).json({ error: "Missing body" });
  }

  console.log(`[LAYOUT] Received layout for ${gameId}`);
  layoutStore[gameId] = {
    ...layout,
    timestamp: Date.now()
  };

  res.json({ success: true });
});

// 4. Get Layout (Mod -> Server)
app.get('/api/layout/:gameId', (req, res) => {
  const { gameId } = req.params;
  const layout = layoutStore[gameId];

  // If no layout exists, return empty or 404?
  // Returning 200 with null/empty is safer for polling clients.
  if (!layout) {
    return res.json({ placements: [] });
  }

  res.json(layout);
});

// Health Check
app.get('/health', (req, res) => {
  res.send('KazzHub Global Server is running.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
