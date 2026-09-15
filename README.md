# Stack-Based Expression Evaluator

A full-stack arithmetic calculator built around the **Shunting-Yard algorithm**
and **postfix (RPN) evaluation** — both implemented on a hand-written `Stack`
data structure. Built for a DSA (Data Structures & Algorithms) course capstone.

## What it demonstrates

| DSA Concept                     | Where it lives                          |
|----------------------------------|------------------------------------------|
| Stack (custom implementation)    | `server/stack.js`                        |
| Tokenizing a string expression   | `server/calculator.js` → `tokenize()`    |
| Shunting-Yard (infix → postfix)  | `server/calculator.js` → `infixToPostfix()` |
| Postfix evaluation via stack     | `server/calculator.js` → `evaluatePostfix()` |
| Operator precedence & associativity | `PRECEDENCE`, `RIGHT_ASSOCIATIVE` maps |

The API returns not just the final answer but a **step-by-step trace** of
every push/pop on both the operator stack (during conversion) and the value
stack (during evaluation), which the frontend renders visually — this is the
part worth showing your professor, since it makes the algorithm's mechanics
visible rather than just the output.

## Pages

- **`/`** — Landing page: dark hero with headline and a custom stack illustration, CTA into the calculator
- **`/calculator`** — The working calculator with keypad and live algorithm trace
- **`/how-it-works`** — Explanation of the Stack, tokenization, Shunting-Yard, and postfix evaluation
- **`/history`** — Full table of past calculations from the database
- **`/about`** — Project/course info — **edit `client/src/pages/About.jsx`** to fill in your name, course, instructor, and repo link before submitting

## Architecture

```
client/   React + Vite frontend — calculator UI, keypad, trace visualizer
server/   Express API — tokenizer, Shunting-Yard, postfix evaluator, SQLite history
```

- `POST /api/calculate` — takes `{ expression }`, returns result + full trace
- `GET /api/history` — last 20 calculations (persisted in SQLite)
- `DELETE /api/history` — clears history

## Running it locally

**Backend:**
```bash
cd server
npm install
node index.js
# runs on http://localhost:5000
```

**Frontend** (in a second terminal):
```bash
cd client
npm install
npm run dev
# runs on http://localhost:5173, proxies /api to the backend
```

Open `http://localhost:5173` — the dev proxy (configured in
`client/vite.config.js`) forwards API calls to the backend automatically.

## Supported syntax

- Operators: `+  -  *  /  %  ^` (with correct precedence, `^` is right-associative)
- Parentheses for grouping: `(2 + 3) * 4`
- Unary minus: `-5 + 3`
- Decimal numbers: `3.14 * 2`

Example: `3 + 4 * (2 - 1) ^ 2` → tokenizes → converts to postfix
`3 4 2 1 - 2 ^ * +` → evaluates to `7`.

## Database

History works out of the box with **zero setup**: locally, it uses a SQLite
file (`server/history.db`, created automatically). When `DATABASE_URL` is
set (e.g. on Render, pointing at Neon/Supabase Postgres), it automatically
switches to Postgres instead — same API, no code changes needed. Check
`/api/health` to see which backend is active.

## Deploying to a real URL

The backend now uses **Postgres** (via a `DATABASE_URL` connection string)
instead of SQLite, since free hosts reset their filesystem on every
redeploy — SQLite's file would disappear. If `DATABASE_URL` isn't set, the
app still runs fine, it just skips saving history.

### 1. Create a free Postgres database

- Go to [neon.tech](https://neon.tech) (or [supabase.com](https://supabase.com)) and create a free project.
- Copy the connection string it gives you (starts with `postgres://...`).

### 2. Deploy the backend to Render

- Push this whole project to a GitHub repo.
- Go to [render.com](https://render.com) → New → Web Service → connect your repo.
- Render will detect `render.yaml` automatically (root dir `server`, build
  `npm install`, start `node index.js`).
- When prompted for the `DATABASE_URL` env var, paste your Neon/Supabase
  connection string.
- Deploy. You'll get a URL like `https://capstone-calculator-api.onrender.com`.
- Test it: visit `https://your-backend-url.onrender.com/api/health` — it
  should say `{"status":"ok","database":"connected"}`.

### 3. Deploy the frontend to Vercel

- Go to [vercel.com](https://vercel.com) → Add New → Project → import the same repo.
- Set the root directory to `client`.
- Add an environment variable: `VITE_API_URL` = `https://your-backend-url.onrender.com/api`
- Deploy. Vercel gives you a URL like `https://capstone-calculator.vercel.app`
  — **that's the link you share.**

### Note on Render's free tier

Free web services on Render spin down after ~15 minutes of inactivity and
take 30-60 seconds to wake back up on the next request. For a live demo or
presentation, open the URL a minute or two beforehand so it's already warm.

## Possible extensions for extra credit

- Add a recursive-descent parser as an alternative to Shunting-Yard and let
  the user compare both approaches
- Visualize the trace as an animated stack (push/pop transitions) instead of
  a static list
- Add a binary expression tree view built from the postfix output
