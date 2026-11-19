// `fraction` (0–1) as a percentage to one decimal place, for a percent field.
export const toPercent = (fraction: number) => Math.round(fraction * 1000) / 10;
