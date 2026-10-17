import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import { GradePreferencesProvider } from "@/components/ui/grade-preferences";
import { nativeGradeArray, ROPE_YDS } from "@/lib/grades";

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

it("offers one option per French label and submits the larger ordinal", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn<(value: string) => void>();
  render(
    <GradePreferencesProvider value={{ boulder: "hueco", rope: "french" }}>
      <SuggestedGradeField climbType="sport" value="1" onChange={onChange} />
    </GradePreferencesProvider>,
  );
  // A stored 5.1 reads as French 2 without being rewritten.
  expect(screen.getByRole("button", { name: /Suggested grade/ })).toHaveTextContent("2");
  expect(onChange).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: /Suggested grade/ }));
  const options = await screen.findAllByRole("option");
  expect(options).toHaveLength(ROPE_YDS.length - 2);
  expect(options.slice(0, 4).map((option) => option.textContent)).toEqual(["1", "2", "3", "4a"]);
  await user.click(screen.getByRole("option", { name: "3" }));
  expect(onChange).toHaveBeenCalledWith("4");
});

it("keeps the boulder picker in Font when only boulders are switched", async () => {
  const user = userEvent.setup();
  render(
    <GradePreferencesProvider value={{ boulder: "font", rope: "yds" }}>
      <Field initial="5" />
    </GradePreferencesProvider>,
  );
  expect(screen.getByRole("button", { name: /Suggested grade/ })).toHaveTextContent("6B");
  await user.click(screen.getByRole("button", { name: /Suggested grade/ }));
  await user.click(await screen.findByRole("option", { name: "7A+" }));
  expect(screen.getByRole("button", { name: /Suggested grade/ })).toHaveTextContent("7A+");
});
