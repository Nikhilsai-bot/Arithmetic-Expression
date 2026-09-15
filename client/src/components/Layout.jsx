import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Home", end: true },
  { to: "/calculator", label: "Calculator" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/history", label: "History" },
  { to: "/about", label: "About" },
];

export default function Layout({ children }) {
  return (
    <div className="site">
      <header className="site__header">
        <div className="site__title">
          <span className="site__mark">§</span>
          Stack-Based Expression Evaluator
        </div>
        <nav className="site__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "site__navlink" + (isActive ? " site__navlink--active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="page">{children}</main>
      <footer className="site__footer">
        DSA Capstone Project — Shunting-Yard Algorithm &amp; Postfix Evaluation
      </footer>
    </div>
  );
}
