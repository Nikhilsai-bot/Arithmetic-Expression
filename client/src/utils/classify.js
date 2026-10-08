// Decides whether typed text is a plain arithmetic problem or an equation with
// variables. Function names and the constants pi / e don't count as variables.
export function classifyProblem(text) {
  const t = text.toLowerCase().replace(/asin|acos|atan|sin|cos|tan|sqrt|log|ln|pi|π|√/g, "");
  if (t.includes("=")) return "equations";
  if (/[a-df-z]/.test(t)) return "equations";
  return "arithmetic";
}
