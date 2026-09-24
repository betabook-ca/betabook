import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { climberSearchItems, type SearchFetcher } from "@/lib/search";

import { FriendsContent } from "./friends-content";

const people = [
  {
    id: "alex",
    name: "Alexandra Montgomery-Castellanos",
    image: null,
    friendshipStatus: "outgoing" as const,
  },
  { id: "kai", name: "Kai Nakamura", image: null, friendshipStatus: "friends" as const },
  { id: "sam", name: "Sam Rivera", image: null, friendshipStatus: "none" as const },
];
const fetcher: SearchFetcher = async (state) => ({
  items: climberSearchItems(
    people.filter((person) =>
      person.name.toLowerCase().startsWith(state.query.trim().toLowerCase()),
    ),
  ),
  hasMore: false,
  nextPage: 2,
});
const meta = {
  title: "Components/Profile/Friends page",
  component: FriendsContent,
  // WorkspaceShell supplies the page heading in the app.
  decorators: [
    (Story) => (
      <>
        <h1 className="sr-only">Friends</h1>
        <Story />
      </>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "The actual Friends page composition. Friends and Requests are the only tabs. Search replaces friends and suggestions with grouped results; clearing restores them. All data and search transport are local fixtures.",
      },
    },
  },
  args: {
    userId: "viewer",
    view: "friends",
    fetcher,
    page: {
      friends: [
        { ...people[1], isPrivate: false },
        {
          id: "riley",
          name: "Riley Chen",
          image: null,
          friendshipStatus: "friends",
          isPrivate: false,
        },
      ],
      hasMore: false,
    },
    suggestions: [
      "Sam Rivera",
      "Jordan Park",
      "Colleen Macejkovic",
      "Joshua Bradtke",
      "Brooks Huels",
      "Kenyon Cremin",
    ].map((name, i) => ({
      id: `suggested-${i}`,
      name,
      image: null,
      friendshipStatus: "none" as const,
      mutualFriendCount: i < 2 ? 2 : 1,
    })),
  },
} satisfies Meta<typeof FriendsContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const NewAccount: Story = {
  args: { page: { friends: [], hasMore: false }, suggestions: [] },
};
export const Requests: Story = {
  args: {
    view: "requests",
    suggestions: null,
    page: {
      friends: [
        {
          id: "sam",
          name: "Sam Rivera",
          image: null,
          friendshipStatus: "incoming",
          isPrivate: false,
        },
        { ...people[0], isPrivate: false },
        {
          id: "jordan",
          name: "Jordan Park",
          image: null,
          friendshipStatus: "incoming",
          isPrivate: false,
        },
      ],
      hasMore: false,
    },
  },
};
export const NoRequests: Story = {
  args: { view: "requests", suggestions: null, page: { friends: [], hasMore: false } },
};
