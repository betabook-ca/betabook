/** `cloudflare:workers` outside workerd: the jsdom project and the Storybook
 * gallery. Components there import server actions, whose modules reach
 * lib/cloudflare-env.ts; both resolve that graph but never call into it, so
 * an empty binding set is enough. Code that did reach a binding would fail on
 * the missing property. */
export const env = {};
