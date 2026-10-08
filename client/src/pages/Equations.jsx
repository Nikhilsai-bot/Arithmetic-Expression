import { useSearchParams } from "react-router-dom";
import EquationSolver from "../components/EquationSolver";
import ModeSwitch from "../components/ModeSwitch";

export default function Equations() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  return (
    <>
      <ModeSwitch current="equations" />
      <p className="page__lede">
        Solve equations with variables. One unknown of any degree (real <em>and</em> complex roots),
        several unknowns in a system, or non-polynomial equations such as <code>cos(x) = x</code>.
        Each equation is parsed with the same stack-based Shunting-Yard algorithm as the arithmetic
        calculator, then solved numerically or by Gaussian elimination.
      </p>
      <EquationSolver key={q} initial={q} />
    </>
  );
}
