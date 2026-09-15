import { StackView, TraceStep } from "../components/Trace";
import { useCalculator } from "../context/CalculatorContext";

const KEYS = [
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "^", "+"],
  ["(", ")", "%", "="],
];

export default function Home() {
  const { expression, outcome, error, tab, setTab, press, clear, backspace } = useCalculator();

  return (
    <>
      <p className="page__lede">
        Enter an arithmetic expression below. It is tokenized, converted from
        infix to postfix notation using the Shunting-Yard algorithm, then
        evaluated on a postfix stack machine. Every push and pop is recorded
        and shown in the trace beneath the calculator.
      </p>

      <section className="section">
        <h2 className="section__label">Figure 1 — Calculator</h2>
        <div className="calc">
          <div className="display">
            <div className="display__expression">{expression || "0"}</div>
            <div className="display__result">
              {error ? (
                <span className="display__error">{error}</span>
              ) : outcome ? (
                <span>{outcome.result}</span>
              ) : (
                <span className="display__placeholder">&nbsp;</span>
              )}
            </div>
          </div>

          <div className="keypad">
            <button className="key key--fn" onClick={clear}>C</button>
            <button className="key key--fn" onClick={backspace}>⌫</button>
            <button className="key key--op" onClick={() => press("/")}>÷</button>
            <button className="key key--op" onClick={() => press("*")}>×</button>

            {KEYS.slice(0, 3).map((row, ri) =>
              row.map((k, ki) => (
                <button
                  key={`${ri}-${ki}`}
                  className={"key" + (isNaN(k) && k !== "." ? " key--op" : "")}
                  onClick={() => press(k)}
                >
                  {k === "/" ? "÷" : k === "*" ? "×" : k}
                </button>
              ))
            )}
            {KEYS[3].map((k, ki) => (
              <button
                key={`3-${ki}`}
                className={"key" + (k === "=" ? " key--eq" : isNaN(k) && k !== "." ? " key--op" : "")}
                onClick={() => press(k)}
              >
                {k}
              </button>
            ))}
            {KEYS[4].map((k, ki) => (
              <button
                key={`4-${ki}`}
                className={"key" + (k === "=" ? " key--eq" : isNaN(k) ? " key--op" : "")}
                onClick={() => press(k)}
              >
                {k}
              </button>
            ))}
          </div>

          {outcome && (
            <div className="postfix-line">
              <span className="postfix-line__label">postfix form</span>
              <span className="postfix-line__value">{outcome.postfix.join(" ")}</span>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section__label">Algorithm 1 — Execution Trace</h2>
        <div className="trace__tabs">
          <button
            className={"tab" + (tab === "postfix" ? " tab--active" : "")}
            onClick={() => setTab("postfix")}
            disabled={!outcome}
          >
            1. Infix → Postfix
          </button>
          <button
            className={"tab" + (tab === "evaluation" ? " tab--active" : "")}
            onClick={() => setTab("evaluation")}
            disabled={!outcome}
          >
            2. Postfix Evaluation
          </button>
        </div>

        <div className="trace__body">
          {!outcome && (
            <div className="empty-note">
              Enter an expression above and press = to see the algorithm run
              step by step.
            </div>
          )}
          {outcome &&
            (tab === "postfix" ? outcome.trace.infixToPostfix : outcome.trace.evaluation).map(
              (step, i) => <TraceStep key={i} step={step} phase={tab} index={i + 1} />
            )}
        </div>
      </section>
    </>
  );
}
