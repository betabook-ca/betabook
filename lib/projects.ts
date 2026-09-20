/** How many climbs one climber may pin at once. A project list is a shortlist
 * by nature, and the board loads every pin in one unpaginated read, so this
 * doubles as the bound on that query. It lives here rather than in
 * `actions/projects.ts` because a `"use server"` module may export only async
 * functions — a plain `export const` there breaks the OpenNext build while
 * `pnpm check` stays green. */
export const PINNED_PROJECT_LIMIT = 100;

export const PIN_LIMIT_MESSAGE = `You can pin up to ${PINNED_PROJECT_LIMIT} projects — unpin one to add another`;
