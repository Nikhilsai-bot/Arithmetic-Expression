export default function AppMockup() {
  return (
    <div className="app-mockup">
      <div className="app-mockup__chrome">
        <span className="app-mockup__dot" style={{ background: "#e8635a" }} />
        <span className="app-mockup__dot" style={{ background: "#f2b155" }} />
        <span className="app-mockup__dot" style={{ background: "#5cc98e" }} />
        <div className="app-mockup__url">stack-evaluator.app/calculator</div>
      </div>

      <div className="app-mockup__body">
        <div className="app-mockup__display">
          <div className="app-mockup__expr">3 + 4 * (2 - 1) ^ 2</div>
          <div className="app-mockup__result">7</div>
        </div>

        <div className="app-mockup__grid">
          {["sin", "cos", "tan", "(", ")"].map((k) => (
            <span key={k} className="app-mockup__key app-mockup__key--fn">{k}</span>
          ))}
          {["7", "8", "9", "÷", "×"].map((k) => (
            <span key={k} className="app-mockup__key">{k}</span>
          ))}
          {["4", "5", "6", "−", "+"].map((k) => (
            <span key={k} className="app-mockup__key">{k}</span>
          ))}
          {["1", "2", "3", ".", "="].map((k) => (
            <span
              key={k}
              className={"app-mockup__key" + (k === "=" ? " app-mockup__key--eq" : "")}
            >
              {k}
            </span>
          ))}
        </div>

        <div className="app-mockup__trace">
          <div className="app-mockup__trace-label">operator stack</div>
          <div className="app-mockup__trace-row">
            <span className="app-mockup__tile">+</span>
            <span className="app-mockup__tile app-mockup__tile--top">^</span>
          </div>
        </div>
      </div>
    </div>
  );
}
