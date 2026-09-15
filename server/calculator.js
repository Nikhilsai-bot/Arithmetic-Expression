const Stack = require("./stack");

const PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
const RIGHT_ASSOCIATIVE = new Set(["^"]);

const CONSTANTS = { pi: Math.PI, e: Math.E };
const FUNCTIONS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "log", "ln", "sqrt"]);
const IDENTIFIERS = new Set([...FUNCTIONS, ...Object.keys(CONSTANTS)]);

// --- Tokenizer -------------------------------------------------------
// Turns "sin(30)+4*(2-1)" into ["sin", "(", "30", ")", "+", "4", "*", "(", "2", "-", "1", ")"]
// Recognizes numbers, the four arithmetic operators, ^ and !, parentheses,
// function names (sin, cos, tan, asin, acos, atan, log, ln, sqrt), and the
// constants pi/e (which are resolved to their numeric value immediately).
function tokenize(expression) {
  const tokens = [];
  let i = 0;
  const s = expression.replace(/\s+/g, "");

  while (i < s.length) {
    const ch = s[i];

    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < s.length && /[0-9.]/.test(s[i])) {
        num += s[i];
        i++;
      }
      tokens.push(num);
      continue;
    }

    // unary minus, e.g. "-5 + 3" or "(-5)"
    if (
      ch === "-" &&
      (tokens.length === 0 ||
        ["(", "+", "-", "*", "/", "%", "^"].includes(tokens[tokens.length - 1]))
    ) {
      let num = "-";
      i++;
      while (i < s.length && /[0-9.]/.test(s[i])) {
        num += s[i];
        i++;
      }
      if (num === "-") throw new Error(`Unexpected '-' at position ${i}`);
      tokens.push(num);
      continue;
    }

    // identifiers: function names (sin, cos, ...) and constants (pi, e)
    if (/[a-zA-Z]/.test(ch)) {
      let word = "";
      while (i < s.length && /[a-zA-Z]/.test(s[i])) {
        word += s[i];
        i++;
      }
      const lower = word.toLowerCase();
      if (lower in CONSTANTS) {
        tokens.push(String(CONSTANTS[lower]));
      } else if (FUNCTIONS.has(lower)) {
        tokens.push(lower);
      } else {
        throw new Error(`Unknown identifier '${word}'`);
      }
      continue;
    }

    if ("+-*/%^()!".includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  return tokens;
}

function isNumericToken(token) {
  return /^-?[0-9]*\.?[0-9]+$/.test(token);
}

// --- Shunting-Yard: infix -> postfix, with a trace of every step -----
// Functions are pushed onto the operator stack like a "(" would be, and
// popped to the output alongside their matching ")". Factorial ("!") is
// postfix, so it can be sent straight to the output the moment it's seen,
// since its operand is already there.
function infixToPostfix(tokens) {
  const output = [];
  const opStack = new Stack();
  const steps = [];

  const record = (action, token) => {
    steps.push({
      action,
      token,
      output: [...output],
      stack: opStack.toArray(),
    });
  };

  for (const token of tokens) {
    if (isNumericToken(token)) {
      output.push(token);
      record("push output", token);
    } else if (FUNCTIONS.has(token)) {
      opStack.push(token);
      record("push function", token);
    } else if (token === "!") {
      output.push(token);
      record("postfix apply", token);
    } else if (token === "(") {
      opStack.push(token);
      record("push stack", token);
    } else if (token === ")") {
      while (!opStack.isEmpty() && opStack.peek() !== "(") {
        output.push(opStack.pop());
        record("pop to output", ")");
      }
      opStack.pop(); // discard "("
      record("discard (", ")");
      if (!opStack.isEmpty() && FUNCTIONS.has(opStack.peek())) {
        output.push(opStack.pop());
        record("pop function", ")");
      }
    } else {
      // binary operator
      while (
        !opStack.isEmpty() &&
        opStack.peek() !== "(" &&
        !FUNCTIONS.has(opStack.peek()) &&
        (PRECEDENCE[opStack.peek()] > PRECEDENCE[token] ||
          (PRECEDENCE[opStack.peek()] === PRECEDENCE[token] && !RIGHT_ASSOCIATIVE.has(token)))
      ) {
        output.push(opStack.pop());
        record("pop to output", token);
      }
      opStack.push(token);
      record("push stack", token);
    }
  }

  while (!opStack.isEmpty()) {
    output.push(opStack.pop());
    record("drain stack", "end");
  }

  return { postfix: output, steps };
}

