export default function HowItWorks() {
  return (
    <>
      <p className="page__lede">
        This calculator does not use a language's built-in expression
        evaluator. Instead, it implements two classical stack-based
        algorithms from scratch, described below.
      </p>

      <section className="section">
        <h2 className="section__label">1. The Stack</h2>
        <p>
          A stack is a linear data structure that supports two core
          operations in constant time: <code>push</code>, which adds an item
          to the top, and <code>pop</code>, which removes the most recently
          added item. This project implements its own <code>Stack</code>{" "}
          class rather than relying on array methods, so the underlying
          mechanics are explicit.
        </p>
        <pre className="code-block">{`class Stack {
  push(item)  { /* add to top */ }
  pop()       { /* remove and return top */ }
  peek()      { /* view top without removing */ }
  isEmpty()   { /* true if no items remain */ }
}`}</pre>
      </section>

      <section className="section">
        <h2 className="section__label">2. Tokenization</h2>
        <p>
          Before any algorithm runs, the raw input string (e.g.{" "}
          <code>"3 + 4 * (2 - 1) ^ 2"</code>) is broken into a flat list of
          tokens: numbers, operators, and parentheses. This includes
          handling multi-digit numbers, decimals, and unary minus signs.
        </p>
      </section>

      <section className="section">
        <h2 className="section__label">3. Shunting-Yard: Infix → Postfix</h2>
        <p>
          Devised by Edsger Dijkstra, the Shunting-Yard algorithm converts an
          infix expression (the natural human-readable form, where operators
          sit between operands) into postfix notation, or Reverse Polish
          Notation (RPN), where operators follow their operands. Postfix
          notation removes the need for parentheses and operator precedence
          rules at evaluation time.
        </p>
        <p>The algorithm processes tokens left to right, using an operator stack:</p>
        <ul className="rule-list">
          <li>Numbers are sent directly to the output.</li>
          <li>
            Operators are pushed to the stack after popping any
            higher-or-equal precedence operators from the stack to the
            output first (respecting associativity).
          </li>
          <li>
            An opening parenthesis is pushed to the stack; a closing
            parenthesis pops operators to the output until the matching
            opening parenthesis is found.
          </li>
          <li>Any operators left on the stack at the end are appended to the output.</li>
        </ul>
        <p className="note">
          Time complexity: O(n), since each token is pushed and popped at
          most once. Space complexity: O(n) for the operator stack and
          output list in the worst case.
        </p>
      </section>

      <section className="section">
        <h2 className="section__label">4. Postfix Evaluation</h2>
        <p>
          With the expression in postfix form, evaluation becomes a single
          left-to-right pass using a value stack: numbers are pushed onto
          the stack, and when an operator is encountered, the top two values
          are popped, the operation is applied, and the result is pushed
          back. After the final token, exactly one value remains on the
          stack — the answer.
        </p>
        <p className="note">
          Time complexity: O(n). Space complexity: O(n) in the worst case
          (an expression with no operators until the very end).
        </p>
      </section>

      <section className="section">
        <h2 className="section__label">5. Worked Example</h2>
        <p>
          For <code>3 + 4 * (2 - 1) ^ 2</code>, the postfix form is{" "}
          <code>3 4 2 1 - 2 ^ * +</code>, which evaluates to <code>7</code>.
          Visit the Calculator page and enter this expression to see every
          intermediate stack state.
        </p>
      </section>
    </>
  );
}
