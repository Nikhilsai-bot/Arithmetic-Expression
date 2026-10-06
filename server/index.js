require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const { calculate } = require("./calculator");
const { initDb, insertHistory, getHistory, clearHistory, backend } = require("./db");
const { computeAnalysis } = require("./analysis");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", database: backend });
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

const PORT = process.env.PORT || 5000;

async function start() {
  await initDb();
  console.log(`Using ${backend} for history storage.`);
  app.listen(PORT, () => {
    console.log(`Calculator API running on http://localhost:${PORT}`);
  });
}

start();
