export default function About() {
  return (
    <>
      <section className="section">
        <h2 className="section__label">Project</h2>
        <dl className="meta-list">
          <div>
            <dt>Title</dt>
            <dd>Stack-Based Expression Evaluator</dd>
          </div>
          <div>
            <dt>Course</dt>
            <dd>[Your Course Code — Data Structures &amp; Algorithms]</dd>
          </div>
          <div>
            <dt>Student</dt>
            <dd>[Your Name]</dd>
          </div>
          <div>
            <dt>Institution</dt>
            <dd>[Your Institution]</dd>
          </div>
          <div>
            <dt>Term</dt>
            <dd>[Semester / Year]</dd>
          </div>
          <div>
            <dt>Instructor</dt>
            <dd>[Instructor Name]</dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <h2 className="section__label">Summary</h2>
        <p>
          This capstone project implements a full-stack arithmetic calculator
          built to demonstrate two classical data structures and algorithms
          topics: a stack-based implementation of Dijkstra's Shunting-Yard
          algorithm for converting infix expressions to postfix notation, and
          postfix (RPN) evaluation using a value stack. Rather than relying
          on a language's built-in expression evaluator, both algorithms are
          implemented from first principles on a custom <code>Stack</code>{" "}
          class, and every intermediate step is exposed through the API so
          it can be visualized in the browser.
        </p>
      </section>

      <section className="section">
        <h2 className="section__label">Technology</h2>
        <dl className="meta-list">
          <div>
            <dt>Frontend</dt>
            <dd>React, React Router, Vite</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>Node.js, Express</dd>
          </div>
          <div>
            <dt>Database</dt>
            <dd>PostgreSQL</dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <h2 className="section__label">Source</h2>
        <p>
          Source code: <span className="mono">[Your GitHub repository URL]</span>
        </p>
      </section>
    </>
  );
}
