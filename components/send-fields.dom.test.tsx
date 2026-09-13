import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { nativeGradeArray } from "@/lib/grades";

import { SuggestedGradeField } from "./send-fields";

function Field({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <SuggestedGradeField climbType="boulder" value={value} onChange={setValue} />;
}

it("offers exactly the discipline's grades, with no None option", async () => {
  const user = userEvent.setup();
  render(<Field initial="5" />);
  await user.click(screen.getByRole("button", { name: /Suggested grade/ }));
  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual([...nativeGradeArray("boulder")]);
  await user.click(screen.getByRole("option", { name: nativeGradeArray("boulder")[3] }));
  expect(screen.getByRole("button", { name: /Suggested grade/ })).toHaveTextContent(
    nativeGradeArray("boulder")[3],
  );
});
