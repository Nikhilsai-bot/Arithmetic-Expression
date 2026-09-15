import { Link } from "react-router-dom";
import StackIllustration from "../components/StackIllustration";
import "./Landing.css";

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing__nav">
        <div className="landing__brand">
          <span className="landing__mark">§</span>
          Stack Evaluator
        </div>
        <nav className="landing__navlinks">
          <Link to="/how-it-works">How It Works</Link>
          <Link to="/history">History</Link>
          <Link to="/about">About</Link>
        </nav>
        <Link to="/calculator" className="landing__navcta">
          Try the Calculator
        </Link>
      </header>

      <section className="landing__hero">
        <div className="landing__copy">
          <p className="landing__eyebrow">DSA Capstone Project</p>
          <h1 className="landing__headline">
            HOW AN
            <br />
            EXPRESSION
            <br />
            GETS EVALUATED
          </h1>
          <p className="landing__sub">
            A working arithmetic calculator built to show exactly how a stack
            evaluates expressions — from Dijkstra's Shunting-Yard algorithm
            to postfix evaluation, one push and pop at a time.
          </p>
          <div className="landing__actions">
            <Link to="/calculator" className="landing__cta">
              Try the Calculator →
            </Link>
            <Link to="/how-it-works" className="landing__cta-secondary">
              See how it works
            </Link>
          </div>
        </div>

        <div className="landing__art">
          <StackIllustration />
        </div>
      </section>

      <footer className="landing__footer">
        DSA Capstone Project — Shunting-Yard Algorithm &amp; Postfix Evaluation
      </footer>
    </div>
  );
}
