import { fn } from "storybook/test";

// oxlint-disable-next-line import/no-relative-parent-imports -- Bypass the Storybook alias to preserve the real default outside dialog stories.
import { fetchStatsCardImage as actualFetchStatsCardImage } from "../../lib/social-card-fetch";

export const fetchStatsCardImage = fn(actualFetchStatsCardImage);
