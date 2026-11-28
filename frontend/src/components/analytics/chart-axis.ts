/** Axis tick labels on every chart: the text-2xs step (10px), muted. SVG and
 * Recharts take a number rather than a class, so the size lives here. */
export const CHART_TICK_FONT_SIZE = 10;

export const CHART_TICK = { fontSize: CHART_TICK_FONT_SIZE, fill: "var(--muted)" } as const;

/** Grade labels name the rows themselves, so they keep the text color. */
export const CHART_LABEL_TICK = { ...CHART_TICK, fill: "var(--foreground)" } as const;
