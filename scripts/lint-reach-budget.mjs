const MIN = 5;
const MAX = 30;
const DEFAULT = 15;

function clampBudget(value) {
  if (!Number.isFinite(value)) return DEFAULT;
  return Math.min(MAX, Math.max(MIN, Math.round(value)));
}

for (const sample of [-10, 0, 5, 15, 30, 44, Number.NaN]) {
  const clamped = clampBudget(sample);
  if (clamped < MIN || clamped > MAX) {
    console.error(`clampBudget(${sample}) => ${clamped} out of range`);
    process.exit(1);
  }
}
console.log("lint:reach-budget OK");
