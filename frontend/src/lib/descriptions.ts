/** Fallback body copy for an entity with no description. Deliberately
 * quiet: it states the fact to every visitor instead of scolding them with
 * an editor's to-do — surfaces that know the viewer can edit may append
 * their own invitation (see AreaCragHeader). */
export function missingDescriptionMessage(): string {
  return "No description yet.";
}
