// Equation solver — the "variable" half of the calculator.
//
// It reuses the same DSA machinery as the arithmetic calculator (tokenizer ->
// Shunting-Yard -> postfix evaluation, all on the hand-written Stack), extended
// with variables, unary minus as a real operator, and implicit multiplication
// ("2x", "3(x+1)", "xy").
//
// Every equation "lhs = rhs" is turned into f = lhs - rhs, then solved by:
//   * Polynomial in one variable, ANY degree -> evaluate f with polynomial
//     values on the stack to get exact coefficients, then find all roots
//     (real and complex): closed form for degree 1-2, Durand-Kerner for more.
//   * Linear system (any number of variables) -> Gaussian elimination, with
//     unique / infinite (parametric) / no-solution detection.
//   * Anything else (sin(x)=x/2, x^2+y^2=25 with x-y=1, ...) -> numeric search:
//     sign-change scan for one variable, damped multi-start Newton for systems.

const Stack = require("./stack");

const FUNCTIONS = ["asin", "acos", "atan", "sin", "cos", "tan", "sqrt", "log", "ln"]; // longest first
const FUNCTION_SET = new Set(FUNCTIONS);
const PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, neg: 3, "^": 4 };
const RIGHT_ASSOCIATIVE = new Set(["^"]);
const MAX_VARIABLES = 6;
const MAX_DEGREE = 40;

class NotPolynomial extends Error {}

// ---------- tokenizer ---------------------------------------------------

const isNum = (t) => /^[0-9.]+$/.test(t);
const isConst = (t) => t === "pi" || t === "e";
const isVar = (t) => /^[a-z]$/.test(t) && t !== "e";
const isFn = (t) => FUNCTION_SET.has(t);
const isBinary = (t) => ["+", "-", "*", "/", "%", "^"].includes(t);

function tokenize(text) {
  const s = text
    .replace(/\s+/g, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .toLowerCase();

  const raw = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
      if (!/^(\d+\.?\d*|\.\d+)$/.test(num)) throw new Error(`Bad number '${num}'`);
      raw.push(num);
    } else if (/[a-z]/.test(ch)) {
      const fn = FUNCTIONS.find((f) => s.startsWith(f, i));
      if (fn) {
        if (s[i + fn.length] !== "(") throw new Error(`Write ${fn} with brackets, e.g. ${fn}(x)`);
        raw.push(fn);
        i += fn.length;
      } else if (s.startsWith("pi", i)) {
        raw.push("pi");
        i += 2;
      } else {
        raw.push(ch);
        i++;
      }
    } else if ("+-*/%^()!".includes(ch)) {
      raw.push(ch);
      i++;
    } else {
      throw new Error(`Unexpected character '${ch}'`);
    }
  }

  // Unary minus / plus, then implicit multiplication.
  const tokens = [];
  for (const t of raw) {
    const prev = tokens[tokens.length - 1];
    const atStart = prev === undefined || prev === "(" || isBinary(prev) || prev === "neg";
    if (t === "-" && atStart) {
      tokens.push("neg");
      continue;
    }
    if (t === "+" && atStart) continue;

    const prevEndsValue = prev !== undefined && (isNum(prev) || isVar(prev) || isConst(prev) || prev === ")" || prev === "!");
    const startsValue = isNum(t) || isVar(t) || isConst(t) || t === "(" || isFn(t);
    if (prevEndsValue && startsValue) tokens.push("*");
    tokens.push(t);
  }

  // Auto-close any unclosed brackets, like the arithmetic calculator.
  const open = tokens.filter((t) => t === "(").length;
  const close = tokens.filter((t) => t === ")").length;
  if (close > open) throw new Error("Too many closing brackets");
  for (let k = 0; k < open - close; k++) tokens.push(")");
  return tokens;
}

// ---------- Shunting-Yard -----------------------------------------------

