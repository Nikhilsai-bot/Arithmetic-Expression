import { useLayoutEffect, useRef, useState } from "react";
import "./Casio.css";

const API = import.meta.env.VITE_API_URL || "/api";

const SUBSCRIPT = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
const sub = (n) => String(n).split("").map((d) => SUBSCRIPT[Number(d)]).join("");

const EXAMPLES = [
  "x^2 - 5x + 6 = 0",
  "x^3 - 6x^2 + 11x - 6 = 0",
  "x^2 + 2x + 5 = 0",
  "x^4 - 10x^2 + 9 = 0",
  "x + y = 5; x - y = 1",
  "x + y + z = 6; 2y + 5z = -4; 2x + 5y - z = 27",
  "x^2 + y^2 = 25; x - y = 1",
  "cos(x) = x",
];

// ---- keypad definition -------------------------------------------------
// plain / shift / alpha are [action, argument]. y = yellow (SHIFT) legend,
// r = red (ALPHA) legend, both printed above the key as on the real device.
const K = (label, plain, o = {}) => ({ label, plain, ...o });

const ROW2_LEFT = [
  K("CALC", ["solve"], { y: "SOLVE", shift: ["solve"], r: "=", alpha: ["ins", "="] }),
  K("∫dx", ["noop"], { y: "d/dx", dim: true }),
];
const ROW2_RIGHT = [
  K("x⁻¹", ["ins", "^(-1)"], { y: "x!", shift: ["ins", "!"] }),
  K("x³", ["ins", "^3"], { y: "³√", shift: ["ins", "^(1/3)"] }),
];
const ROWS = [
  [
    K("a b/c", ["ins", "/"]),
    K("√", ["ins", "sqrt("]),
    K("x²", ["ins", "^2"]),
    K("^", ["ins", "^"], { y: "ˣ√", shift: ["ins", "^(1/"] }),
    K("log", ["ins", "log("], { y: "10ˣ", shift: ["ins", "10^("] }),
    K("ln", ["ins", "ln("], { y: "eˣ", shift: ["ins", "e^("] }),
  ],
  [
    K("(−)", ["ins", "-"], { r: "a", alpha: ["ins", "a"] }),
    K("°′″", ["noop"], { r: "b", alpha: ["ins", "b"], dim: true }),
    K("hyp", ["noop"], { r: "c", alpha: ["ins", "c"], dim: true }),
    K("sin", ["ins", "sin("], { y: "sin⁻¹", shift: ["ins", "asin("], r: "d", alpha: ["ins", "d"] }),
    K("cos", ["ins", "cos("], { y: "cos⁻¹", shift: ["ins", "acos("], r: "e", alpha: ["ins", "e"] }),
    K("tan", ["ins", "tan("], { y: "tan⁻¹", shift: ["ins", "atan("], r: "t", alpha: ["ins", "t"] }),
  ],
  [
    K("RCL", ["rcl"], { y: "STO" }),
    K("ENG", ["eng"]),
    K("(", ["ins", "("], { r: "x", alpha: ["ins", "x"] }),
    K(")", ["ins", ")"], { r: "y", alpha: ["ins", "y"] }),
    K(",", ["ins", "; "], { r: "z", alpha: ["ins", "z"], title: "Separates equations in a system" }),
    K("M+", ["mplus"], { y: "M−", shift: ["mminus"], r: "m", alpha: ["ins", "m"] }),
  ],
];
const NUM_ROWS = [
  [K("7", ["ins", "7"]), K("8", ["ins", "8"]), K("9", ["ins", "9"]), K("DEL", ["del"], { cls: "ckey--del" }), K("AC", ["clear"], { cls: "ckey--del" })],
  [K("4", ["ins", "4"]), K("5", ["ins", "5"]), K("6", ["ins", "6"]), K("×", ["ins", "*"]), K("÷", ["ins", "/"])],
  [K("1", ["ins", "1"]), K("2", ["ins", "2"]), K("3", ["ins", "3"]), K("+", ["ins", "+"]), K("−", ["ins", "-"])],
  [
    K("0", ["ins", "0"]),
    K(".", ["ins", "."]),
    K("×10ˣ", ["ins", "*10^"], { y: "π", shift: ["ins", "pi"] }),
    K("Ans", ["ans"]),
    K("=", ["solve"], { cls: "ckey--eq" }),
  ],
];

