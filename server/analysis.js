// Turns raw history rows into usage statistics and suggestions.
//
// The "next token" suggestions are a simple bigram frequency model: for
// every pair of consecutive tokens (tokenA, tokenB) seen across all past
// expressions, we count how often tokenB immediately follows tokenA in a
// hash map. Looking up the current last token then gives a ranked list of
// "what's typically typed next" — the same idea behind basic predictive
// text, built here with a plain object as a frequency hash map.

const NON_FUNCTION_TOKENS = new Set(["(", ")"]);

function isNumericToken(token) {
  return /^-?[0-9]*\.?[0-9]+$/.test(token);
}

function computeAnalysis(rows) {
  const functionUsage = {}; // token -> count, for operators/functions only
  const expressionCounts = {}; // expression -> count
  const bigrams = {}; // tokenA -> { tokenB: count }
  const recentExpressions = [];
  const seenRecent = new Set();

  for (const row of rows) {
    expressionCounts[row.expression] = (expressionCounts[row.expression] || 0) + 1;

    if (!seenRecent.has(row.expression) && recentExpressions.length < 5) {
      recentExpressions.push(row.expression);
      seenRecent.add(row.expression);
    }

    const tokens = row.tokens || [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!isNumericToken(tok) && !NON_FUNCTION_TOKENS.has(tok)) {
        functionUsage[tok] = (functionUsage[tok] || 0) + 1;
      }
      if (i < tokens.length - 1) {
        const next = tokens[i + 1];
        if (!bigrams[tok]) bigrams[tok] = {};
        bigrams[tok][next] = (bigrams[tok][next] || 0) + 1;
      }
    }
  }

  const topExpressions = Object.entries(expressionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([expression, count]) => ({ expression, count }));

  const functionUsageList = Object.entries(functionUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token, count]) => ({ token, count }));

  // Collapse bigrams to each token's top 3 followers, for a compact payload.
  const nextToken = {};
  for (const [tok, followers] of Object.entries(bigrams)) {
    nextToken[tok] = Object.entries(followers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([next, count]) => ({ token: next, count }));
  }

  return {
    totalCalculations: rows.length,
    functionUsage: functionUsageList,
    topExpressions,
    recentExpressions,
    nextToken,
  };
}

module.exports = { computeAnalysis };