function toPostfix(tokens) {
  const output = [];
  const ops = new Stack();
  for (const t of tokens) {
    if (isNum(t) || isVar(t) || isConst(t)) output.push(t);
    else if (isFn(t) || t === "neg" || t === "(") ops.push(t); // prefix things just wait on the stack
    else if (t === "!") output.push(t);
    else if (t === ")") {
      while (!ops.isEmpty() && ops.peek() !== "(") output.push(ops.pop());
      ops.pop();
      if (!ops.isEmpty() && isFn(ops.peek())) output.push(ops.pop());
    } else {
      while (
        !ops.isEmpty() &&
        ops.peek() !== "(" &&
        !isFn(ops.peek()) &&
        (PRECEDENCE[ops.peek()] > PRECEDENCE[t] ||
          (PRECEDENCE[ops.peek()] === PRECEDENCE[t] && !RIGHT_ASSOCIATIVE.has(t)))
      ) {
        output.push(ops.pop());
      }
      ops.push(t);
    }
  }
  while (!ops.isEmpty()) output.push(ops.pop());
  return output;
}

// ---------- numeric postfix evaluation ----------------------------------

function applyFunction(name, a, angleMode) {
  const toRad = (x) => (angleMode === "deg" ? (x * Math.PI) / 180 : x);
  const fromRad = (x) => (angleMode === "deg" ? (x * 180) / Math.PI : x);
  switch (name) {
    case "sin": return Math.sin(toRad(a));
    case "cos": return Math.cos(toRad(a));
    case "tan": return Math.tan(toRad(a));
    case "asin": return a < -1 || a > 1 ? NaN : fromRad(Math.asin(a));
    case "acos": return a < -1 || a > 1 ? NaN : fromRad(Math.acos(a));
    case "atan": return fromRad(Math.atan(a));
    case "log": return a <= 0 ? NaN : Math.log10(a);
    case "ln": return a <= 0 ? NaN : Math.log(a);
    case "sqrt": return a < 0 ? NaN : Math.sqrt(a);
    case "!": {
      if (a < 0 || !Number.isInteger(a) || a > 170) return NaN;
      let r = 1;
      for (let k = 2; k <= a; k++) r *= k;
      return r;
    }
    default: throw new Error(`Unknown function '${name}'`);
  }
}

// Domain problems (log of a negative, divide by zero) give NaN rather than an
// exception, so root-finding can just skip those points.
function evalNumeric(postfix, vars, angleMode) {
  const st = new Stack();
  for (const t of postfix) {
    if (isNum(t)) st.push(parseFloat(t));
    else if (t === "pi") st.push(Math.PI);
    else if (t === "e") st.push(Math.E);
    else if (isVar(t)) st.push(vars[t]);
    else if (t === "neg" || t === "!" || isFn(t)) {
      const a = st.pop();
      if (a === undefined) throw new Error("Malformed expression — check for a missing number or operator");
      st.push(t === "neg" ? -a : applyFunction(t, a, angleMode));
    } else {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("Malformed expression — check for a missing number or operator");
      switch (t) {
        case "+": st.push(a + b); break;
        case "-": st.push(a - b); break;
        case "*": st.push(a * b); break;
        case "/": st.push(b === 0 ? NaN : a / b); break;
        case "%": st.push(b === 0 ? NaN : a % b); break;
        case "^": st.push(Math.pow(a, b)); break;
        default: throw new Error(`Unknown operator '${t}'`);
      }
    }
  }
  if (st.size() !== 1) throw new Error("Malformed expression");
  const out = st.pop();
  return Number.isFinite(out) ? out : NaN;
}

// ---------- polynomial postfix evaluation -------------------------------
// Same algorithm, but the values on the stack are polynomials (coefficient
// arrays, lowest degree first). A constant is just a degree-0 polynomial.

const trim = (p) => {
  let n = p.length;
  while (n > 1 && Math.abs(p[n - 1]) < 1e-12) n--;
  return p.slice(0, n);
};
const polyAdd = (a, b) => trim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || 0) + (b[i] || 0)));
const polyNeg = (a) => a.map((c) => -c);
const polyMul = (a, b) => {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return trim(out);
};
const isConstPoly = (p) => p.length === 1;

