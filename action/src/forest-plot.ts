/**
 * Renders an accessible, formatted ASCII Forest Plot visualizing:
 * 1. The difference point estimate d (•)
 * 2. The 95% confidence interval [L, U] ([=====•=====])
 * 3. The equivalence band [-delta, +delta] ([---|---])
 * 4. The zero axis (0.00)
 */
export function generateAsciiForestPlot(
  d: number,
  ciLower: number,
  ciUpper: number,
  delta: number,
  width = 41,
): string {
  // Determine coordinate domain symmetrically around 0
  const maxAbs = Math.max(
    Math.abs(d) * 1.5,
    Math.abs(ciLower) * 1.3,
    Math.abs(ciUpper) * 1.3,
    delta * 2.0,
    0.08,
  );

  const minVal = -maxAbs;
  const maxVal = maxAbs;

  const toCol = (val: number): number => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    const fraction = (clamped - minVal) / (maxVal - minVal);
    return Math.round(fraction * (width - 1));
  };

  const zeroCol = toCol(0);
  const negDeltaCol = toCol(-delta);
  const posDeltaCol = toCol(delta);
  const lCol = toCol(ciLower);
  const uCol = toCol(ciUpper);
  const dCol = toCol(d);

  // 1. Scale ticks line
  const scaleArr = new Array(width).fill("-");
  const tickStep = maxAbs / 2;
  const ticks = [-maxAbs, -tickStep, 0, tickStep, maxAbs];
  for (const t of ticks) {
    const col = toCol(t);
    if (col >= 0 && col < width) {
      scaleArr[col] = "|";
    }
  }

  // 2. Ticks labels line
  const fmt = (num: number) => (num >= 0 ? `+${num.toFixed(2)}` : num.toFixed(2));
  const tickHeader =
    `Scale:   ${fmt(-maxAbs).padStart(6)}` +
    `${fmt(-tickStep).padStart(Math.round(width / 4) + 1)}` +
    `${fmt(0).padStart(Math.round(width / 4) + 1)}` +
    `${fmt(tickStep).padStart(Math.round(width / 4) + 1)}` +
    `${fmt(maxAbs).padStart(Math.round(width / 4) + 1)}`;

  // 3. Delta equivalence band line
  const deltaArr = new Array(width).fill(" ");
  for (let c = negDeltaCol; c <= posDeltaCol; c++) {
    if (c >= 0 && c < width) deltaArr[c] = "-";
  }
  if (negDeltaCol >= 0 && negDeltaCol < width) deltaArr[negDeltaCol] = "[";
  if (posDeltaCol >= 0 && posDeltaCol < width) deltaArr[posDeltaCol] = "]";
  if (zeroCol >= 0 && zeroCol < width) deltaArr[zeroCol] = "|";

  // 4. Confidence interval line
  const ciArr = new Array(width).fill(" ");
  const ciStart = Math.min(lCol, uCol);
  const ciEnd = Math.max(lCol, uCol);
  for (let c = ciStart; c <= ciEnd; c++) {
    if (c >= 0 && c < width) ciArr[c] = "=";
  }
  if (ciStart >= 0 && ciStart < width) ciArr[ciStart] = "[";
  if (ciEnd >= 0 && ciEnd < width) ciArr[ciEnd] = "]";
  if (dCol >= 0 && dCol < width) ciArr[dCol] = "•";

  const diffStr = d >= 0 ? `+${d.toFixed(4)}` : d.toFixed(4);
  const ciStr = `[${ciLower >= 0 ? "+" : ""}${ciLower.toFixed(4)}, ${ciUpper >= 0 ? "+" : ""}${ciUpper.toFixed(4)}]`;

  const lines = [
    `Equivalence Band (±δ): [-${delta.toFixed(3)}, +${delta.toFixed(3)}]`,
    `Point Estimate (d):     ${diffStr} (95% CI: ${ciStr})`,
    "",
    tickHeader,
    `Axis:    ${scaleArr.join("")}`,
    `delta:   ${deltaArr.join("")}  (±${delta.toFixed(3)})`,
    `CI:      ${ciArr.join("")}  (d = ${diffStr})`,
  ];

  return lines.join("\n");
}
