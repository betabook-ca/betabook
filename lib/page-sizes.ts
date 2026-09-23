/** Area search page size. Kept here, not in db/queries, so the client
 * component that turns "rows loaded so far" back into a page number can
 * import it without pulling the query layer into the bundle. */
export const AREA_SEARCH_PAGE_SIZE = 25;