function evalPolynomial(postfix, variable, angleMode) {
  const st = new Stack();
  for (const t of postfix) {
    if (isNum(t)) st.push([parseFloat(t)]);
    else if (t === "pi") st.push([Math.PI]);
    else if (t === "e") st.push([Math.E]);
    else if (isVar(t)) {
      if (t !== variable) throw new NotPolynomial();
      st.push([0, 1]);
    } else if (t === "neg") st.push(polyNeg(st.pop()));
    else if (t === "!" || isFn(t)) {
      const a = st.pop();
      if (!isConstPoly(a)) throw new NotPolynomial();
      const v = applyFunction(t, a[0], angleMode);
      if (Number.isNaN(v)) throw new Error(`${t} is not defined for ${a[0]}`);
      st.push([v]);
    } else {
      const b = st.pop();
      const a = st.pop();
      switch (t) {
        case "+": st.push(polyAdd(a, b)); break;
        case "-": st.push(polyAdd(a, polyNeg(b))); break;
        case "*": st.push(polyMul(a, b)); break;
        case "/":
          if (!isConstPoly(b)) throw new NotPolynomial();
          if (b[0] === 0) throw new Error("Division by zero");
          st.push(a.map((c) => c / b[0]));
          break;
        case "%":
          if (!isConstPoly(a) || !isConstPoly(b)) throw new NotPolynomial();
          st.push([a[0] % b[0]]);
          break;
        case "^": {
          if (!isConstPoly(b)) throw new NotPolynomial();
          const n = b[0];
          if (isConstPoly(a)) {
            st.push([Math.pow(a[0], n)]);
          } else {
            if (!Number.isInteger(n) || n < 0 || n > MAX_DEGREE) throw new NotPolynomial();
            let r = [1];
            for (let k = 0; k < n; k++) r = polyMul(r, a);
            st.push(r);
          }
          break;
        }
        default: throw new Error(`Unknown operator '${t}'`);
      }
    }
    const top = st.peek();
    if (top && top.length - 1 > MAX_DEGREE) throw new NotPolynomial();
  }
  if (st.size() !== 1) throw new Error("Malformed expression");
  return st.pop();
}

// ---------- complex helpers + polynomial roots --------------------------

const C = {
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  abs: (a) => Math.hypot(a.re, a.im),
};

function polyEvalComplex(coeffs, z) {
  let acc = { re: 0, im: 0 };
  for (let k = coeffs.length - 1; k >= 0; k--) acc = C.add(C.mul(acc, z), { re: coeffs[k], im: 0 });
  return acc;
}

function polynomialRoots(p) {
  const d = p.length - 1;
  if (d === 1) return [{ re: -p[0] / p[1], im: 0 }];
  if (d === 2) {
    const [c, b, a] = p;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      // numerically stable form
      const q = -0.5 * (b + (b >= 0 ? sq : -sq));
      const r1 = q / a;
      const r2 = q === 0 ? r1 : c / q;
      return [{ re: r1, im: 0 }, { re: r2, im: 0 }];
    }
    const sq = Math.sqrt(-disc);
    return [{ re: -b / (2 * a), im: sq / (2 * a) }, { re: -b / (2 * a), im: -sq / (2 * a) }];
  }

  // Durand-Kerner on the monic polynomial.
  const lead = p[d];
  const m = p.map((c) => c / lead);
  const radius = 1 + Math.max(...m.slice(0, d).map(Math.abs));
  let z = Array.from({ length: d }, (_, k) => {
    const ang = (2 * Math.PI * k) / d + 0.4;
    return { re: radius * 0.6 * Math.cos(ang), im: radius * 0.6 * Math.sin(ang) };
  });
  for (let iter = 0; iter < 5000; iter++) {
    let maxStep = 0;
    z = z.map((zi, i) => {
      let denom = { re: 1, im: 0 };
      for (let j = 0; j < d; j++) if (j !== i) denom = C.mul(denom, C.sub(zi, z[j]));
      if (C.abs(denom) === 0) return zi;
      const step = C.div(polyEvalComplex(m, zi), denom);
      maxStep = Math.max(maxStep, C.abs(step));
      return C.sub(zi, step);
    });
    if (maxStep < 1e-15 * radius) break;
  }
  return z;
}

