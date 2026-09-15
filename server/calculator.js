const Stack = require("./stack");

const PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
const RIGHT_ASSOCIATIVE = new Set(["^"]);

// --- Tokenizer -------------------------------------------------------
// Turns "3 + 4 * (2 - 1)" into ["3", "+", "4", "*", "(", "2", "-", "1", ")"]
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
      (tokens.length === 0 || ["(", "+", "-", "*", "/", "%", "^"].includes(tokens[tokens.length - 1]))
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

    if ("+-*/%^()".includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  return tokens;
}

// --- Shunting-Yard: infix -> postfix, with a trace of every step -----
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
    if (!isNaN(parseFloat(token)) && token !== "(" && token !== ")") {
      output.push(token);
      record("push output", token);
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
    } else {
      // operator
      while (
        !opStack.isEmpty() &&
        opStack.peek() !== "(" &&
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
function evaluatePostfix(postfixTokens) {
  const stack = new Stack();
  const steps = [];

  for (const token of postfixTokens) {
    if (!isNaN(parseFloat(token)) && /^-?[0-9.]+$/.test(token)) {
      stack.push(parseFloat(token));
      steps.push({ action: "push", token, stack: stack.toArray() });
    } else {
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
  }

  if (stack.size() !== 1) {
    throw new Error("Malformed expression: leftover operands");
  }

  return { result: stack.pop(), steps };
}

// --- Public entry point ------------------------------------------------
function calculate(expression) {
  const tokens = tokenize(expression);
  const { postfix, steps: postfixSteps } = infixToPostfix(tokens);
  const { result, steps: evalSteps } = evaluatePostfix(postfix);

  return {
    expression,
    tokens,
    postfix,
    result,
    trace: {
      infixToPostfix: postfixSteps,
      evaluation: evalSteps,
    },
  };
}

module.exports = { calculate, tokenize, infixToPostfix, evaluatePostfix };
