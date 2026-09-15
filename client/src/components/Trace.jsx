export function StackView({ label, items, highlightTop }) {
  const display = [...items].reverse();
  return (
    <div className="stack-view">
      <div className="stack-view__label">{label}</div>
      <div className="stack-view__body">
        {display.length === 0 && <div className="stack-view__empty">empty</div>}
        {display.map((item, i) => (
          <div
            key={i}
            className={"stack-tile" + (i === 0 && highlightTop ? " stack-tile--top" : "")}
          >
            {String(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TraceStep({ step, phase, index }) {
  if (phase === "postfix") {
    return (
      <div className="trace-step">
        <div className="trace-step__head">
          <span className="trace-step__index">{index}</span>
          <span className="trace-step__action">{step.action}</span>
          <span className="trace-step__token">{step.token}</span>
        </div>
        <div className="trace-step__row">
          <StackView label="operator stack" items={step.stack} highlightTop />
          <StackView label="output queue" items={step.output} />
        </div>
      </div>
    );
  }
  return (
    <div className="trace-step">
      <div className="trace-step__head">
        <span className="trace-step__index">{index}</span>
        <span className="trace-step__action">{step.action}</span>
        <span className="trace-step__token">{step.token}</span>
        {step.result !== undefined && (
          <span className="trace-step__result">= {step.result}</span>
        )}
      </div>
      <div className="trace-step__row">
        <StackView label="value stack" items={step.stack} highlightTop />
      </div>
    </div>
  );
}
