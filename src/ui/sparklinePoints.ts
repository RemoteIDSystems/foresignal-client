/** The points of a sparkline: values spread over the width, scaled from zero to the largest. */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
): [number, number][] {
  if (values.length === 0) return [];
  const top = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, i) => [i * step, height - 1 - (value / top) * (height - 2)]);
}
