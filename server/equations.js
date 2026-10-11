// Equation solver behind POST /api/solve.
//
// Pipeline (the same ideas as calculator.js):
//   1. Tokenize each side of every equation: numbers, unknowns, constants,
//      functions, operators, plus implicit multiplication (5x, 2(x+1), xy).
//   2. Shunting-Yard: infix -> postfix, using the project's own Stack.
//   3. Evaluate the postfix program. Either numerically (unknowns bound to
//      numbers) or over polynomials (coefficient arrays), which gives the
//      exact coefficients of a one-unknown polynomial equation.
//   4. Solve:
//        one unknown, polynomial   -> linear / quadratic formula / Durand-Kerner
//                                     (every real AND complex root, with
//                                     multiplicities)
//        one unknown, other        -> bracketing + bisection (e.g. cos(x) = x)
//        linear system             -> Gauss-Jordan elimination
//        non-linear system         -> Newton-Raphson from many starting points

const Stack = require("./stack");

class SolveError extends Error {} // a mistake in the user's input -> HTTP 400
class NotPolynomial extends Error {} // internal signal: use the numeric path

const FUNCS = ["asin", "acos", "atan", "sqrt", "sin", "cos", "tan", "log", "ln", "abs"];
const MAX_EQUATIONS = 8;
const MAX_UNKNOWNS = 6;
const MAX_DEGREE = 30;

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

function fmtNum(x) {
  if (!Number.isFinite(x)) return "undefined";
  let n = Number(x.toPrecision(10));
  if (Object.is(n, -0) || Math.abs(n) < 1e-12) n = 0;
  return String(n);
}

function fmtComplex(re, im) {
  if (im === 0) return fmtNum(re);
  const mag = fmtNum(Math.abs(im));
  const imStr = mag === "1" ? "i" : `${mag}i`;
  if (re === 0) return (im < 0 ? "-" : "") + imStr;
  return `${fmtNum(re)} ${im < 0 ? "-" : "+"} ${imStr}`;
}

// A solution value in the shape the front end expects.
function makeValue(re, im = 0, multiplicity = 1) {
  const scale = Math.max(1, Math.abs(re), Math.abs(im));
  if (Math.abs(im) < 1e-9 * scale) im = 0;
  if (Math.abs(re) < 1e-12 * scale) re = 0;
  re = Number(re.toPrecision(12));
  im = Number(im.toPrecision(12));
  if (re === 0) re = 0; // normalise -0
  if (im === 0) im = 0;
  return { re, im, text: fmtComplex(re, im), multiplicity };
}

// ---------------------------------------------------------------------------
// 1. Tokenizer
// ---------------------------------------------------------------------------

function normalize(text) {
  return text
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/[,\n]/g, ";");
}

function tokenize(src) {
  const s = src.replace(/\s+/g, "");
  const raw = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const lit = s.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(lit)) throw new SolveError(`Bad number '${lit}'`);
      raw.push({ t: "num", v: parseFloat(lit) });
      i = j;
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      const rest = s.slice(i).toLowerCase();
      const fn = FUNCS.find((f) => rest.startsWith(f));
      if (fn) {
        raw.push({ t: "fn", v: fn });
        i += fn.length;
      } else if (rest.startsWith("pi")) {
        raw.push({ t: "const", v: Math.PI });
        i += 2;
      } else if (ch === "e" || ch === "E") {
        raw.push({ t: "const", v: Math.E });
        i += 1;
      } else {
        raw.push({ t: "var", v: ch.toLowerCase() });
        i += 1;
      }
      continue;
    }

    if ("+-*/^!()".includes(ch)) {
      raw.push({ t: "op", v: ch });
      i++;
      continue;
    }

    throw new SolveError(`Unexpected character '${ch}'`);
  }

  // Unary minus and implicit multiplication.
  const endsOperand = (t) =>
    t && (t.t === "num" || t.t === "var" || t.t === "const" || (t.t === "op" && (t.v === ")" || t.v === "!")));
  const startsOperand = (t) =>
    t.t === "num" || t.t === "var" || t.t === "const" || t.t === "fn" || (t.t === "op" && t.v === "(");

  const out = [];
  for (let k = 0; k < raw.length; k++) {
    const tok = raw[k];
    const prev = out[out.length - 1];

    if (tok.t === "fn" && !(raw[k + 1] && raw[k + 1].t === "op" && raw[k + 1].v === "(")) {
      throw new SolveError(`${tok.v} needs brackets, e.g. ${tok.v}(x)`);
    }

    if (tok.t === "op" && (tok.v === "-" || tok.v === "+")) {
      const prefix = !prev || (prev.t === "op" && prev.v !== ")" && prev.v !== "!");
      if (prefix) {
        if (tok.v === "-") out.push({ t: "op", v: "neg" });
        continue; // a prefix "+" does nothing
      }
    }

    if (endsOperand(prev) && startsOperand(tok)) out.push({ t: "op", v: "*" });
    out.push(tok);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Shunting-Yard (infix -> postfix) on the project's Stack
// ---------------------------------------------------------------------------

// "neg" (prefix minus) sits between * and ^, so -x^2 = -(x^2) and 2^-1 works.
const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 2.5, "^": 3 };

