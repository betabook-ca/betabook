import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { LoadMoreButton } from "./load-more-button";

const meta = {
  title: "Components/Feedback/Load more button",
  component: LoadMoreButton,
} satisfies Meta<typeof LoadMoreButton>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
function RetryExample() {
  const [failed, setFailed] = useState(true);
  return (
    <StoryPage title="Pagination retry">
      <LoadMoreButton failed={failed} loading={false} onPress={() => setFailed(false)} />
      <p role="status">{failed ? "The sample request failed." : "Next page loaded."}</p>
    </StoryPage>
  );
}
export const Retry: Story = { render: () => <RetryExample /> };

function LoadingExample() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState(0);
  return (
    <StoryPage
      title="Loading another page"
      description="Pending pagination keeps keyboard focus and ignores repeated requests. Finish the local request to try it again."
    >
      <LoadMoreButton
        loading={loading}
        onPress={() => {
          setRequests(requests + 1);
          setLoading(true);
        }}
      />
      <Button variant="secondary" onPress={() => setLoading(false)}>
        Finish sample request
      </Button>
      <output>Requests: {requests}</output>
    </StoryPage>
  );
}
export const Loading: Story = { render: () => <LoadingExample /> };