// --- repeated roots: split p into its square-free part with a polynomial GCD ---
const polyDeriv = (p) => (p.length <= 1 ? [0] : p.slice(1).map((c, i) => c * (i + 1)));

// Polynomial long division on real coefficients; returns { q, r }.
function polyDivide(a, b) {
  let r = a.slice();
  const db = b.length - 1;
  const q = new Array(Math.max(a.length - b.length + 1, 1)).fill(0);
  for (let k = a.length - 1; k >= db; k--) {
    const f = r[k] / b[db];
    q[k - db] = f;
    for (let j = 0; j <= db; j++) r[k - db + j] -= f * b[j];
    r[k] = 0;
  }
  return { q: trim(q), r: r.slice(0, Math.max(db, 1)) };
}

function polyGcd(a, b) {
  const scale = Math.max(...a.map(Math.abs), ...b.map(Math.abs));
  const small = (poly) => poly.every((c) => Math.abs(c) < 1e-9 * scale);
  let x = a;
  let y = b;
  while (!(y.length === 1 && Math.abs(y[0]) < 1e-9 * scale) && !small(y)) {
    const { r } = polyDivide(x, y);
    x = y;
    y = trim(r);
    if (y.length === 1 && Math.abs(y[0]) < 1e-9 * scale) break;
  }
  const lead = x[x.length - 1];
  return x.map((c) => c / lead);
}

// All roots of p with multiplicities, accurate even for repeated roots.
function polynomialRootsWithMultiplicity(p) {
  const d = p.length - 1;
  const g = polyGcd(p, polyDeriv(p));
  if (g.length > 1) {
    const { q } = polyDivide(p, g); // square-free part: every root of p, once
    if (q.length > 1) {
      const distinct = polynomialRoots(q);
      const scale = p.reduce((s, c) => s + Math.abs(c), 0);
      let derivative = p;
      const derivs = [p];
      for (let k = 1; k <= d; k++) {
        derivative = polyDeriv(derivative);
        derivs.push(derivative);
      }
      const withMult = distinct.map((r) => {
        let m = 1;
        while (m < d && C.abs(polyEvalComplex(derivs[m], r)) < 1e-7 * scale * (1 + C.abs(r)) ** (d - m)) m++;
        return { ...r, multiplicity: m };
      });
      if (withMult.reduce((s, r) => s + r.multiplicity, 0) === d) return withMult;
    }
  }
  return clusterRoots(polynomialRoots(p));
}

// Group numerically-identical roots (repeated roots converge only to ~1e-5)
// and replace each group by its average.
function clusterRoots(roots) {
  const used = new Array(roots.length).fill(false);
  const out = [];
  for (let i = 0; i < roots.length; i++) {
    if (used[i]) continue;
    const group = [roots[i]];
    used[i] = true;
    for (let j = i + 1; j < roots.length; j++) {
      if (!used[j] && C.abs(C.sub(roots[i], roots[j])) < 1e-5 * (1 + C.abs(roots[i]))) {
        group.push(roots[j]);
        used[j] = true;
      }
    }
    const mean = group.reduce((a, r) => C.add(a, r), { re: 0, im: 0 });
    out.push({ re: mean.re / group.length, im: mean.im / group.length, multiplicity: group.length });
  }
  return out;
}

const cleanComplex = (z) => {
  const scale = 1 + Math.abs(z.re);
  return { ...z, re: Math.abs(z.re) < 1e-11 ? 0 : z.re, im: Math.abs(z.im) < 1e-9 * scale ? 0 : z.im };
};

// ---------- formatting --------------------------------------------------

function fmt(n) {
  if (Math.abs(n) < 1e-11) return "0";
  return String(Number(n.toPrecision(10)));
}

function fmtComplex({ re, im }) {
  if (im === 0) return fmt(re);
  const imAbs = Math.abs(im);
  const imText = (imAbs === 1 ? "" : fmt(imAbs)) + "i";
  if (re === 0) return (im < 0 ? "-" : "") + imText;
  return `${fmt(re)} ${im < 0 ? "-" : "+"} ${imText}`;
}

