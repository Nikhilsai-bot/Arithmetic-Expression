import { useEffect, useRef, useState } from "react";
import { useLocation, Routes } from "react-router-dom";

const EXIT_MS = 220;

/**
 * Wraps <Routes> so that navigating between pages plays an exit animation
 * on the old page, then an enter animation on the new one. It also reveals
 * elements (sections, table rows, etc.) as they scroll into view.
 */
export default function PageTransition({ children }) {
  const location = useLocation();
  const [displayed, setDisplayed] = useState(location);
  const [phase, setPhase] = useState("enter");
  const ref = useRef(null);

  useEffect(() => {
    if (location.pathname === displayed.pathname) {
      setDisplayed(location);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplayed(location);
      return;
    }
    setPhase("exit");
    const t = setTimeout(() => {
      setDisplayed(location);
      setPhase("enter");
      window.scrollTo({ top: 0 });
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [location, displayed.pathname]);

  // Scroll-reveal: tag matching elements and fade them in when visible.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SELECTOR = ".section, .page__lede, .meta-list > div, .rule-list li, .code-block, .data-table tbody tr";
    if (reduce || !("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );

    const register = (el, i) => {
      if (el.dataset.revealed) return;
      el.dataset.revealed = "1";
      el.classList.add("reveal");
      el.style.setProperty("--reveal-delay", `${Math.min(i, 8) * 70}ms`);
      io.observe(el);
    };

    const scan = () => root.querySelectorAll(SELECTOR).forEach(register);
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [displayed.pathname]);

  return (
    <div
      ref={ref}
      key={displayed.pathname}
      className={"page-transition page-transition--" + phase}
    >
      <Routes location={displayed}>{children}</Routes>
    </div>
  );
}
