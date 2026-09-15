import { createContext, useContext, useState } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

const CalculatorContext = createContext(null);

export function CalculatorProvider({ children }) {
  const [expression, setExpression] = useState("");
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("postfix"); // postfix | evaluation

  const press = (key) => {
    if (key === "=") return calculate();
    setExpression((prev) => prev + key);
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
        body: JSON.stringify({ expression }),
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
      value={{ expression, outcome, error, tab, setTab, press, clear, backspace, calculate }}
    >
      {children}
    </CalculatorContext.Provider>
  );
}

export function useCalculator() {
  return useContext(CalculatorContext);
}
