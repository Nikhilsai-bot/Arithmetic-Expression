require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const { calculate } = require("./calculator");
const { initDb, insertHistory, getHistory, clearHistory, backend } = require("./db");
const { computeAnalysis } = require("./analysis");
const { getAiSuggestions, aiEnabled } = require("./ai");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", database: backend, ai: aiEnabled() ? "enabled" : "disabled" });
});

app.post("/api/calculate", async (req, res) => {
  const { expression, angleMode } = req.body;
  if (!expression || typeof expression !== "string") {
    return res.status(400).json({ error: "Provide an 'expression' string." });
  }

  try {
    const outcome = calculate(expression, angleMode === "deg" ? "deg" : "rad");
    await insertHistory(outcome.expression, outcome.tokens, outcome.postfix, outcome.result);
    res.json(outcome);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    res.json(await getHistory());
  } catch (err) {
    res.status(500).json({ error: "Could not load history: " + err.message });
  }
});

app.delete("/api/history", async (req, res) => {
  await clearHistory();
  res.json({ status: "cleared" });
});

app.get("/api/analysis", async (req, res) => {
  try {
    const rows = await getHistory(200); // analyze a larger recent window
    res.json(computeAnalysis(rows));
  } catch (err) {
    res.status(500).json({ error: "Could not compute analysis: " + err.message });
  }
});

// --- AI suggestions (Google Gemini) ------------------------------------
// Tiny in-memory rate limiter: max 10 AI requests per minute per IP, so a
// public deployment can't be used to burn through the Gemini quota.
const aiHits = new Map();
function aiRateLimit(req, res, next) {
  const now = Date.now();
  const recent = (aiHits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 10) {
    return res.status(429).json({ error: "Too many AI requests. Please wait a minute." });
  }
  recent.push(now);
  aiHits.set(req.ip, recent);
  next();
}

app.post("/api/ai-suggest", aiRateLimit, async (req, res) => {
  if (!aiEnabled()) {
    return res.status(503).json({ error: "AI suggestions are not configured. Set GEMINI_API_KEY on the server." });
  }
  const { expression, result, angleMode } = req.body || {};
  try {
    const rows = await getHistory(8);
    const recent = [...new Set(rows.map((r) => r.expression))].slice(0, 5);
    const out = await getAiSuggestions({
      expression: typeof expression === "string" ? expression.slice(0, 200) : "",
      result: typeof result === "number" ? result : undefined,
      angleMode: angleMode === "deg" ? "deg" : "rad",
      recent,
    });
    res.json(out);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;

async function start() {
  await initDb();
  console.log(`Using ${backend} for history storage.`);
  app.listen(PORT, () => {
    console.log(`Calculator API running on http://localhost:${PORT}`);
  });
}

start();
