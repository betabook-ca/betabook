import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import {
  arbitrate,
  buildArbitrationPrompt,
  CONFIDENCE_THRESHOLD,
  resolveArbitration,
  type ArbitrationCandidate,
  type ArbitrationDecision,
  type ArbitrationSubject,
} from "./llm-arbitrate.ts";

const subject: ArbitrationSubject = {
  entityType: "climb",
  name: "Superfly",
  path: ["North America", "United States", "Colorado", "Test Crag"],
  discipline: "boulder",
  grade: "V5",
  coordinates: { latitude: 40.01, longitude: -105.27 },
};

const candidates: ArbitrationCandidate[] = [
  {
    id: 1,
    name: "Superfly",
    path: ["North America", "United States", "Colorado", "Test Crag"],
    grade: "V5",
    coordinates: { latitude: 40.011, longitude: -105.271 },
  },
  {
    id: 2,
    name: "Super Fly",
    path: ["North America", "United States", "Colorado", "Test Crag"],
    grade: "V6",
    coordinates: null,
  },
];

describe("buildArbitrationPrompt", () => {
  it("names the subject, its location, and every candidate by id", () => {
    const prompt = buildArbitrationPrompt(subject, candidates);
    expect(prompt).toContain('"Superfly" in North America > United States > Colorado > Test Crag');
    expect(prompt).toContain("[1]");
    expect(prompt).toContain("[2]");
    expect(prompt).toContain("MATCH");
    expect(prompt).toContain("CREATE_NEW");
    expect(prompt).toContain("UNCERTAIN");
  });

  it("omits optional fields cleanly when absent", () => {
    const bareSubject: ArbitrationSubject = {
      entityType: "area",
      name: "Millennium",
      path: ["Uncategorized"],
      discipline: null,
      grade: null,
      coordinates: null,
    };
    const prompt = buildArbitrationPrompt(bareSubject, []);
    expect(prompt).toContain('"Millennium" in Uncategorized');
    expect(prompt).not.toContain("null");
    expect(prompt).not.toContain("undefined");
  });
});

describe("resolveArbitration", () => {
  it("trusts a MATCH at or above the confidence threshold", () => {
    const decision: ArbitrationDecision = {
      action: "MATCH",
      candidateId: 1,
      confidence: CONFIDENCE_THRESHOLD,
      reasoning: "Same name, same location, same grade.",
    };
    expect(resolveArbitration(decision)).toEqual({
      kind: "match",
      candidateId: 1,
      confidence: CONFIDENCE_THRESHOLD,
      reasoning: "Same name, same location, same grade.",
    });
  });

  it("falls back to create for a MATCH below the confidence threshold", () => {
    const decision: ArbitrationDecision = {
      action: "MATCH",
      candidateId: 1,
      confidence: CONFIDENCE_THRESHOLD - 0.01,
      reasoning: "Plausible but not certain.",
    };
    expect(resolveArbitration(decision)).toEqual({
      kind: "create",
      confidence: CONFIDENCE_THRESHOLD - 0.01,
      reasoning: "Plausible but not certain.",
    });
  });

  it("trusts a confident CREATE_NEW", () => {
    const decision: ArbitrationDecision = {
      action: "CREATE_NEW",
      confidence: 0.95,
      reasoning: "No candidate is at the same location.",
    };
    expect(resolveArbitration(decision)).toEqual({
      kind: "create",
      confidence: 0.95,
      reasoning: "No candidate is at the same location.",
    });
  });

  it("always falls back to create for UNCERTAIN, with a null confidence", () => {
    const decision: ArbitrationDecision = {
      action: "UNCERTAIN",
      reasoning: "Not enough information to distinguish the candidates.",
    };
    expect(resolveArbitration(decision)).toEqual({
      kind: "create",
      confidence: null,
      reasoning: "Not enough information to distinguish the candidates.",
    });
  });
});

type ParseCallArgs = {
  model: string;
  messages: { role: string; content: string }[];
  output_config: { format: unknown };
};

describe("arbitrate", () => {
  function stubClient(parsed_output: ArbitrationDecision | null) {
    const parse = vi
      .fn<(params: ParseCallArgs) => Promise<{ parsed_output: ArbitrationDecision | null }>>()
      .mockResolvedValue({
        parsed_output,
      });
    return { client: { messages: { parse } } as unknown as Anthropic, parse };
  }

  it("calls messages.parse with the model, prompt, and a Zod output format", async () => {
    const decision: ArbitrationDecision = {
      action: "MATCH",
      candidateId: 1,
      confidence: 0.9,
      reasoning: "Same name and location.",
    };
    const { client, parse } = stubClient(decision);

    const result = await arbitrate(client, subject, candidates, "claude-opus-5");

    expect(result).toEqual(decision);
    expect(parse).toHaveBeenCalledTimes(1);
    const call = parse.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-5");
    expect(call.messages).toEqual([
      { role: "user", content: buildArbitrationPrompt(subject, candidates) },
    ]);
    expect(call.output_config.format).toBeDefined();
  });

  it("throws when the response has no parsed_output", async () => {
    const { client } = stubClient(null);
    await expect(arbitrate(client, subject, candidates)).rejects.toThrow(
      "Arbitration response failed to parse against the decision schema",
    );
  });
});
