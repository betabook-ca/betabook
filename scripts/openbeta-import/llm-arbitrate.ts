// LLM arbitration for OpenBeta rows the deterministic passes (match-areas.ts,
// match-climbs.ts) leave ambiguous. One Claude call per still-ambiguous row,
// never per candidate pair. Structured output only, via client.messages.parse
// with a Zod schema -- never free text -- so a malformed response fails
// loudly instead of being guessed at.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/** Overridable via env (e.g. to a cheaper model for bulk runs) -- defaults to
 * the current flagship per this repo's Claude API guidance, which asks not
 * to downgrade for cost without an explicit choice to do so. */
export const DEFAULT_ARBITRATION_MODEL = "claude-opus-5";

/** Below this confidence, a MATCH/CREATE_NEW decision is not trusted and
 * falls back to CREATE_NEW. UNCERTAIN always falls back too, regardless of
 * its (absent) confidence. A false-negative dedup (a harmless duplicate) is
 * far cheaper to fix later via area_merge/climb_merge than a false-positive
 * merge that scrambles send/journal history. */
export const CONFIDENCE_THRESHOLD = 0.85;

const ArbitrationDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("MATCH"),
    candidateId: z.number().int(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
  z.object({
    action: z.literal("CREATE_NEW"),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
  z.object({
    action: z.literal("UNCERTAIN"),
    reasoning: z.string(),
  }),
]);

export type ArbitrationDecision = z.infer<typeof ArbitrationDecisionSchema>;

export type ArbitrationCandidate = {
  id: number;
  name: string;
  /** Root-first breadcrumb, e.g. ["North America", "United States", "Colorado"]. */
  path: string[];
  grade: string | null;
  coordinates: { latitude: number; longitude: number } | null;
};

export type ArbitrationSubject = {
  entityType: "area" | "climb";
  name: string;
  path: string[];
  discipline: string | null;
  grade: string | null;
  coordinates: { latitude: number; longitude: number } | null;
};

/** What apply.ts acts on, after CONFIDENCE_THRESHOLD has been applied --
 * only two outcomes exist past this point, matching the "never trust a
 * shaky match" rule. */
export type ArbitrationOutcome =
  | { kind: "match"; candidateId: number; confidence: number; reasoning: string }
  | { kind: "create"; confidence: number | null; reasoning: string };

function describeCandidate(candidate: ArbitrationCandidate): string {
  const location = candidate.path.join(" > ");
  const grade = candidate.grade ? `, grade ${candidate.grade}` : "";
  const coords = candidate.coordinates
    ? `, at ${candidate.coordinates.latitude.toFixed(4)},${candidate.coordinates.longitude.toFixed(4)}`
    : "";
  return `[${candidate.id}] "${candidate.name}" in ${location}${grade}${coords}`;
}

export function buildArbitrationPrompt(
  subject: ArbitrationSubject,
  candidates: readonly ArbitrationCandidate[],
): string {
  const subjectLocation = subject.path.join(" > ");
  const subjectGrade = subject.grade ? `, grade ${subject.grade}` : "";
  const subjectCoords = subject.coordinates
    ? `, at ${subject.coordinates.latitude.toFixed(4)},${subject.coordinates.longitude.toFixed(4)}`
    : "";
  const subjectDiscipline = subject.discipline ? ` (${subject.discipline})` : "";
  const kind = subject.entityType === "area" ? "climbing area" : "climbing route";
  const candidateList = candidates.map(describeCandidate).join("\n");

  return `An external catalog (OpenBeta) lists this ${kind}:
"${subject.name}" in ${subjectLocation}${subjectGrade}${subjectCoords}${subjectDiscipline}

It could not be resolved to a single confident match against this app's existing catalog by name and location alone. Here are the candidates it's ambiguous between, already narrowed to the same resolved parent area:
${candidateList}

Decide whether the external ${kind} is the same real-world ${kind} as one of these candidates (MATCH, naming its id), a genuinely new ${kind} not yet in the catalog (CREATE_NEW), or you can't tell (UNCERTAIN). Prefer CREATE_NEW over a low-confidence MATCH: a missed duplicate is cheap to fix later, but a wrong merge is not.`;
}

/** One call per still-ambiguous row. `client` is injected so callers (and
 * tests) can supply a stub instead of hitting the network. */
export async function arbitrate(
  client: Anthropic,
  subject: ArbitrationSubject,
  candidates: readonly ArbitrationCandidate[],
  model: string = DEFAULT_ARBITRATION_MODEL,
): Promise<ArbitrationDecision> {
  const response = await client.messages.parse({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: buildArbitrationPrompt(subject, candidates) }],
    output_config: { format: zodOutputFormat(ArbitrationDecisionSchema) },
  });
  if (!response.parsed_output) {
    throw new Error("Arbitration response failed to parse against the decision schema");
  }
  return response.parsed_output;
}

/** Applies CONFIDENCE_THRESHOLD: below it (including any UNCERTAIN),
 * defaults to CREATE_NEW rather than trusting a shaky MATCH. */
export function resolveArbitration(decision: ArbitrationDecision): ArbitrationOutcome {
  if (decision.action === "MATCH" && decision.confidence >= CONFIDENCE_THRESHOLD) {
    return {
      kind: "match",
      candidateId: decision.candidateId,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
    };
  }
  if (decision.action === "CREATE_NEW" && decision.confidence >= CONFIDENCE_THRESHOLD) {
    return { kind: "create", confidence: decision.confidence, reasoning: decision.reasoning };
  }
  const confidence = decision.action === "UNCERTAIN" ? null : decision.confidence;
  return { kind: "create", confidence, reasoning: decision.reasoning };
}