function toPostfix(tokens) {
  const out = [];
  const ops = new Stack();
  const isOpen = (t) => t.t === "op" && t.v === "(";

  for (const tok of tokens) {
    if (tok.t === "num" || tok.t === "var") out.push(tok);
    else if (tok.t === "const") out.push({ t: "num", v: tok.v });
    else if (tok.t === "fn") ops.push(tok);
    else if (tok.v === "!") out.push(tok); // postfix: its operand is already in the output
    else if (tok.v === "(") ops.push(tok);
    else if (tok.v === ")") {
      while (!ops.isEmpty() && !isOpen(ops.peek())) out.push(ops.pop());
      if (ops.isEmpty()) throw new SolveError("Unbalanced brackets");
      ops.pop(); // discard "("
      if (!ops.isEmpty() && ops.peek().t === "fn") out.push(ops.pop());
    } else if (tok.v === "neg") ops.push(tok);
    else {
      const rightAssoc = tok.v === "^";
      while (!ops.isEmpty() && !isOpen(ops.peek())) {
        const top = ops.peek();
        const topPrec = top.t === "fn" ? 99 : PREC[top.v];
        if (topPrec > PREC[tok.v] || (topPrec === PREC[tok.v] && !rightAssoc)) out.push(ops.pop());
        else break;
      }
      ops.push(tok);
    }
  }

  while (!ops.isEmpty()) {
    const top = ops.pop();
    if (isOpen(top)) throw new SolveError("Unbalanced brackets");
    out.push(top);
  }
  return out;
}

function showPostfix(post) {
  return post
    .map((t) => (t.t === "num" ? fmtNum(t.v) : t.t === "var" ? t.v : t.v === "neg" ? "neg" : t.v))
    .join(" ");
}

// ---------------------------------------------------------------------------
// 3a. Numeric evaluation of a postfix program
// ---------------------------------------------------------------------------

function factorial(n) {
  if (!Number.isInteger(n) || n < 0) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

function applyFn(name, a, angle) {
  const toRad = (x) => (angle === "deg" ? (x * Math.PI) / 180 : x);
  const fromRad = (x) => (angle === "deg" ? (x * 180) / Math.PI : x);
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
    case "abs": return Math.abs(a);
    default: return NaN;
  }
}

function applyOp(op, a, b) {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return a / b;
    case "^": return Math.pow(a, b);
    default: return NaN;
  }
}

// Domain problems (sqrt of a negative, 1/0, ...) give NaN/Infinity instead of
// throwing, so root searches can simply skip those points. Only structural
// mistakes throw.
function evalNumeric(post, vars, angle) {
  const st = new Stack();
  for (const t of post) {
    if (t.t === "num") {
      st.push(t.v);
    } else if (t.t === "var") {
      st.push(vars[t.v] ?? 0);
    } else if (t.t === "fn" || t.v === "neg" || t.v === "!") {
      const a = st.pop();
      if (a === undefined) throw new SolveError("Malformed expression: missing operand");
      if (t.t === "fn") st.push(applyFn(t.v, a, angle));
      else st.push(t.v === "neg" ? -a : factorial(a));
    } else {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new SolveError("Malformed expression: missing operand");
      st.push(applyOp(t.v, a, b));
    }
  }
  if (st.size() !== 1) throw new SolveError("Malformed expression: check the operators");
  return st.pop();
}

// ---------------------------------------------------------------------------
// 3b. Polynomial evaluation (single unknown): values are coefficient arrays,
//     lowest power first, so [6, -5, 1] means x^2 - 5x + 6.
// ---------------------------------------------------------------------------

const trimExact = (p) => {
  while (p.length > 1 && p[p.length - 1] === 0) p.pop();
  return p;
};
const isConst = (p) => p.length === 1;

function pAdd(a, b) {
  const r = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) r.push((a[i] || 0) + (b[i] || 0));
  return trimExact(r);
}
function pSub(a, b) {
  const r = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) r.push((a[i] || 0) - (b[i] || 0));
  return trimExact(r);
}
function pMul(a, b) {
  if (a.length + b.length - 2 > MAX_DEGREE) throw new SolveError(`Degree too high (max ${MAX_DEGREE})`);
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
  return trimExact(r);
}
function pPow(a, n) {
  let r = [1];
  for (let k = 0; k < n; k++) r = pMul(r, a);
  return r;
}
function pDeriv(c) {
  if (c.length <= 1) return [0];
  return c.slice(1).map((a, i) => a * (i + 1));
}

