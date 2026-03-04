const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// In-memory storage (replace with Redis/DB for production persistence)
const gameStateStore  = {};
const layoutStore     = {};
const analyzedStore   = {}; // gameId -> { mutations: [...], lastUpdated }

// ─────────────────────────────────────────────────────────────────────
// EXISTING ENDPOINTS
// ─────────────────────────────────────────────────────────────────────

// 1. Sync Game State (Mod -> Server)
app.post('/api/sync/:gameId', (req, res) => {
  const { gameId } = req.params;
  const state = req.body;
  if (!state) return res.status(400).json({ error: "Missing body" });

  console.log(`[SYNC] Received state for ${gameId}`);
  gameStateStore[gameId] = { ...state, lastUpdated: Date.now() };
  res.json({ success: true });
});

// 2. Get Game State (Web -> Server)
app.get('/api/sync/:gameId', (req, res) => {
  const { gameId } = req.params;
  const state = gameStateStore[gameId];
  if (!state) return res.status(404).json({ error: "No state found for this ID" });
  res.json(state);
});

// 3. Upload Layout (Web -> Server)
app.post('/api/layout/:gameId', (req, res) => {
  const { gameId } = req.params;
  const layout = req.body;
  if (!layout) return res.status(400).json({ error: "Missing body" });

  console.log(`[LAYOUT] Received layout for ${gameId}`);
  layoutStore[gameId] = { ...layout, timestamp: Date.now() };
  res.json({ success: true });
});

// 4. Get Layout (Mod -> Server)
app.get('/api/layout/:gameId', (req, res) => {
  const { gameId } = req.params;
  const layout = layoutStore[gameId];
  if (!layout) return res.json({ placements: [] });
  res.json(layout);
});

// ─────────────────────────────────────────────────────────────────────
// NEW: ANALYZED MUTATIONS ENDPOINTS
//
// Payload schema (Mod -> Server):
// POST /api/analyzed/:gameId
// {
//   "mutations": [
//     {
//       "id":        "ashwreath",   // mutation ID matching mutations.json
//       "count":     3,             // how many times this mutation was analyzed/donated
//       "timestamp": 1712345678900  // Unix ms when last analyzed
//     },
//     ...
//   ]
// }
//
// The web client polls GET /api/analyzed/:gameId and merges the result
// into its local analyzedMutations state (count is authoritative source).
// ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/analyzed/:gameId
 * Called by the Minecraft mod whenever the player analyzes (donates) a mutation.
 * Can be called with the full list on login/sync, or incrementally per-mutation.
 */
app.post('/api/analyzed/:gameId', (req, res) => {
  const { gameId } = req.params;
  const { mutations } = req.body;

  if (!mutations || !Array.isArray(mutations)) {
    return res.status(400).json({ error: "Expected body: { mutations: [{ id, count, timestamp }] }" });
  }

  // Validate each entry
  const valid = mutations.filter(m => typeof m.id === 'string' && m.id.length > 0);
  if (valid.length === 0) {
    return res.status(400).json({ error: "No valid mutation entries found" });
  }

  // Merge with existing data – keep the highest count per mutation
  const existing = analyzedStore[gameId]?.mutations || [];
  const existingMap = {};
  existing.forEach(m => { existingMap[m.id] = m; });

  valid.forEach(m => {
    const prev = existingMap[m.id];
    if (!prev || (m.count || 0) >= (prev.count || 0)) {
      existingMap[m.id] = {
        id:        m.id,
        count:     m.count     ?? 0,
        timestamp: m.timestamp ?? Date.now()
      };
    }
  });

  analyzedStore[gameId] = {
    mutations:   Object.values(existingMap),
    lastUpdated: Date.now()
  };

  console.log(`[ANALYZED] Updated ${valid.length} mutations for game ${gameId}. Total stored: ${analyzedStore[gameId].mutations.length}`);
  res.json({ success: true, stored: analyzedStore[gameId].mutations.length });
});

/**
 * GET /api/analyzed/:gameId
 * Called by the web client to pull the latest analyzed state from the mod.
 */
app.get('/api/analyzed/:gameId', (req, res) => {
  const { gameId } = req.params;
  const data = analyzedStore[gameId];
  if (!data) return res.json({ mutations: [], lastUpdated: null });
  res.json(data);
});

/**
 * DELETE /api/analyzed/:gameId
 * Optional: clear analyzed data for a game ID (admin/debug use).
 */
app.delete('/api/analyzed/:gameId', (req, res) => {
  const { gameId } = req.params;
  delete analyzedStore[gameId];
  console.log(`[ANALYZED] Cleared data for game ${gameId}`);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'KazzHub Global Server is running.',
    stores: {
      gameStates: Object.keys(gameStateStore).length,
      layouts:    Object.keys(layoutStore).length,
      analyzed:   Object.keys(analyzedStore).length
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
