// AI suggestions powered by Google's Gemini API.
//
// The API key stays on the server (GEMINI_API_KEY) and is never sent to the
// browser. Set GEMINI_USE_SEARCH=true to let Gemini ground its answers with
// Google Search (useful for "what formula do I need for X?" style questions).
//
// Every expression the model proposes is run through our own calculate()
// before it is returned, so the UI never offers a suggestion that the
// calculator itself would reject.

const { calculate } = require("./calculator");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const USE_SEARCH = process.env.GEMINI_USE_SEARCH === "true";
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const aiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are the suggestion engine inside a scientific calculator.
The calculator supports ONLY: numbers, + - * / % ^ (power), parentheses, unary minus,
factorial (!), constants pi and e, and the functions sin, cos, tan, asin, acos, atan,
log (base 10), ln, sqrt. It does NOT support variables, units, commas, or any other
function names. Every expression you suggest must use only that syntax.

Reply with JSON only, no markdown, in exactly this shape:
{
  "tip": "one or two short sentences of helpful guidance",
  "suggestions": [
    { "expression": "a valid calculator expression", "reason": "short reason, under 12 words" }
  ]
}
Give 3 to 5 suggestions. Make them relevant to what the user is working on: natural
follow-ups, a way to check the result, or a related calculation they may want next.`;

function buildUserPrompt({ expression, result, angleMode, recent }) {
  const lines = [`Angle mode: ${angleMode}`];
  if (expression) lines.push(`Current expression: ${expression}`);
  if (result !== undefined && result !== null) lines.push(`Its result: ${result}`);
  if (recent?.length) lines.push(`Recent calculations: ${recent.join(" | ")}`);
  if (!expression && !recent?.length) {
    lines.push("The user has not calculated anything yet. Suggest good starter expressions.");
  }
  return lines.join("\n");
}

// Models sometimes wrap JSON in ```json fences or add stray text.
function parseJson(text) {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("The AI returned a response we could not read.");
  }
}

async function getAiSuggestions({ expression, result, angleMode = "rad", recent = [] }) {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt({ expression, result, angleMode, recent }) }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
  };

  if (USE_SEARCH) {
    // Gemini can't combine Google Search grounding with forced JSON output,
    // so in this mode we rely on the prompt and parse the text ourselves.
    body.tools = [{ google_search: {} }];
  } else {
    body.generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(ENDPOINT(MODEL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Gemini error", res.status, detail.slice(0, 300));
    throw new Error(
      res.status === 429
        ? "The AI is rate-limited right now. Try again in a minute."
        : "The AI service returned an error."
    );
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text) throw new Error("The AI returned an empty response.");

  const parsed = parseJson(text);

  // Keep only expressions our own calculator can evaluate, and dedupe.
  const seen = new Set();
  const suggestions = [];
  for (const s of parsed.suggestions || []) {
    const expr = typeof s?.expression === "string" ? s.expression.trim() : "";
    if (!expr || seen.has(expr)) continue;
    try {
      calculate(expr, angleMode);
    } catch {
      continue;
    }
    seen.add(expr);
    suggestions.push({ expression: expr, reason: String(s.reason || "").slice(0, 120) });
    if (suggestions.length === 5) break;
  }

  const sources = (candidate?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w?.uri)
    .slice(0, 3)
    .map((w) => ({ title: w.title || w.uri, uri: w.uri }));

  return {
    tip: String(parsed.tip || "").slice(0, 300),
    suggestions,
    sources,
    model: MODEL,
    grounded: USE_SEARCH,
  };
}

module.exports = { getAiSuggestions, aiEnabled };