function evalPoly(post, angle) {
  const st = new Stack();
  const need = (a) => {
    if (a === undefined) throw new SolveError("Malformed expression: missing operand");
    return a;
  };
  const finite = (r, what) => {
    if (!Number.isFinite(r)) throw new SolveError(`Math error: ${what} is undefined here`);
    return r;
  };

  for (const t of post) {
    if (t.t === "num") st.push([t.v]);
    else if (t.t === "var") st.push([0, 1]);
    else if (t.t === "fn") {
      const a = need(st.pop());
      if (!isConst(a)) throw new NotPolynomial();
      st.push([finite(applyFn(t.v, a[0], angle), t.v)]);
    } else if (t.v === "neg") {
      st.push(need(st.pop()).map((c) => (c === 0 ? 0 : -c)));
    } else if (t.v === "!") {
      const a = need(st.pop());
      if (!isConst(a)) throw new NotPolynomial();
      st.push([finite(factorial(a[0]), "factorial")]);
    } else {
      const b = need(st.pop());
      const a = need(st.pop());
      if (t.v === "+") st.push(pAdd(a, b));
      else if (t.v === "-") st.push(pSub(a, b));
      else if (t.v === "*") st.push(pMul(a, b));
      else if (t.v === "/") {
        if (!isConst(b)) throw new NotPolynomial();
        if (b[0] === 0) throw new SolveError("Math error: division by zero");
        st.push(a.map((c) => c / b[0]));
      } else if (t.v === "^") {
        if (!isConst(b)) throw new NotPolynomial();
        const e = b[0];
        if (isConst(a)) st.push([finite(Math.pow(a[0], e), "power")]);
        else if (Number.isInteger(e) && e >= 0) {
          if (e * (a.length - 1) > MAX_DEGREE) throw new SolveError(`Degree too high (max ${MAX_DEGREE})`);
          st.push(pPow(a, e));
        } else throw new NotPolynomial();
      }
    }
  }
  if (st.size() !== 1) throw new SolveError("Malformed expression: check the operators");
  return st.pop();
}

// Drop coefficients that are only rounding noise next to the largest one.
function trimRel(p) {
  const mx = Math.max(...p.map(Math.abs));
  if (mx === 0) return [0];
  const q = p.slice();
  while (q.length > 1 && Math.abs(q[q.length - 1]) <= 1e-12 * mx) q.pop();
  return q;
}

function polyToString(c, v) {
  const terms = [];
  for (let k = c.length - 1; k >= 0; k--) {
    const a = c[k];
    if (a === 0 && c.length > 1) continue;
    const mag = Math.abs(a);
    const coef = k > 0 && Math.abs(mag - 1) < 1e-12 ? "" : fmtNum(mag);
    const body = k === 0 ? coef : k === 1 ? `${coef}${v}` : `${coef}${v}^${k}`;
    if (terms.length === 0) terms.push((a < 0 ? "-" : "") + body);
    else terms.push((a < 0 ? "- " : "+ ") + body);
  }
  return terms.join(" ") || "0";
}

// ---------------------------------------------------------------------------
// Complex helpers + polynomial root finding (Durand-Kerner)
// ---------------------------------------------------------------------------