function fmtPolynomial(p, v) {
  const parts = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const c = p[k];
    if (Math.abs(c) < 1e-12) continue;
    const abs = Math.abs(c);
    const body = k === 0 ? fmt(abs) : (abs === 1 ? "" : fmt(abs)) + v + (k > 1 ? `^${k}` : "");
    parts.push(parts.length === 0 ? (c < 0 ? "-" : "") + body : `${c < 0 ? "-" : "+"} ${body}`);
  }
  return parts.length ? parts.join(" ") : "0";
}

// ---------- linear algebra ----------------------------------------------

// Reduce the augmented matrix [A | b] to reduced row echelon form.
function rref(A, b) {
  const m = A.length;
  const n = A[0].length;
  const M = A.map((row, i) => [...row, b[i]]);
  const scale = Math.max(1e-300, ...M.flat().map(Math.abs));
  const tol = 1e-9 * scale;
  const pivots = [];
  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    let best = r;
    for (let i = r + 1; i < m; i++) if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
    if (Math.abs(M[best][c]) <= tol) continue;
    [M[r], M[best]] = [M[best], M[r]];
    const pv = M[r][c];
    M[r] = M[r].map((x) => x / pv);
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = M[i][c];
      if (f !== 0) M[i] = M[i].map((x, k) => x - f * M[r][k]);
    }
    pivots.push(c);
    r++;
  }
  const consistent = M.slice(r).every((row) => Math.abs(row[n]) <= tol * 10);
  return { M, pivots, consistent };
}

const matrixText = (M, n) =>
  M.map((row) => "[ " + row.slice(0, n).map((x) => fmt(x).padStart(7)).join(" ") + " | " + fmt(row[n]).padStart(7) + " ]");

function solveSquare(J, rhs) {
  const { M, pivots } = rref(J, rhs);
  if (pivots.length < J.length) return null;
  return M.map((row) => row[J.length]);
}

// Check whether f_i(x) = c_i + sum a_ij x_j for every equation; if so return A and c.
function linearForm(fns, vars, angleMode) {
  const n = vars.length;
  const at = (arr) => Object.fromEntries(vars.map((v, i) => [v, arr[i]]));
  const zero = new Array(n).fill(0);
  const c = fns.map((f) => evalNumeric(f, at(zero), angleMode));
  if (c.some(Number.isNaN)) return null;
  const A = fns.map(() => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const e = zero.slice();
    e[j] = 1;
    for (let i = 0; i < fns.length; i++) {
      const v = evalNumeric(fns[i], at(e), angleMode);
      if (Number.isNaN(v)) return null;
      A[i][j] = v - c[i];
    }
  }
  // verify on a few awkward points
  const probes = [[2.5, -1.75, 3.25, 0.5, -4, 1.5], [-3.1, 0.7, -2.2, 5.5, 1.1, -0.9], [7, 11, -13, 2, 3, 5]];
  for (const probe of probes) {
    const x = probe.slice(0, n);
    for (let i = 0; i < fns.length; i++) {
      const actual = evalNumeric(fns[i], at(x), angleMode);
      const predicted = c[i] + A[i].reduce((s, a, j) => s + a * x[j], 0);
      if (Number.isNaN(actual) || Math.abs(actual - predicted) > 1e-8 * (1 + Math.abs(actual))) return null;
    }
  }
  return { A, c };
}

