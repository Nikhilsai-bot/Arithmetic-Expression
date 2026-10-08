import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { classifyProblem } from "../utils/classify";
import "./Hub.css";

const OPTIONS = [
  {
    to: "/calculator/arithmetic",
    num: "1",
    title: "Arithmetic problem",
    blurb: "Numbers only — brackets, powers, trig, logs, factorials. See the Shunting-Yard and postfix stack trace.",
    examples: ["3 + 4 * (2 - 1) ^ 2", "sin(30) + sqrt(16)"],
  },
  {
    to: "/calculator/equations",
    num: "2",
    title: "Variable equation",
    blurb: "Letters like x, y, z — solve one or many equations: any degree, several variables, even complex roots.",
    examples: ["x^3 - 6x^2 + 11x - 6 = 0", "x + y = 5; x - y = 1"],
  },
];

export default function CalculatorHub() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const guess = query.trim() ? classifyProblem(query) : null;

  const go = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/calculator/${classifyProblem(q)}?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="hub">
      <h1 className="hub__title">What are you solving today?</h1>
      <p className="hub__lede">
        Type a problem and we will open the right calculator, or choose a problem type below.
      </p>

      <form className="hub__search" onSubmit={go} role="search">
        <input
          className="hub__input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or type a problem, e.g. 2x + 3 = 11  or  (4 + 5) * 3"
          aria-label="Type a problem"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <button className="hub__go" type="submit" disabled={!query.trim()}>
          Solve →
        </button>
      </form>

      <div className="hub__hint" aria-live="polite">
        {guess === "equations" && <>Looks like a <strong>variable equation</strong> — it will open in the equation solver.</>}
        {guess === "arithmetic" && <>Looks like an <strong>arithmetic problem</strong> — it will open in the standard calculator.</>}
        {!guess && <>Tip: anything with a letter such as x, or an “=” sign, is treated as an equation.</>}
      </div>

      <div className="hub__divider"><span>or choose</span></div>

      <div className="hub__options">
        {OPTIONS.map((o) => (
          <Link key={o.to} to={o.to} className={"hub__card" + (guess && o.to.endsWith(guess) ? " hub__card--match" : "")}>
            <span className="hub__num">{o.num}</span>
            <span className="hub__card-title">{o.title}</span>
            <span className="hub__card-blurb">{o.blurb}</span>
            <span className="hub__card-examples">
              {o.examples.map((ex) => <code key={ex}>{ex}</code>)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
