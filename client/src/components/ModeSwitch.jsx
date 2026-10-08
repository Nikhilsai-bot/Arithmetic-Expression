import { Link } from "react-router-dom";

// Small switcher shown above both calculators so you can change problem type.
export default function ModeSwitch({ current }) {
  return (
    <div className="modeswitch" role="navigation" aria-label="Problem type">
      <Link to="/calculator" className="modeswitch__back">← Change problem type</Link>
      <div className="modeswitch__pills">
        <Link
          to="/calculator/arithmetic"
          className={"modeswitch__pill" + (current === "arithmetic" ? " modeswitch__pill--active" : "")}
        >
          1 · Arithmetic
        </Link>
        <Link
          to="/calculator/equations"
          className={"modeswitch__pill" + (current === "equations" ? " modeswitch__pill--active" : "")}
        >
          2 · Variable equations
        </Link>
      </div>
    </div>
  );
}