const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cabs = (a) => Math.hypot(a[0], a[1]);
function cdiv(a, b) {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
function hornerC(c, z) {
  let r = [c[c.length - 1], 0];
  for (let k = c.length - 2; k >= 0; k--) r = cadd(cmul(r, z), [c[k], 0]);
  return r;
}

function newtonPolish(c, z, iterations) {
  const dc = pDeriv(c);
  for (let it = 0; it < iterations; it++) {
    const p = hornerC(c, z);
    const dp = hornerC(dc, z);
    if (cabs(dp) < 1e-14) break;
    const next = csub(z, cdiv(p, dp));
    if (cabs(hornerC(c, next)) <= cabs(p)) z = next;
    else break;
  }
  return z;
}

function dkIterate(a, z, R, maxIterations) {
  const d = z.length;
  let used = 0;
  for (let it = 0; it < maxIterations; it++) {
    used = it + 1;
    let delta = 0;
    for (let i = 0; i < d; i++) {
      let den = [1, 0];
      for (let j = 0; j < d; j++) if (j !== i) den = cmul(den, csub(z[i], z[j]));
      if (cabs(den) < 1e-300) {
        z[i] = cadd(z[i], [1e-6, 1e-6]);
        continue;
      }
      const dz = cdiv(hornerC(a, z[i]), den);
      z[i] = csub(z[i], dz);
      delta = Math.max(delta, cabs(dz));
    }
    if (delta < 1e-15 * R) break;
  }
  return used;
}

function durandKerner(c) {
  const d = c.length - 1;
  const a = c.map((x) => x / c[d]); // monic
  const R = 1 + Math.max(...a.slice(0, d).map(Math.abs));
  const r0 = Math.max(0.5, R / 2);
  const z = [];
  for (let k = 0; k < d; k++) {
    const ang = (2 * Math.PI * k) / d + 0.4;
    z.push([r0 * Math.cos(ang), r0 * Math.sin(ang)]);
  }
  let iterations = dkIterate(a, z, R, 2000);

  // While a repeated-root cluster collapses, one estimate can be thrown far
  // away and never return. Re-seed any estimate that is still not a root next
  // to one that is, and iterate again.
  const relRes = (q) => cabs(hornerC(c, q)) / (hornerAbs(c, cabs(q)) + 1e-300);
  for (let repair = 0; repair < 6; repair++) {
    const good = [];
    const bad = [];
    z.forEach((q, i) => (relRes(q) <= 1e-8 ? good : bad).push(i));
    if (bad.length === 0 || good.length === 0) break;
    bad.forEach((i, k) => {
      const anchor = z[good[k % good.length]];
      const ang = 1 + 2.399963 * (i + 1);
      const eps = 1e-3 * (1 + cabs(anchor));
      z[i] = [anchor[0] + eps * Math.cos(ang), anchor[1] + eps * Math.sin(ang)];
    });
    iterations += dkIterate(a, z, R, 1500);
  }
  return { roots: z, iterations };
}

// ---- repeated roots ---------------------------------------------------------
// A root of multiplicity m converges slowly and comes out as a loose cluster of
// m values, so nearby roots are grouped. A group is only accepted as a repeated
// root if p, p', ..., p^(m-1) all vanish at its refined centre. Otherwise the
// group is split with a tighter tolerance.

function derivativeN(c, n) {
  let g = c;
  for (let k = 0; k < n; k++) g = pDeriv(g);
  return g;
}
function hornerAbs(c, r) {
  let s = 0;
  for (let k = c.length - 1; k >= 0; k--) s = s * r + Math.abs(c[k]);
  return s;
}
function verifyMultiple(c, z, m) {
  for (let j = 0; j < m; j++) {
    const g = derivativeN(c, j);
    if (cabs(hornerC(g, z)) > 1e-10 * (hornerAbs(g, cabs(z)) + 1e-300)) return false;
  }
  return true;
}
function clusterBy(list, relTol) {
  const groups = [];
  for (const z of list) {
    const home = groups.find((g) => cabs(csub(g.center, z)) < relTol * (1 + cabs(z)));
    if (home) {
      home.members.push(z);
      home.center = [
        home.members.reduce((s, q) => s + q[0], 0) / home.members.length,
        home.members.reduce((s, q) => s + q[1], 0) / home.members.length,
      ];
    } else groups.push({ center: z, members: [z] });
  }
  return groups.map((g) => g.members);
}
function resolveCluster(c, members, tols) {
  const m = members.length;
  if (m === 1) return [{ z: newtonPolish(c, members[0], 4), mult: 1 }];
  const center = [
    members.reduce((s, q) => s + q[0], 0) / m,
    members.reduce((s, q) => s + q[1], 0) / m,
  ];
  const z = newtonPolish(derivativeN(c, m - 1), center, 40);
  if (verifyMultiple(c, z, m)) return [{ z, mult: m }];
  if (tols.length === 0) return members.map((q) => ({ z: newtonPolish(c, q, 4), mult: 1 }));
  const [tol, ...rest] = tols;
  const parts = clusterBy(members, tol);
  if (parts.length === 1) return resolveCluster(c, members, rest);
  return parts.flatMap((part) => resolveCluster(c, part, rest));
}

// All complex roots with multiplicities: [{ re, im, mult }]
function polynomialRoots(c) {
  const { roots, iterations } = durandKerner(c);
  const polished = roots.map((z) => newtonPolish(c, z, 6));

  const out = [];
  for (const group of clusterBy(polished, 5e-2)) {
    for (const r of resolveCluster(c, group, [5e-3, 5e-4, 5e-5, 5e-6])) {
      out.push({ re: r.z[0], im: r.z[1], mult: r.mult });
    }
  }

  out.sort((p, q) => {
    if (Math.abs(p.re - q.re) > 1e-9 * (1 + Math.abs(p.re))) return p.re - q.re;
    return q.im - p.im; // positive imaginary part first
  });
  return { roots: out, iterations };
}

// ---------------------------------------------------------------------------
// Solvers
// ---------------------------------------------------------------------------

function solutionList(variable, values) {
  return values.map((val) => ({ [variable]: val }));
}

function solvePolynomial(coefs, v, steps) {
  const c = trimRel(coefs);
  const degree = c.length - 1;
  steps.push(`Move everything to one side: ${polyToString(c, v)} = 0`);
  steps.push(`Polynomial of degree ${degree}, coefficients (lowest power first): [${c.map(fmtNum).join(", ")}]`);

  if (degree === 0) {
    if (c[0] === 0) {
      steps.push(`Both sides are equal for every ${v}.`);
      return { kind: "identity", variables: [v], method: "Identity check", steps };
    }
    steps.push(`The equation reduces to ${fmtNum(c[0])} = 0, which is never true.`);
    return { kind: "none", variables: [v], method: "Constant equation", steps, note: "The equation can never be true." };
  }

  if (degree === 1) {
    const root = -c[0] / c[1];
    steps.push(`Linear: ${v} = −b / a = −(${fmtNum(c[0])}) / ${fmtNum(c[1])} = ${fmtNum(root)}`);
    return {
      kind: "solutions",
      variables: [v],
      solutions: solutionList(v, [makeValue(root)]),
      method: "Linear equation",
      steps,
    };
  }

  if (degree === 2) {
    const [cc, b, a] = c;
    const D = b * b - 4 * a * cc;
    steps.push(`Quadratic: a = ${fmtNum(a)}, b = ${fmtNum(b)}, c = ${fmtNum(cc)}`);
    steps.push(`Discriminant D = b² − 4ac = ${fmtNum(D)}`);
    const eps = 1e-12 * Math.max(1, b * b, Math.abs(4 * a * cc));
    let values;
    if (Math.abs(D) <= eps) {
      steps.push("D = 0, so there is one repeated real root: x = −b / 2a");
      values = [makeValue(-b / (2 * a), 0, 2)];
    } else if (D > 0) {
      steps.push("D > 0, so there are two real roots: x = (−b ± √D) / 2a");
      const sq = Math.sqrt(D);
      const q = -0.5 * (b + (b >= 0 ? sq : -sq)); // avoids cancellation
      const r1 = q / a;
      const r2 = cc / q;
      values = [r1, r2].sort((p, r) => p - r).map((r) => makeValue(r));
    } else {
      steps.push("D < 0, so there are two complex conjugate roots: x = (−b ± i√−D) / 2a");
      const re = -b / (2 * a);
      const im = Math.sqrt(-D) / (2 * Math.abs(a));
      values = [makeValue(re, im), makeValue(re, -im)];
    }
    return {
      kind: "solutions",
      variables: [v],
      solutions: solutionList(v, values),
      method: "Quadratic formula",
      steps,
    };
  }

  const { roots, iterations } = polynomialRoots(c);
  steps.push(`Durand–Kerner iteration for all ${degree} complex roots (converged in ${iterations} rounds)`);
  steps.push("Nearby roots are grouped to find repeated roots, then each is polished with Newton's method");
  const values = roots.map((r) => makeValue(r.re, r.im, r.mult));
  return {
    kind: "solutions",
    variables: [v],
    solutions: solutionList(v, values),
    method: `Polynomial roots of degree ${degree} (Durand–Kerner, real and complex)`,
    steps,
  };
}

// One equation, one unknown, not a polynomial: bracket sign changes and bisect.
function solveNumeric1D(eq, v, angle, steps) {
  const f = (x) => evalNumeric(eq.left, { [v]: x }, angle) - evalNumeric(eq.right, { [v]: x }, angle);

  const xs = [];
  for (let k = -4000; k <= 4000; k++) xs.push(k * 0.005); // fine grid on [-20, 20]
  for (let x = 20 * 1.02; x < 1e6; x *= 1.02) xs.push(x, -x); // coarse grid out to ±10^6
  xs.sort((a, b) => a - b);
  const fs = xs.map(f);

  steps.push(`f(${v}) = (left side) − (right side); looking for ${v} where f(${v}) = 0`);
  steps.push(`Sampled ${xs.length} points between −1,000,000 and 1,000,000 (finest near 0)`);

  const finite = fs.filter(Number.isFinite);
  if (finite.length === 0) {
    steps.push("f is undefined at every sampled point.");
    return { kind: "none", variables: [v], method: "Numeric root search", steps, note: "The equation is undefined for every real number." };
  }
  if (finite.every((y) => Math.abs(y) < 1e-12)) {
    steps.push("f(x) is 0 at every sampled point.");
    return { kind: "identity", variables: [v], method: "Numeric identity check", steps };
  }

  const roots = [];
  const addRoot = (r) => {
    if (!roots.some((q) => Math.abs(q - r) < 1e-7 * (1 + Math.abs(r)))) roots.push(r);
  };

  // sign changes -> bisection
  for (let k = 0; k < xs.length - 1; k++) {
    const fa = fs[k];
    const fb = fs[k + 1];
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
    if (fa === 0) {
      addRoot(xs[k]);
      continue;
    }
    if (fa * fb < 0) {
      let a = xs[k], b = xs[k + 1], fA = fa, bad = false;
      for (let it = 0; it < 200; it++) {
        const m = (a + b) / 2;
        const fm = f(m);
        if (!Number.isFinite(fm)) { bad = true; break; }
        if (fm === 0) { a = b = m; break; }
        if (fA < 0 === fm < 0) { a = m; fA = fm; } else b = m;
        if (Math.abs(b - a) <= 1e-15 * (1 + Math.abs(m))) break;
      }
      if (bad) continue;
      const r = (a + b) / 2;
      const fr = f(r);
      // a real root leaves f(r) ≈ 0; a pole (like 1/x at 0) does not
      if (Number.isFinite(fr) && Math.abs(fr) <= 1e-6 * (Math.abs(fa) + Math.abs(fb))) addRoot(r);
    }
  }

  // roots where f only touches zero (no sign change), e.g. cos(x) = 1
  let minima = 0;
  for (let k = 1; k < xs.length - 1 && minima < 200; k++) {
    const [p, q, r] = [fs[k - 1], fs[k], fs[k + 1]];
    if (![p, q, r].every(Number.isFinite)) continue;
    if (!(Math.abs(q) < Math.abs(p) && Math.abs(q) <= Math.abs(r))) continue;
    if (!(p * q > 0 && q * r > 0)) continue;
    minima++;
    let lo = xs[k - 1], hi = xs[k + 1];
    const g = (x) => Math.abs(f(x));
    const phi = (Math.sqrt(5) - 1) / 2;
    for (let it = 0; it < 90; it++) {
      const x1 = hi - phi * (hi - lo), x2 = lo + phi * (hi - lo);
      if (g(x1) < g(x2)) hi = x2; else lo = x1;
    }
    const m = (lo + hi) / 2;
    if (g(m) <= 1e-12 * (1 + Math.max(Math.abs(p), Math.abs(r)))) addRoot(m);
  }

  steps.push(`Refined ${roots.length} root(s) by bisection`);
  if (roots.length === 0) {
    return {
      kind: "none",
      variables: [v],
      method: "Numeric root search (sign changes + bisection)",
      steps,
      note: "No real solution was found between −1,000,000 and 1,000,000.",
    };
  }

  roots.sort((a, b) => Math.abs(a) - Math.abs(b));
  const shown = roots.slice(0, 12).sort((a, b) => a - b);
  const note =
    roots.length > shown.length
      ? `Real solutions only. Showing the ${shown.length} closest to 0 (there are more).`
      : "Real solutions only (complex roots are not searched for this kind of equation).";
  return {
    kind: "solutions",
    variables: [v],
    solutions: solutionList(v, shown.map((r) => makeValue(r))),
    method: "Numeric root search (sign changes + bisection)",
    steps,
    note,
  };
}

// --- linear systems --------------------------------------------------------

function tryLinear(eqs, variables, angle) {
  const n = variables.length;
  const evalEq = (e, vars) => evalNumeric(e.left, vars, angle) - evalNumeric(e.right, vars, angle);
  const zero = {};
  variables.forEach((v) => (zero[v] = 0));

  const f0 = eqs.map((e) => evalEq(e, zero));
  if (!f0.every(Number.isFinite)) return null;

  const A = eqs.map(() => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const p = { ...zero, [variables[j]]: 1 };
    for (let i = 0; i < eqs.length; i++) {
      const fi = evalEq(eqs[i], p);
      if (!Number.isFinite(fi)) return null;
      A[i][j] = fi - f0[i];
    }
  }

  // linear only if f(point) = f(0) + A·point at some unrelated test points
  const tests = [
    [0.37, -1.3, 2.1, 0.77, -0.55, 1.9],
    [-2.2, 0.9, -0.4, 1.6, 2.5, -1.1],
    [3.3, -0.7, 1.2, -2.4, 0.6, 0.15],
  ];
  for (const pt of tests) {
    const vars = {};
    variables.forEach((v, j) => (vars[v] = pt[j]));
    for (let i = 0; i < eqs.length; i++) {
      const actual = evalEq(eqs[i], vars);
      let predicted = f0[i];
      for (let j = 0; j < n; j++) predicted += A[i][j] * pt[j];
      if (!Number.isFinite(actual) || Math.abs(actual - predicted) > 1e-8 * (1 + Math.abs(actual) + Math.abs(predicted))) {
        return null;
      }
    }
  }
  return { A, b: f0.map((x) => -x) };
}

function fmtAffine(constant, coefs, params) {
  const parts = [];
  const nearZero = (x) => Math.abs(x) <= 1e-12;
  if (!nearZero(constant) || coefs.every(nearZero)) parts.push(fmtNum(constant));
  coefs.forEach((c, k) => {
    if (nearZero(c)) return;
    const mag = Math.abs(Math.abs(c) - 1) < 1e-12 ? "" : fmtNum(Math.abs(c));
    const term = `${mag}${params[k]}`;
    if (parts.length === 0) parts.push((c < 0 ? "-" : "") + term);
    else parts.push((c < 0 ? "- " : "+ ") + term);
  });
  return parts.join(" ");
}

function solveLinear(A, b, variables, steps) {
  const m = A.length;
  const n = variables.length;
  const M = A.map((row, i) => [...row, b[i]]);
  const scale = Math.max(1, ...M.flat().map(Math.abs));
  const tol = 1e-10 * scale;
  const METHOD = "Gaussian elimination (Gauss–Jordan with partial pivoting)";

  const showRow = (row) => `[ ${row.slice(0, n).map((x) => fmtNum(x).padStart(7)).join(" ")} | ${fmtNum(row[n])} ]`;
  steps.push(`The system is linear. Augmented matrix [A | b] for unknowns (${variables.join(", ")}):`);
  M.forEach((row) => steps.push("  " + showRow(row)));

  const pivotRowOfCol = new Array(n).fill(-1);
  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    let p = r;
    for (let i = r + 1; i < m; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) <= tol) continue; // no pivot: free column
    if (p !== r) {
      [M[p], M[r]] = [M[r], M[p]];
      steps.push(`Swap R${r + 1} and R${p + 1} (largest pivot)`);
    }
    const pv = M[r][c];
    if (Math.abs(pv - 1) > 1e-12) {
      M[r] = M[r].map((x) => x / pv);
      steps.push(`R${r + 1} ← R${r + 1} / ${fmtNum(pv)}`);
    }
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const factor = M[i][c];
      if (Math.abs(factor) <= tol) continue;
      M[i] = M[i].map((x, j) => x - factor * M[r][j]);
      M[i][c] = 0;
      steps.push(`R${i + 1} ← R${i + 1} − (${fmtNum(factor)})·R${r + 1}`);
    }
    pivotRowOfCol[c] = r;
    r++;
  }

  steps.push("Reduced matrix:");
  M.forEach((row) => steps.push("  " + showRow(row)));

  for (let i = r; i < m; i++) {
    if (Math.abs(M[i][n]) > tol) {
      steps.push(`Row ${i + 1} reads 0 = ${fmtNum(M[i][n])}, a contradiction.`);
      return {
        kind: "none",
        variables,
        method: METHOD,
        steps,
        note: "The equations contradict each other, so there is no solution.",
      };
    }
  }

  const freeCols = [];
  for (let c = 0; c < n; c++) if (pivotRowOfCol[c] === -1) freeCols.push(c);

  if (freeCols.length === 0) {
    const sol = {};
    variables.forEach((v, c) => (sol[v] = makeValue(M[pivotRowOfCol[c]][n])));
    steps.push("Every unknown has a pivot, so the solution is unique: " + variables.map((v) => `${v} = ${sol[v].text}`).join(", "));
    return { kind: "solutions", variables, solutions: [sol], method: METHOD, steps };
  }

  const params = freeCols.length === 1 ? ["t"] : freeCols.map((_, k) => `t${"₀₁₂₃₄₅₆₇₈₉"[k + 1]}`);
  steps.push(
    `${freeCols.length} free unknown(s): ${freeCols.map((c) => variables[c]).join(", ")}; ` +
      `they are set to the parameter(s) ${params.join(", ")}`
  );
  const parametric = variables.map((v, c) => {
    const fi = freeCols.indexOf(c);
    if (fi !== -1) return `${v} = ${params[fi]}`;
    const row = M[pivotRowOfCol[c]];
    return `${v} = ${fmtAffine(row[n], freeCols.map((fc) => -row[fc]), params)}`;
  });
  return {
    kind: "infinite",
    variables,
    parametric,
    method: METHOD,
    steps,
    note: `Infinitely many solutions; ${params.join(", ")} can be any real number.`,
  };
}

