import { useEffect } from "react";
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
    analysis,
    loadExpression,
    suggestedNext,
    ai,
    askAi,
    resultKey,
    inputRef,
    handleInputChange,
    handleInputKeyDown,
    syncCursor,
    placeCaretAtEnd,
  } = useCalculator();

  // When returning to this page with an existing expression, start with the
  // caret at the end so keypad presses append sensibly.
  useEffect(() => {
    placeCaretAtEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Combine frequent and recent expressions into one deduplicated quick-pick list.
  const quickPicks = [];
  if (analysis) {
    const seen = new Set();
    for (const { expression: e } of analysis.topExpressions) {
      if (!seen.has(e)) { quickPicks.push(e); seen.add(e); }
    }
    for (const e of analysis.recentExpressions) {
      if (!seen.has(e) && quickPicks.length < 6) { quickPicks.push(e); seen.add(e); }
    }
  }

  return (
    <>
      <p className="page__lede">
        A full scientific calculator: trigonometric and logarithmic
        functions, constants, and factorial are all evaluated the same way
        as basic arithmetic — tokenized, converted to postfix via
        Shunting-Yard, then run through a stack machine. Scroll down to see
        the trace for whatever you calculate.
      </p>

      {quickPicks.length > 0 && (
        <section className="section">
          <h2 className="section__label">Suggestions — Based on Your History</h2>
          <div className="chip-row">
            {quickPicks.map((e) => (
              <button key={e} className="chip" onClick={() => loadExpression(e)}>
                {e}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section__label">Figure 1 — Scientific Calculator</h2>

        <div
          className="sci-calc"
          onMouseDown={(e) => {
            // Pressing a keypad button shouldn't pull focus (and the caret)
            // out of the display input.
            if (e.target.closest("button")) e.preventDefault();
          }}
        >
          <div className="display">
            <input
              ref={inputRef}
              className="display__expression display__input"
              value={expression}
              placeholder="0"
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onSelect={syncCursor}
              onKeyUp={syncCursor}
              onClick={syncCursor}
              inputMode="none"
              spellCheck={false}
              autoComplete="off"
              aria-label="Expression — click to move the cursor and edit"
            />
            <div className="display__result">
              {error ? (
                <span className="display__error">{error}</span>
              ) : outcome ? (
                <span key={resultKey} className="display__result-value">{outcome.result}</span>
              ) : (
                <span className="display__placeholder">&nbsp;</span>
              )}
            </div>
          </div>

          {suggestedNext.length > 0 && (
            <div className="next-suggest">
              <span className="next-suggest__label">next:</span>
              {suggestedNext.map(({ token }) => (
                <button key={token} className="next-suggest__chip" onClick={() => append(token)}>
                  {token}
                </button>
              ))}
            </div>
          )}

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
        <h2 className="section__label">AI Suggestions — Powered by Google Gemini</h2>
        <div className="ai-panel">
          <div className="ai-panel__head">
            <p className="ai-panel__hint">
              Get follow-up ideas based on what you are calculating and your recent history.
            </p>
            <button className="ai-panel__btn" onClick={askAi} disabled={ai.status === "loading"}>
              {ai.status === "loading" ? "Thinking…" : "✨ Suggest with AI"}
            </button>
          </div>

          {ai.status === "error" && <div className="ai-panel__error">{ai.error}</div>}

          {ai.status === "done" && ai.data && (
            <>
              {ai.data.tip && <p className="ai-panel__tip">{ai.data.tip}</p>}
              {ai.data.suggestions.length > 0 ? (
                <ul className="ai-list">
                  {ai.data.suggestions.map((s) => (
                    <li key={s.expression}>
                      <button className="chip" onClick={() => loadExpression(s.expression)}>
                        {s.expression}
                      </button>
                      {s.reason && <span className="ai-list__reason">{s.reason}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ai-panel__hint">No valid suggestions came back. Try again.</p>
              )}
              {ai.data.sources?.length > 0 && (
                <p className="ai-panel__sources">
                  Sources (Google Search):{" "}
                  {ai.data.sources.map((src) => (
                    <a key={src.uri} href={src.uri} target="_blank" rel="noreferrer">
                      {src.title}
                    </a>
                  ))}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {analysis && analysis.totalCalculations > 0 && (
        <section className="section">
          <h2 className="section__label">Your Usage Analysis</h2>
          <p className="insights__summary">
            {analysis.totalCalculations} calculation{analysis.totalCalculations === 1 ? "" : "s"} recorded.
            {analysis.functionUsage.length > 0 && (
              <> Most used: <strong>{analysis.functionUsage[0].token}</strong> ({analysis.functionUsage[0].count}×).</>
            )}
          </p>
          {analysis.functionUsage.length > 0 && (
            <div className="usage-bars">
              {analysis.functionUsage.map(({ token, count }) => (
                <div key={token} className="usage-bar">
                  <span className="usage-bar__label">{token}</span>
                  <div className="usage-bar__track">
                    <div
                      className="usage-bar__fill"
                      style={{ width: `${(count / analysis.functionUsage[0].count) * 100}%` }}
                    />
                  </div>
                  <span className="usage-bar__count">{count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