// ---- result helpers ----------------------------------------------------

function buildItems(data) {
  if (!data) return [];
  if (data.kind === "identity") return [{ text: `All real ${data.variables[0]}` }];
  if (data.kind === "none") return [{ text: "No solution" }];
  if (data.kind === "infinite") return data.parametric.map((text) => ({ text }));
  const single = data.variables.length === 1;
  const many = data.solutions.length > 1;
  const items = [];
  data.solutions.forEach((sol, i) => {
    data.variables.forEach((v) => {
      const val = sol[v];
      items.push({
        label: single && many ? `${v}${sub(i + 1)}` : v,
        text: val.text,
        re: val.im === 0 ? val.re : null,
      });
    });
  });
  return items;
}

// 12345.6 -> { mant: "1.23456", exp: 4 } for the SCI display.
function toSci(n) {
  if (n === 0) return { mant: "0", exp: 0 };
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const mant = Number((n / Math.pow(10, exp)).toPrecision(10));
  return { mant: String(mant), exp };
}

function errorLabel(message) {
  return /Malformed|Unexpected|Bad number|brackets|missing|more than one|brackets|Write /i.test(message) ? "Syntax ERROR" : "Math ERROR";
}

// ---- component ---------------------------------------------------------

export default function EquationSolver({ initial = "" }) {
  const [expr, setExpr] = useState(initial);
  const [shift, setShift] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const [angle, setAngle] = useState("rad");
  const [sci, setSci] = useState(false);
  const [mem, setMem] = useState(0);
  const [state, setState] = useState({ status: "idle", data: null, error: "" });
  const [idx, setIdx] = useState(0);
  const [lastAns, setLastAns] = useState(null);

  const inputRef = useRef(null);
  const pendingCursor = useRef(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (pendingCursor.current !== null && el) {
      const pos = Math.min(pendingCursor.current, el.value.length);
      el.focus();
      el.setSelectionRange(pos, pos);
      pendingCursor.current = null;
    }
  }, [expr]);

  const items = state.status === "ok" ? buildItems(state.data) : [];
  const current = items[idx];

  const selection = () => {
    const el = inputRef.current;
    return el ? [el.selectionStart ?? expr.length, el.selectionEnd ?? expr.length] : [expr.length, expr.length];
  };

  const insert = (text) => {
    const [start, end] = selection();
    setExpr((prev) => prev.slice(0, Math.min(start, prev.length)) + text + prev.slice(Math.min(end, prev.length)));
    pendingCursor.current = start + text.length;
  };

  const backspace = () => {
    const [start, end] = selection();
    if (start !== end) {
      setExpr((prev) => prev.slice(0, start) + prev.slice(end));
      pendingCursor.current = start;
    } else if (start > 0) {
      setExpr((prev) => prev.slice(0, start - 1) + prev.slice(start));
      pendingCursor.current = start - 1;
    }
  };

  const moveCaret = (delta) => {
    const el = inputRef.current;
    if (!el) return;
    const pos = Math.max(0, Math.min(el.value.length, (el.selectionStart ?? 0) + delta));
    el.focus();
    el.setSelectionRange(pos, pos);
  };

  const clearResult = () => {
    setState({ status: "idle", data: null, error: "" });
    setIdx(0);
  };

  const solve = async (text = expr) => {
    if (!text.trim()) return;
    setState({ status: "loading", data: null, error: "" });
    setIdx(0);
    try {
      const res = await fetch(`${API}/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equations: text, angleMode: angle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ status: "error", data: null, error: data.error || "Something went wrong" });
        return;
      }
      setState({ status: "ok", data, error: "" });
      const first = buildItems(data)[0];
      if (first && first.re != null) setLastAns(first.re);
    } catch {
      setState({ status: "error", data: null, error: "Could not reach the server. Is the backend running?" });
    }
  };

  const fmtNumber = (n) => String(Number(n.toPrecision(10)));

  const run = (action) => {
    const [kind, arg] = action;
    switch (kind) {
      case "ins": insert(arg); break;
      case "del": backspace(); break;
      case "clear": setExpr(""); clearResult(); pendingCursor.current = 0; break;
      case "solve": solve(); break;
      case "mode": setAngle((a) => (a === "rad" ? "deg" : "rad")); break;
      case "clearAll": setExpr(""); setMem(0); setLastAns(null); clearResult(); break;
      case "on": setExpr(""); setMem(0); setLastAns(null); setSci(false); setAngle("rad"); clearResult(); break;
      case "eng": setSci((s) => !s); break;
      case "ans": if (lastAns !== null) insert(fmtNumber(lastAns)); break;
      case "rcl": insert(fmtNumber(mem)); break;
      case "mplus": if (current?.re != null) setMem((m) => m + current.re); break;
      case "mminus": if (current?.re != null) setMem((m) => m - current.re); break;
      case "up": if (items.length) setIdx((i) => (i - 1 + items.length) % items.length); break;
      case "down": if (items.length) setIdx((i) => (i + 1) % items.length); break;
      case "left": moveCaret(-1); break;
      case "right": moveCaret(1); break;
      default: break;
    }
  };

  const press = (def) => {
    let action = def.plain;
    if (shift && def.shift) action = def.shift;
    else if (alpha && def.alpha) action = def.alpha;
    else if (shift && def.plain[0] === "mode") action = ["clearAll"];
    setShift(false);
    setAlpha(false);
    run(action);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      solve();
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      run(["up"]);
    } else if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      run(["down"]);
    }
  };

  const renderKey = (def, extra = "", style) => (
    <div className={"ckey-cell " + extra} key={def.label + (def.y || "")} style={style}>
      <div className="ckey-legend">
        <span className="ckey-legend__y">{def.y}</span>
        <span className="ckey-legend__r">{def.r}</span>
      </div>
      <button
        type="button"
        className={"ckey " + (def.cls || "") + (def.dim ? " ckey--dim" : "")}
        onClick={() => press(def)}
        title={def.title}
      >
        {def.label}
      </button>
    </div>
  );

  // ----- LCD content -----
  let bottom;
  if (state.status === "loading") bottom = <span className="lcd__busy">…</span>;
  else if (state.status === "error") bottom = <span className="lcd__error">{errorLabel(state.error)}</span>;
  else if (current) {
    let value = current.text;
    let exp = null;
    if (sci && current.re != null && current.re !== 0) {
      const s = toSci(current.re);
      value = s.mant;
      exp = String(s.exp).padStart(2, "0");
    }
    bottom = (
      <>
        {current.label && <span className="lcd__label">{current.label} =</span>}
        <span className="lcd__value">{value}</span>
        {exp !== null && <span className="lcd__exp"><small>×10</small><sup>{exp}</sup></span>}
      </>
    );
  } else bottom = <span className="lcd__value">&nbsp;</span>;

  const data = state.data;

  return (
    <div className="solver">
      <div className="casio" onMouseDown={(e) => { if (e.target.closest("button")) e.preventDefault(); }}>
        <div className="casio__head">
          <span className="casio__brand">STACKCALC</span>
          <span className="casio__center">EQUATION · SOLVER</span>
          <span className="casio__model">fx-100EQ</span>
        </div>

        <div className="lcd-frame">
          <div className="lcd">
            <div className="lcd__flags">
              <span className={shift ? "on" : ""}>S</span>
              <span className={alpha ? "on" : ""}>A</span>
              <span className={mem !== 0 ? "on" : ""}>M</span>
              <span className="on">{angle === "deg" ? "DEG" : "RAD"}</span>
              {sci && <span className="on">SCI</span>}
              <span className="lcd__flags-end">
                {items.length > 1 && <span className="on">{idx + 1}/{items.length} ▲▼</span>}
              </span>
            </div>
            <input
              ref={inputRef}
              className="lcd__input"
              value={expr}
              onChange={(e) => { setExpr(e.target.value); }}
              onKeyDown={onKeyDown}
              placeholder="x²−5x+6=0"
              inputMode="none"
              spellCheck={false}
              autoComplete="off"
              aria-label="Equation input"
            />
            <div className="lcd__result" aria-live="polite">{bottom}</div>
          </div>
        </div>

        <div className="ckeys-top">
          <div className="ckey-cell" style={{ gridColumn: 1, gridRow: 1 }}>
            <div className="ckey-legend"><span className="ckey-legend__y">SHIFT</span></div>
            <button type="button" className={"ckey ckey--round" + (shift ? " ckey--lit-y" : "")} aria-label="SHIFT" onClick={() => { setShift((s) => !s); setAlpha(false); }} />
          </div>
          <div className="ckey-cell" style={{ gridColumn: 2, gridRow: 1 }}>
            <div className="ckey-legend"><span className="ckey-legend__r">ALPHA</span></div>
            <button type="button" className={"ckey ckey--round" + (alpha ? " ckey--lit-r" : "")} aria-label="ALPHA" onClick={() => { setAlpha((a) => !a); setShift(false); }} />
          </div>

          <div className="cpad" style={{ gridColumn: "3 / 5", gridRow: "1 / 3" }}>
            <span className="cpad__copy">COPY</span>
            <div className="cpad__ring">
              <button type="button" className="cpad__btn cpad__up" aria-label="Previous solution" onClick={() => run(["up"])}>▲</button>
              <button type="button" className="cpad__btn cpad__down" aria-label="Next solution" onClick={() => run(["down"])}>▼</button>
              <button type="button" className="cpad__btn cpad__left" aria-label="Cursor left" onClick={() => run(["left"])}>◀</button>
              <button type="button" className="cpad__btn cpad__right" aria-label="Cursor right" onClick={() => run(["right"])}>▶</button>
              <span className="cpad__core" />
            </div>
          </div>

          <div className="ckey-cell" style={{ gridColumn: 5, gridRow: 1 }}>
            <div className="ckey-legend"><span className="ckey-legend__w">MODE</span><span className="ckey-legend__y">CLR</span></div>
            <button type="button" className="ckey ckey--round" aria-label="MODE (toggle degrees/radians)" title="MODE: toggle DEG/RAD · SHIFT+MODE: clear all" onClick={() => press(K("MODE", ["mode"]))} />
          </div>
          <div className="ckey-cell" style={{ gridColumn: 6, gridRow: 1 }}>
            <div className="ckey-legend"><span className="ckey-legend__w">ON</span></div>
            <button type="button" className="ckey ckey--round" aria-label="ON (reset)" onClick={() => press(K("ON", ["on"]))} />
          </div>

          {ROW2_LEFT.map((k, i) => renderKey(k, "", { gridColumn: i + 1, gridRow: 2 }))}
          {ROW2_RIGHT.map((k, i) => renderKey(k, "", { gridColumn: i + 5, gridRow: 2 }))}
        </div>

        <div className="ckeys-mid">
          {ROWS.flat().map((k) => renderKey(k))}
        </div>

        <div className="ckeys-num">
          {NUM_ROWS.flat().map((k) => renderKey(k, "ckey-cell--num"))}
        </div>
      </div>

      <div className="solver__panel">
        <p className="solver__help">
          Type on the keypad or your keyboard. Press <b className="y">SHIFT</b> or <b className="r">ALPHA</b> then a key
          for the coloured legend above it (ALPHA gives <code>x y z a b c d e t</code>; <code>e</code> is Euler’s number).
          The <code>,</code> key separates equations in a system. Use ▲▼ to step through solutions.
        </p>

        <div className="solver__examples">
          <span className="solver__label">Try an example</span>
          <div className="solver__chips">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip" onClick={() => { setExpr(ex); clearResult(); }}>{ex}</button>
            ))}
          </div>
        </div>

        {state.status === "error" && <div className="solver__error">{state.error}</div>}

        {state.status === "ok" && data && (
          <div className="solver__result">
            <div className="solver__label">Result</div>
            <div className="solver__method">{data.method}</div>

            {data.kind === "solutions" && (
              <table className="solver__table">
                <thead>
                  <tr>{data.solutions.length > 1 && <th>#</th>}{data.variables.map((v) => <th key={v}>{v}</th>)}</tr>
                </thead>
                <tbody>
                  {data.solutions.map((sol, i) => (
                    <tr key={i}>
                      {data.solutions.length > 1 && <td>{i + 1}</td>}
                      {data.variables.map((v) => (
                        <td key={v}>
                          {sol[v].text}
                          {sol[v].multiplicity > 1 && <sup title="repeated root"> ×{sol[v].multiplicity}</sup>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.kind === "infinite" && (
              <ul className="solver__param">{data.parametric.map((t) => <li key={t}>{t}</li>)}</ul>
            )}
            {(data.kind === "none" || data.kind === "identity") && (
              <p className="solver__verdict">{current?.text}</p>
            )}
            {data.note && <p className="solver__note">{data.note}</p>}

            <details className="solver__steps">
              <summary>Show the algorithm steps</summary>
              <pre>{data.steps.join("\n")}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
