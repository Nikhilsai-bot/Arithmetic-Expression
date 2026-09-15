import { Link } from "react-router-dom";
import AppMockup from "../components/AppMockup";
import "./Landing.css";

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing__nav">
        <div className="landing__brand">
          <span className="landing__mark">§</span>
          Stack Evaluator
        </div>
        <div className="landing__navlinks">
          <Link to="/how-it-works">How It Works</Link>
          <Link to="/history">History</Link>
          <Link to="/about">About</Link>
        </div>
        <Link to="/calculator" className="landing__navcta">
          Try the Calculator
        </Link>
      </header>

      <section className="landing__hero">
        <div className="landing__copy">
          <h1 className="landing__headline">
            Welcome to
            <br />
            Stack Evaluator
          </h1>
          <p className="landing__sub">
            See exactly how an arithmetic expression gets evaluated — from
            Dijkstra's Shunting-Yard algorithm to postfix evaluation, one
            stack push and pop at a time.
          </p>
          <div className="landing__actions">
            <Link to="/calculator" className="landing__cta">
              Try the Calculator
            </Link>
            <Link to="/how-it-works" className="landing__cta-secondary">
              How It Works
            </Link>
          </div>
        </div>

        <div className="landing__art">
          <AppMockup />
        </div>
      </section>

      <footer className="landing__footer">
        DSA Capstone Project — Shunting-Yard Algorithm &amp; Postfix Evaluation
      </footer>
    </div>
  );
}