// ---------- numeric solvers ---------------------------------------------

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function solveOneVariableNumeric(f, v, angleMode) {
  const g = (x) => evalNumeric(f, { [v]: x }, angleMode);
  const roots = [];
  const add = (x) => {
    if (!Number.isFinite(x)) return;
    if (!(Math.abs(g(x)) < 1e-9 * (1 + Math.abs(x)))) return;
    if (roots.some((r) => Math.abs(r - x) < 1e-7 * (1 + Math.abs(x)))) return;
    roots.push(x);
  };
  const newton = (x0) => {
    let x = x0;
    for (let k = 0; k < 60; k++) {
      const fx = g(x);
      if (Number.isNaN(fx)) return NaN;
      if (Math.abs(fx) < 1e-14) return x;
      const h = 1e-6 * (1 + Math.abs(x));
      const d = (g(x + h) - g(x - h)) / (2 * h);
      if (!Number.isFinite(d) || d === 0) return NaN;
      const nx = x - fx / d;
      if (Math.abs(nx - x) < 1e-14 * (1 + Math.abs(x))) return nx;
      x = nx;
    }
    return x;
  };

  // x! is only defined at integers, so a sign-change scan cannot see its roots.
  if (f.includes("!")) for (let k = 0; k <= 170; k++) add(k);

  const LIMIT = 1000;
  const STEP = 0.01;
  let prevX = -LIMIT;
  let prevY = g(prevX);
  let prevPrevY = NaN;
  for (let x = -LIMIT + STEP; x <= LIMIT + 1e-9; x += STEP) {
    const y = g(x);
    if (!Number.isNaN(prevY) && !Number.isNaN(y)) {
      if (prevY === 0) add(prevX);
      else if (prevY * y < 0) {
        // bisect, but make sure it is a root and not a pole (like tan or 1/x)
        let lo = prevX, hi = x, flo = prevY;
        for (let k = 0; k < 80; k++) {
          const mid = (lo + hi) / 2;
          const fm = g(mid);
          if (Number.isNaN(fm)) break;
          if (flo * fm <= 0) hi = mid;
          else { lo = mid; flo = fm; }
        }
        add((lo + hi) / 2);
      }
      // touching roots such as (x-1)^2: local minimum of |f| very close to 0
      if (!Number.isNaN(prevPrevY) && Math.abs(prevY) < Math.abs(prevPrevY) && Math.abs(prevY) <= Math.abs(y) && Math.abs(prevY) < 1e-3) {
        const r = newton(prevX);
        if (!Number.isNaN(r)) add(r);
      }
    }
    prevPrevY = prevY;
    prevX = x;
    prevY = y;
  }
  roots.sort((a, b) => a - b);
  return roots;
}

function newtonSystem(fns, vars, angleMode, start) {
  const n = vars.length;
  const at = (x) => Object.fromEntries(vars.map((name, i) => [name, x[i]]));
  const F = (x) => fns.map((f) => evalNumeric(f, at(x), angleMode));
  const norm = (arr) => Math.sqrt(arr.reduce((s, a) => s + a * a, 0));
  let x = start.slice();
  let fx = F(x);
  if (fx.some(Number.isNaN)) return null;
  for (let iter = 0; iter < 80; iter++) {
    const nf = norm(fx);
    if (nf < 1e-12) return x;
    const J = fns.map(() => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(x[j]));
      const xp = x.slice(); xp[j] += h;
      const xm = x.slice(); xm[j] -= h;
      const fp = F(xp);
      const fm = F(xm);
      for (let i = 0; i < n; i++) J[i][j] = (fp[i] - fm[i]) / (2 * h);
    }
    if (J.flat().some((a) => !Number.isFinite(a))) return null;
    const dx = solveSquare(J, fx.map((a) => -a));
    if (!dx) return null;
    let lambda = 1;
    let next, fnext;
    for (; lambda > 1e-4; lambda /= 2) {
      next = x.map((xi, i) => xi + lambda * dx[i]);
      fnext = F(next);
      if (!fnext.some(Number.isNaN) && norm(fnext) < nf) break;
    }
    if (lambda <= 1e-4) return norm(fx) < 1e-9 ? x : null;
    x = next;
    fx = fnext;
    if (norm(dx) * lambda < 1e-15 * (1 + norm(x))) break;
  }
  return norm(fx) < 1e-9 ? x : null;
}

function solveSystemNumeric(fns, vars, angleMode) {
  const n = vars.length;
  const rand = mulberry32(42);
  const starts = n === 2 ? 300 : n === 3 ? 600 : 900;
  const found = [];
  for (let s = 0; s < starts; s++) {
    const scale = s < starts / 2 ? 5 : 40;
    const start = Array.from({ length: n }, () => (rand() * 2 - 1) * scale);
    const sol = newtonSystem(fns, vars, angleMode, start);
    if (!sol) continue;
    if (found.some((f) => f.every((v, i) => Math.abs(v - sol[i]) < 1e-6 * (1 + Math.abs(v))))) continue;
    found.push(sol);
    if (found.length >= 24) break;
  }
  found.sort((a, b) => {
    for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] - b[i];
    return 0;
  });
  return found;
}

