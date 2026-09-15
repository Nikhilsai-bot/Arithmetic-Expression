import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

export default function History() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/history`);
      setHistory(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const clearHistory = async () => {
    await fetch(`${API}/history`, { method: "DELETE" });
    loadHistory();
  };

  return (
    <>
      <p className="page__lede">
        Every calculation submitted from the calculator is persisted to the
        database, storing the original expression, its postfix form, and the
        computed result.
      </p>

      <section className="section">
        <div className="section__row">
          <h2 className="section__label">Table 1 — Calculation History</h2>
          <button className="link-btn" onClick={clearHistory}>
            clear history
          </button>
        </div>

        {loading && <div className="empty-note">Loading…</div>}

        {!loading && history.length === 0 && (
          <div className="empty-note">
            No calculations recorded yet — try a few on the Calculator page,
            or connect a database if this is running without one.
          </div>
        )}

        {!loading && history.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th style="color: red;">Expression</th>
                <th style="color: red;">Postfix Form</th>
                <th style="color: red;">Result</th>
                <th style="color: red;" >Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.id}</td>
                  <td className="mono">{h.expression}</td>
                  <td className="mono">{h.postfix.join(" ")}</td>
                  <td className="mono">{h.result}</td>
                  <td>{new Date(h.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