// --- Postfix evaluation using a stack --------------------------------
function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) {
    throw new Error("Factorial is only defined for non-negative integers");
  }
  let result = 1;
  for (let k = 2; k <= n; k++) result *= k;
  return result;
}

function evaluatePostfix(postfixTokens, angleMode = "rad") {
  const stack = new Stack();
  const steps = [];
  const toRad = (x) => (angleMode === "deg" ? (x * Math.PI) / 180 : x);
  const fromRad = (x) => (angleMode === "deg" ? (x * 180) / Math.PI : x);

  for (const token of postfixTokens) {
    if (isNumericToken(token)) {
      stack.push(parseFloat(token));
      steps.push({ action: "push", token, stack: stack.toArray() });
      continue;
    }

    if (FUNCTIONS.has(token) || token === "!") {
      const a = stack.pop();
      if (a === undefined) throw new Error("Malformed expression: missing operand");
      let result;
      switch (token) {
        case "sin": result = Math.sin(toRad(a)); break;
        case "cos": result = Math.cos(toRad(a)); break;
        case "tan": result = Math.tan(toRad(a)); break;
        case "asin":
          if (a < -1 || a > 1) throw new Error("asin is only defined for values between -1 and 1");
          result = fromRad(Math.asin(a));
          break;
        case "acos":
          if (a < -1 || a > 1) throw new Error("acos is only defined for values between -1 and 1");
          result = fromRad(Math.acos(a));
          break;
        case "atan": result = fromRad(Math.atan(a)); break;
        case "log":
          if (a <= 0) throw new Error("log is only defined for positive numbers");
          result = Math.log10(a);
          break;
        case "ln":
          if (a <= 0) throw new Error("ln is only defined for positive numbers");
          result = Math.log(a);
          break;
        case "sqrt":
          if (a < 0) throw new Error("Cannot take the square root of a negative number");
          result = Math.sqrt(a);
          break;
        case "!": result = factorial(a); break;
        default: throw new Error(`Unknown function '${token}'`);
      }
      stack.push(result);
      steps.push({ action: `apply ${token}`, token, operands: [a], result, stack: stack.toArray() });
      continue;
    }

    // binary operator
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) {
      throw new Error("Malformed expression: not enough operands");
    }
    let result;
    switch (token) {
      case "+": result = a + b; break;
      case "-": result = a - b; break;
      case "*": result = a * b; break;
      case "/":
        if (b === 0) throw new Error("Division by zero");
        result = a / b;
        break;
      case "%": result = a % b; break;
      case "^": result = Math.pow(a, b); break;
      default: throw new Error(`Unknown operator '${token}'`);
    }
    stack.push(result);
    steps.push({ action: `apply ${token}`, token, operands: [a, b], result, stack: stack.toArray() });
  }

  if (stack.size() !== 1) {
    throw new Error("Malformed expression: leftover operands");
  }

  return { result: stack.pop(), steps };
}

// --- Public entry point ------------------------------------------------
function calculate(expression, angleMode = "rad") {
  // Auto-balance any unclosed parentheses (nice for calculator-style input
  // where a function like "sin(" might not be manually closed).
  const openCount = (expression.match(/\(/g) || []).length;
  const closeCount = (expression.match(/\)/g) || []).length;
  const balanced = expression + ")".repeat(Math.max(0, openCount - closeCount));

  const tokens = tokenize(balanced);
  const { postfix, steps: postfixSteps } = infixToPostfix(tokens);
  const { result, steps: evalSteps } = evaluatePostfix(postfix, angleMode);

  return {
    expression,
    tokens,
    postfix,
    result,
    angleMode,
    trace: {
      infixToPostfix: postfixSteps,
      evaluation: evalSteps,
    },
  };
}

module.exports = { calculate, tokenize, infixToPostfix, evaluatePostfix, FUNCTIONS, CONSTANTS };
