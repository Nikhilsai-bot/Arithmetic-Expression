import { createContext, useContext, useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

const CalculatorContext = createContext(null);

// Pulls the last meaningful token off the current expression string, so we
// can look it up in the backend's next-token suggestion map. Doesn't need
// to be a full tokenizer — just good enough to key into the bigram model.
function lastToken(expr) {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(-?[0-9]*\.?[0-9]+|[a-zA-Z]+|[+\-*/%^()!])$/);
  return match ? match[0] : null;
}

export function CalculatorProvider({ children }) {
  const [expression, setExpression] = useState("");
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("postfix"); // postfix | evaluation
  const [angleMode, setAngleMode] = useState("rad"); // rad | deg
  const [inv, setInv] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const loadAnalysis = async () => {
    try {
      const res = await fetch(`${API}/analysis`);
      if (res.ok) setAnalysis(await res.json());
    } catch (e) {
      // Suggestions are a nice-to-have; silently skip if unreachable.
    }
  };

  useEffect(() => {
    loadAnalysis();
  }, []);

  const append = (text) => setExpression((prev) => prev + text);

  // Load a full expression string, e.g. from a suggestion chip.
  const loadExpression = (text) => {
    setExpression(text);
    setOutcome(null);
    setError("");
  };

  // Insert a function call, respecting the inv toggle for sin/cos/tan/log/ln.
  const pressFunction = (name) => {
    const map = {
      sin: inv ? "asin(" : "sin(",
      cos: inv ? "acos(" : "cos(",
      tan: inv ? "atan(" : "tan(",
      log: inv ? "10^(" : "log(",
      ln: inv ? "e^(" : "ln(",
      sqrt: "sqrt(",
    };
    append(map[name]);
  };

  const clear = () => {
    setExpression("");
    setOutcome(null);
    setError("");
  };

  const backspace = () => setExpression((prev) => prev.slice(0, -1));

  const calculate = async () => {
    if (!expression.trim()) return;
    setError("");
    try {
      const res = await fetch(`${API}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression, angleMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setOutcome(null);
        return;
      }
      setOutcome(data);
      setTab("postfix");
      loadAnalysis(); // refresh suggestions with this new calculation included
    } catch (e) {
      setError("Could not reach the server. Is the backend running?");
    }
  };

  const suggestedNext =
    analysis?.nextToken && expression
      ? analysis.nextToken[lastToken(expression)] || []
      : [];

  return (
    <CalculatorContext.Provider
      value={{
        expression,
        outcome,
        error,
        tab,
        setTab,
        angleMode,
        setAngleMode,
        inv,
        setInv,
        append,
        pressFunction,
        clear,
        backspace,
        calculate,
        analysis,
        loadExpression,
        suggestedNext,
      }}
    >
      {children}
    </CalculatorContext.Provider>
  );
}

export function useCalculator() {
  return useContext(CalculatorContext);
}
