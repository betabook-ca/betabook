import { fn } from "storybook/test";

// oxlint-disable-next-line import/no-relative-parent-imports -- Bypass the Storybook alias to preserve the real default outside form stories.
import { fetchAreaSuggestions as actualFetchAreaSuggestions } from "../../lib/search-suggestions";
// oxlint-disable-next-line import/no-relative-parent-imports -- Other suggestion boundaries remain unchanged.
export * from "../../lib/search-suggestions";

export const fetchAreaSuggestions = fn(actualFetchAreaSuggestions);
