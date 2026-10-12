require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const { calculate } = require("./calculator");
const { initDb, insertHistory, getHistory, clearHistory, backend } = require("./db");
const { computeAnalysis } = require("./analysis");

// Optional modules: if one of these files is missing or fails to load, the rest
// of the API (calculator, history, analysis) must still start. Without this, a
// file that was not pushed to GitHub would crash the whole server on Render.
let getAiSuggestions = async () => {
  throw new Error("AI suggestions are not available on this server.");
};
let aiEnabled = () => false;
try {
  ({ getAiSuggestions, aiEnabled } = require("./ai"));
} catch (err) {
  console.warn("AI suggestions are disabled:", err.message);
}

let solveEquations = null;
let SolveError = class extends Error {};
try {
  ({ solveEquations, SolveError } = require("./equations"));
} catch (err) {
  console.warn("Equation solver is disabled:", err.message);
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", database: backend, ai: aiEnabled() ? "enabled" : "disabled", solver: solveEquations ? "available" : "missing" });
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

// --- Equation solver ---------------------------------------------------
app.post("/api/solve", (req, res) => {
  if (!solveEquations) {
    return res.status(503).json({
      error: "The equation solver is not installed on this server (server/equations.js is missing or failed to load).",
    });
  }
  const { equations, angleMode } = req.body || {};
  if (typeof equations !== "string" || !equations.trim()) {
    return res.status(400).json({ error: "Write an equation first, for example x^2 - 5x + 6 = 0" });
  }
  try {
    res.json(solveEquations(equations.slice(0, 500), angleMode === "deg" ? "deg" : "rad"));
  } catch (err) {
    if (err instanceof SolveError) return res.status(400).json({ error: err.message });
    console.error("Solver crashed:", err);
    res.status(500).json({ error: "The solver hit an unexpected problem." });
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
