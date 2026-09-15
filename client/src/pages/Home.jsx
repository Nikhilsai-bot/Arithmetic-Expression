import { StackView, TraceStep } from "../components/Trace";
import { useCalculator } from "../context/CalculatorContext";

export default function Home() {
  const {
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
  } = useCalculator();

  return (
    <>
      <p className="page__lede">
        A full scientific calculator: trigonometric and logarithmic
        functions, constants, and factorial are all evaluated the same way
        as basic arithmetic — tokenized, converted to postfix via
        Shunting-Yard, then run through a stack machine. Scroll down to see
        the trace for whatever you calculate.
      </p>

      <section className="section">
        <h2 className="section__label">Figure 1 — Scientific Calculator</h2>

        <div className="sci-calc">
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

          <div className="sci-keypad">
            <button className="rkey rkey--fn" onClick={() => pressFunction("sin")}>sin</button>
            <button className="rkey rkey--fn" onClick={() => pressFunction("cos")}>cos</button>
            <button className="rkey rkey--fn" onClick={() => pressFunction("tan")}>tan</button>
            <button
              className={"rkey rkey--mode" + (angleMode === "rad" ? " rkey--mode-active" : "")}
              onClick={() => setAngleMode("rad")}
            >
              rad
            </button>
            <button
              className={"rkey rkey--mode" + (angleMode === "deg" ? " rkey--mode-active" : "")}
              onClick={() => setAngleMode("deg")}
            >
              deg
            </button>

            <button className="rkey rkey--fn" onClick={() => pressFunction("log")}>log</button>
            <button className="rkey rkey--fn" onClick={() => pressFunction("ln")}>ln</button>
            <button className="rkey" onClick={() => append("(")}>(</button>
            <button className="rkey" onClick={() => append(")")}>)</button>
            <button
              className={"rkey rkey--mode" + (inv ? " rkey--mode-active" : "")}
              onClick={() => setInv((v) => !v)}
            >
              inv
            </button>

            <button className="rkey rkey--fn" onClick={() => append("!")}>!</button>
            <button className="rkey rkey--strong" onClick={clear}>AC</button>
            <button className="rkey rkey--op" onClick={() => append("%")}>%</button>
            <button className="rkey rkey--strong" onClick={backspace}>⌫</button>
            <button className="rkey rkey--op" onClick={() => append("/")}>÷</button>

            <button className="rkey rkey--fn" onClick={() => append("^")}>^</button>
            <button className="rkey" onClick={() => append("7")}>7</button>
            <button className="rkey" onClick={() => append("8")}>8</button>
            <button className="rkey" onClick={() => append("9")}>9</button>
            <button className="rkey rkey--op" onClick={() => append("*")}>×</button>

            <button className="rkey rkey--fn" onClick={() => pressFunction("sqrt")}>√</button>
            <button className="rkey" onClick={() => append("4")}>4</button>
            <button className="rkey" onClick={() => append("5")}>5</button>
            <button className="rkey" onClick={() => append("6")}>6</button>
            <button className="rkey rkey--op" onClick={() => append("-")}>−</button>

            <button className="rkey rkey--fn" onClick={() => append("pi")}>π</button>
            <button className="rkey" onClick={() => append("1")}>1</button>
            <button className="rkey" onClick={() => append("2")}>2</button>
            <button className="rkey" onClick={() => append("3")}>3</button>
            <button className="rkey rkey--op" onClick={() => append("+")}>+</button>

            <button className="rkey rkey--fn" onClick={() => append("e")}>e</button>
            <button className="rkey" onClick={() => append("00")}>00</button>
            <button className="rkey" onClick={() => append("0")}>0</button>
            <button className="rkey" onClick={() => append(".")}>.</button>
            <button className="rkey rkey--eq" onClick={calculate}>=</button>
          </div>

          {outcome && (
            <div className="postfix-line">
              <span className="postfix-line__label">postfix form</span>
              <span className="postfix-line__value">{outcome.postfix.join(" ")}</span>
              <span className="postfix-line__label" style={{ marginLeft: "auto" }}>
                angle mode: {outcome.angleMode}
              </span>
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
              step by step. Functions (sin, log, √, …) and factorial appear
              in the trace just like any other operator.
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