// --- non-linear systems ----------------------------------------------------

function solveSquare(J, rhs) {
  const n = rhs.length;
  const M = J.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = c + 1; i < n; i++) {
      const f = M[i][c] / M[c][c];
      for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

function solveNewton(eqs, variables, angle, steps) {
  const n = variables.length;
  const F = (v) => {
    const vars = {};
    variables.forEach((name, j) => (vars[name] = v[j]));
    const out = eqs.map((e) => evalNumeric(e.left, vars, angle) - evalNumeric(e.right, vars, angle));
    return out.every(Number.isFinite) ? out : null;
  };
  const norm = (a) => Math.max(...a.map(Math.abs));
  const jacobian = (v) => {
    const J = eqs.map(() => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * (1 + Math.abs(v[j]));
      const hi = v.slice(); hi[j] += h;
      const lo = v.slice(); lo[j] -= h;
      const fh = F(hi), fl = F(lo);
      if (!fh || !fl) return null;
      for (let i = 0; i < n; i++) J[i][j] = (fh[i] - fl[i]) / (2 * h);
    }
    return J;
  };

  const grids = {
    1: [-10, -5, -2, -0.5, 0.5, 2, 5, 10],
    2: [-10, -5, -2, -0.5, 0.5, 2, 5, 10],
    3: [-6, -1.5, 0.5, 3, 8],
    4: [-4, 0.5, 4],
  };
  let seeds = [[]];
  for (let d = 0; d < n; d++) seeds = seeds.flatMap((s) => grids[n].map((g) => [...s, g]));

  const found = [];
  for (const seed of seeds) {
    let v = seed.slice();
    let f = F(v);
    if (!f) continue;
    for (let it = 0; it < 80 && norm(f) >= 1e-11; it++) {
      const J = jacobian(v);
      if (!J) break;
      const d = solveSquare(J, f.map((x) => -x));
      if (!d) break;
      let lam = 1, moved = false;
      while (lam > 1e-6) {
        const nv = v.map((x, j) => x + lam * d[j]);
        const nf = F(nv);
        if (nf && norm(nf) < norm(f)) { v = nv; f = nf; moved = true; break; }
        lam /= 2;
      }
      if (!moved) break;
    }
    if (norm(f) < 1e-9) {
      const dup = found.some((o) => o.every((x, j) => Math.abs(x - v[j]) < 1e-6 * (1 + Math.abs(x))));
      if (!dup) found.push(v);
    }
  }

  steps.push("The system is not linear, so Newton–Raphson is used with a numeric Jacobian.");
  steps.push(`Started from ${seeds.length} different points and kept the distinct real solutions that converged.`);
  const method = "Newton–Raphson from many starting points";

  if (found.length === 0) {
    return {
      kind: "none",
      variables,
      method,
      steps,
      note: "No real solution was found. There may be none, or only complex ones.",
    };
  }
  found.sort((a, b) => {
    for (let j = 0; j < n; j++) if (Math.abs(a[j] - b[j]) > 1e-9) return a[j] - b[j];
    return 0;
  });
  const shown = found.slice(0, 20);
  return {
    kind: "solutions",
    variables,
    solutions: shown.map((v) => Object.fromEntries(variables.map((name, j) => [name, makeValue(v[j])]))),
    method,
    steps,
    note: "Real solutions only.",
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

function orderVars(vars) {
  const pref = ["x", "y", "z"];
  return [...vars].sort((a, b) => {
    const ia = pref.indexOf(a), ib = pref.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function parseSide(src, label) {
  if (!src.trim()) throw new SolveError(`Malformed expression: missing the ${label} side of '='`);
  const tokens = tokenize(src);
  return { post: toPostfix(tokens), vars: tokens.filter((t) => t.t === "var").map((t) => t.v) };
}

function parseEquation(text) {
  const parts = text.split("=");
  if (parts.length < 2) {
    throw new SolveError(`Write each equation as left = right, for example x^2 - 5x + 6 = 0 (got "${text}")`);
  }
  if (parts.length > 2) throw new SolveError("An equation can't contain more than one '=' sign");
  const left = parseSide(parts[0], "left");
  const right = parseSide(parts[1], "right");
  const eq = { text, left: left.post, right: right.post, vars: new Set([...left.vars, ...right.vars]) };
  // dry run: catches structural mistakes such as a missing operand
  evalNumeric(eq.left, {}, "rad");
  evalNumeric(eq.right, {}, "rad");
  return eq;
}

function solveEquations(text, angle = "rad") {
  const texts = normalize(text).split(";").map((s) => s.trim()).filter(Boolean);
  if (texts.length === 0) throw new SolveError("Write an equation first, for example x^2 - 5x + 6 = 0");
  if (texts.length > MAX_EQUATIONS) throw new SolveError(`Too many equations (max ${MAX_EQUATIONS})`);

  const eqs = texts.map(parseEquation);
  const varSet = new Set();
  eqs.forEach((e) => e.vars.forEach((v) => varSet.add(v)));
  const variables = orderVars(varSet);
  if (variables.length === 0) {
    throw new SolveError("Equation is missing an unknown (use x, y, z or the ALPHA letters)");
  }
  if (variables.length > MAX_UNKNOWNS) throw new SolveError(`Too many unknowns (max ${MAX_UNKNOWNS})`);

  const steps = [];
  steps.push(`Read ${eqs.length} equation(s) with unknown(s): ${variables.join(", ")}`);
  eqs.forEach((e, i) => {
    steps.push(`Shunting-Yard postfix, equation ${i + 1}:  ${showPostfix(e.left)}  =  ${showPostfix(e.right)}`);
  });

  if (eqs.length === 1 && variables.length === 1) {
    const v = variables[0];
    try {
      const f = trimRel(pSub(evalPoly(eqs[0].left, angle), evalPoly(eqs[0].right, angle)));
      return solvePolynomial(f, v, steps);
    } catch (e) {
      if (!(e instanceof NotPolynomial)) throw e;
    }
    steps.push("Not a polynomial in " + v + ", so a numeric method is used.");
    return solveNumeric1D(eqs[0], v, angle, steps);
  }

  const linear = tryLinear(eqs, variables, angle);
  if (linear) return solveLinear(linear.A, linear.b, variables, steps);

  if (eqs.length !== variables.length) {
    throw new SolveError(
      `A non-linear system needs as many equations as unknowns (${eqs.length} equation(s), ${variables.length} unknown(s))`
    );
  }
  if (variables.length > 4) throw new SolveError("Non-linear systems support at most 4 unknowns");
  return solveNewton(eqs, variables, angle, steps);
}

module.exports = { solveEquations, SolveError };