// ---------- public API --------------------------------------------------

function splitEquations(input) {
  const list = Array.isArray(input) ? input : String(input).split(/[;\n]/);
  return list.map((s) => s.trim()).filter(Boolean);
}

function buildEquation(text) {
  const sides = text.split("=");
  if (sides.length > 2) throw new Error(`'${text}' has more than one '=' sign`);
  const lhs = tokenize(sides[0]);
  const rhs = sides.length === 2 ? tokenize(sides[1]) : [];
  if (lhs.length === 0 || (sides.length === 2 && rhs.length === 0)) {
    throw new Error(`'${text}' is missing an expression on one side of '='`);
  }
  const tokens = rhs.length ? ["(", ...lhs, ")", "-", "(", ...rhs, ")"] : lhs;
  const postfix = toPostfix(tokens);
  const vars = [...new Set(postfix.filter(isVar))];
  return { text, postfix, vars };
}

const point = (re) => ({ re, im: 0 });

function solveEquations(input, angleMode = "rad") {
  const texts = splitEquations(input);
  if (texts.length === 0) throw new Error("Enter an equation, e.g. x^2 - 5x + 6 = 0");
  if (texts.length > MAX_VARIABLES) throw new Error(`At most ${MAX_VARIABLES} equations at a time`);

  const eqs = texts.map(buildEquation);
  const vars = [...new Set(eqs.flatMap((e) => e.vars))].sort();
  if (vars.length === 0) {
    throw new Error("No variable found. Use the arithmetic calculator for plain numbers, or include a letter such as x.");
  }
  if (vars.length > MAX_VARIABLES) throw new Error(`At most ${MAX_VARIABLES} different variables`);
  const fns = eqs.map((e) => e.postfix);

  // Validate structure once so malformed input gives a clear message.
  const probe = Object.fromEntries(vars.map((v) => [v, 1.234]));
  fns.forEach((f) => evalNumeric(f, probe, angleMode));

  const steps = eqs.map((e, i) => `f${i + 1} = lhs − rhs, postfix: ${e.postfix.join(" ")}`);
  const result = { variables: vars, equations: texts, steps, kind: "solutions", solutions: [], parametric: [], method: "", note: "" };
  const finish = (solutions) => {
    result.solutions = solutions.map((sol) => {
      const values = {};
      vars.forEach((v, i) => {
        const z = cleanComplex(sol[i]);
        values[v] = { re: z.re, im: z.im, text: fmtComplex(z), multiplicity: z.multiplicity || 1 };
      });
      return values;
    });
    if (result.solutions.length === 0 && result.kind === "solutions") result.kind = "none";
    return result;
  };

  // ----- one variable -----
  if (vars.length === 1) {
    const v = vars[0];
    let roots = null;
    let polyInfo = null;
    try {
      const p = evalPolynomial(fns[0], v, angleMode);
      polyInfo = p;
    } catch (e) {
      if (!(e instanceof NotPolynomial)) throw e;
    }

    if (polyInfo) {
      const deg = polyInfo.length - 1;
      result.steps.push(`Polynomial in ${v}: ${fmtPolynomial(polyInfo, v)} = 0  (degree ${deg})`);
      if (deg === 0) {
        if (Math.abs(polyInfo[0]) < 1e-12) {
          result.kind = "identity";
          result.method = "Both sides are identical";
          result.note = `True for every value of ${v}.`;
          return finish([]);
        }
        result.method = "Constant equation";
        result.note = "The equation reduces to a false statement, so it has no solution.";
        return finish([]);
      }
      result.method = deg === 1 ? "Linear equation" : deg === 2 ? "Quadratic formula" : `Polynomial of degree ${deg} — Durand–Kerner root finding`;
      roots = polynomialRootsWithMultiplicity(polyInfo)
        .map(cleanComplex)
        .sort((a, b) => (a.im === 0) !== (b.im === 0) ? (a.im === 0 ? -1 : 1) : a.re - b.re || b.im - a.im);
      const repeated = roots.filter((r) => r.multiplicity > 1);
      if (repeated.length) result.note = `Repeated root${repeated.length > 1 ? "s" : ""}: ${repeated.map((r) => `${fmtComplex(r)} (×${r.multiplicity})`).join(", ")}.`;
      if (deg > 2) {
        const realCount = roots.filter((r) => r.im === 0).length;
        result.note = `${deg} roots counted with multiplicity: ${realCount} real distinct, ${roots.length - realCount} complex. ${result.note}`.trim();
      }
      // extra equations (rare): keep only roots that satisfy them too
      let kept = roots;
      for (let i = 1; i < fns.length; i++) {
        kept = kept.filter((r) => r.im === 0 && Math.abs(evalNumeric(fns[i], { [v]: r.re }, angleMode)) < 1e-7);
      }
      return finish(kept.map((r) => [r]));
    }

    result.method = "Numeric search for real roots (sign changes on [−1000, 1000], then bisection)";
    let real = solveOneVariableNumeric(fns[0], v, angleMode);
    for (let i = 1; i < fns.length; i++) {
      real = real.filter((x) => Math.abs(evalNumeric(fns[i], { [v]: x }, angleMode)) < 1e-7 * (1 + Math.abs(x)));
    }
    if (real.length > 12) {
      real = real.sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, 12).sort((a, b) => a - b);
      result.note = "Many roots exist; showing the 12 closest to 0.";
    } else if (real.length) {
      result.note = "Real roots found between −1000 and 1000.";
    } else {
      result.note = "No real root found between −1000 and 1000.";
    }
    return finish(real.map((x) => [point(x)]));
  }

  // ----- several variables -----
  const form = linearForm(fns, vars, angleMode);
  if (form) {
    const b = form.c.map((x) => -x);
    const { M, pivots, consistent } = rref(form.A, b);
    result.method = "Linear system — Gaussian elimination";
    result.steps.push("Reduced row echelon form:", ...matrixText(M, vars.length));
    if (!consistent) {
      result.kind = "none";
      result.note = "The equations contradict each other, so there is no solution.";
      return finish([]);
    }
    if (pivots.length === vars.length) {
      return finish([vars.map((_, i) => point(M[i][vars.length]))]);
    }
    // infinitely many solutions: express pivot variables with the free ones
    const free = vars.filter((_, j) => !pivots.includes(j));
    result.kind = "infinite";
    result.note = `Infinitely many solutions. Free variable${free.length > 1 ? "s" : ""}: ${free.join(", ")} (any value).`;
    result.parametric = pivots.map((col, row) => {
      let text = `${vars[col]} = ${fmt(M[row][vars.length])}`;
      let started = Math.abs(M[row][vars.length]) >= 1e-11;
      if (!started) text = `${vars[col]} =`;
      vars.forEach((fv, j) => {
        if (pivots.includes(j)) return;
        const coef = -M[row][j];
        if (Math.abs(coef) < 1e-11) return;
        const abs = Math.abs(coef);
        const term = (abs === 1 ? "" : fmt(abs)) + fv;
        text += started ? ` ${coef < 0 ? "−" : "+"} ${term}` : ` ${coef < 0 ? "−" : ""}${term}`;
        started = true;
      });
      if (!started) text = `${vars[col]} = 0`;
      return text;
    });
    return finish([]);
  }

  if (fns.length < vars.length) {
    throw new Error(`${vars.length} variables (${vars.join(", ")}) need at least ${vars.length} equations — you gave ${fns.length}. Separate equations with ;`);
  }
  if (fns.length > vars.length) {
    throw new Error("More equations than variables is only supported when every equation is linear.");
  }

  result.method = "Nonlinear system — damped Newton–Raphson from many starting points";
  const sols = solveSystemNumeric(fns, vars, angleMode);
  result.note = sols.length
    ? "Real solutions found by searching from many starting points; there may be others (including complex ones)."
    : "No real solution found.";
  return finish(sols.map((s) => s.map(point)));
}

module.exports = { solveEquations, tokenize, toPostfix, evalNumeric, fmt };
