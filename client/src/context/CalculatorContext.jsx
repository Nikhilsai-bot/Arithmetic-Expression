import { createContext, useContext, useState } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

const CalculatorContext = createContext(null);

export function CalculatorProvider({ children }) {
  const [expression, setExpression] = useState("");
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("postfix"); // postfix | evaluation
  const [angleMode, setAngleMode] = useState("rad"); // rad | deg
  const [inv, setInv] = useState(false);

  const append = (text) => setExpression((prev) => prev + text);

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
    } catch (e) {
      setError("Could not reach the server. Is the backend running?");
    }
  };

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
      }}
    >
      {children}
    </CalculatorContext.Provider>
  );
}

export function useCalculator() {
  return useContext(CalculatorContext);
}
