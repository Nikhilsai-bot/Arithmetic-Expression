import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

const CalculatorContext = createContext(null);

// Pulls the last meaningful token off the text before the cursor, so we can
// look it up in the backend's next-token suggestion map. Doesn't need to be
// a full tokenizer — just good enough to key into the bigram model.
function lastToken(expr) {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(-?[0-9]*\.?[0-9]+|[a-zA-Z]+|[+\-*/%^()!])$/);
  return match ? match[0] : null;
}

export function CalculatorProvider({ children }) {
  const [expression, setExpression] = useState("");
  const [cursor, setCursor] = useState(0); // caret position inside the expression
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("postfix"); // postfix | evaluation
  const [angleMode, setAngleMode] = useState("rad"); // rad | deg
  const [inv, setInv] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [resultKey, setResultKey] = useState(0); // bumped on each successful calc, to replay the result animation

  // The editable display input, and where the caret should land after the
  // next render (React resets it to the end when the value changes).
  const inputRef = useRef(null);
  const pendingCursor = useRef(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (pendingCursor.current !== null && el) {
      const pos = Math.min(pendingCursor.current, el.value.length);
      el.focus();
      el.setSelectionRange(pos, pos);
      pendingCursor.current = null;
    }
  }, [expression]);

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

  // Read the current selection from the input (falls back to the end).
  const selection = () => {
    const el = inputRef.current;
    if (!el) return [expression.length, expression.length];
    return [el.selectionStart ?? expression.length, el.selectionEnd ?? expression.length];
  };

  const syncCursor = () => {
    const el = inputRef.current;
    if (el) setCursor(el.selectionStart ?? el.value.length);
  };

  // Called when the display input mounts, so the caret starts at the end.
  const placeCaretAtEnd = () => {
    const el = inputRef.current;
    if (el) {
      const n = el.value.length;
      el.setSelectionRange(n, n);
      setCursor(n);
    }
  };

  // Insert text at the caret (replacing any selected text).
  const append = (text) => {
    const [start, end] = selection();
    setExpression((prev) => {
      const s = Math.min(start, prev.length);
      const e = Math.min(end, prev.length);
      return prev.slice(0, s) + text + prev.slice(e);
    });
    pendingCursor.current = start + text.length;
    setCursor(start + text.length);
  };

  // Typing directly on a physical keyboard.
  const handleInputChange = (e) => {
    setExpression(e.target.value);
    setCursor(e.target.selectionStart ?? e.target.value.length);
  };

  // Load a full expression string, e.g. from a suggestion chip.
  const loadExpression = (text) => {
    setExpression(text);
    pendingCursor.current = text.length;
    setCursor(text.length);
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
    pendingCursor.current = 0;
    setCursor(0);
    setOutcome(null);
    setError("");
  };

  // Delete the selection, or the character just before the caret.
  const backspace = () => {
    const [start, end] = selection();
    if (start !== end) {
      setExpression((prev) => prev.slice(0, start) + prev.slice(end));
      pendingCursor.current = start;
      setCursor(start);
    } else if (start > 0) {
      setExpression((prev) => prev.slice(0, start - 1) + prev.slice(start));
      pendingCursor.current = start - 1;
      setCursor(start - 1);
    }
  };

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
      setResultKey((k) => k + 1);
      loadAnalysis(); // refresh suggestions with this new calculation included
    } catch (e) {
      setError("Could not reach the server. Is the backend running?");
    }
  };

  // Enter on a physical keyboard calculates.
  const handleInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      calculate();
    }
  };

  // Suggest what usually follows the token just before the caret.
  const beforeCaret = expression.slice(0, Math.min(cursor, expression.length));
  const suggestedNext =
    analysis?.nextToken && beforeCaret
      ? analysis.nextToken[lastToken(beforeCaret)] || []
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
        resultKey,
        inputRef,
        handleInputChange,
        handleInputKeyDown,
        syncCursor,
        placeCaretAtEnd,
      }}
    >
      {children}
    </CalculatorContext.Provider>
  );
}

export function useCalculator() {
  return useContext(CalculatorContext);
}
