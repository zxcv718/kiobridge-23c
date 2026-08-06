/**
 * Shared test helpers.
 *
 * IMPORTANT: this module deliberately exposes NO plan/submission generator for
 * the three evaluated environments. Public tests VALIDATE submissions; they do
 * not produce them. The sandbox-only builder lives in
 * `tests/public/sandbox/sandbox-plan-builder.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { EnvironmentPack, Evidence, ParticipantSubmission, ValidationResult } from "@kiobridge/contracts";
import { runSubmission, type RunResult } from "@kiobridge/evaluator";
import { SimulationDriver } from "@kiobridge/simulation-driver";
import { loadEnvironmentPack } from "../apps/simulation-api/src/loader";
import { validateSubmission } from "../apps/simulation-api/src/validate";

export { loadEnvironmentPack, validateSubmission, runSubmission };

export const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** The three environments used for scoring. Public helpers must not build plans for these. */
export const EVALUATED_ENVIRONMENTS = ["chicken-store", "hospital", "public-office"] as const;

export function loadExample(kind: "valid" | "invalid", name: string): ParticipantSubmission {
  const dir = kind === "valid" ? "submission-format-example" : "invalid-submissions";
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "examples", dir, name), "utf-8")) as ParticipantSubmission;
}

/** Canonical Input example (profile + sessionContext only) for an environment. */
export function loadPublicCanonicalInputs(environmentId: string): Record<string, unknown>[] {
  const dir = path.join(REPO_ROOT, "examples", "public-canonical-input", environmentId);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf-8")));
}

export interface Outcome {
  pack: EnvironmentPack;
  validation: ValidationResult;
  run?: RunResult;
  evidence?: Evidence;
}

/** Full platform flow: validate → (if valid) execute via the Simulation Driver. */
export async function processSubmission(sub: ParticipantSubmission, injectError?: string): Promise<Outcome> {
  const pack = loadEnvironmentPack(sub.environmentId);
  const validation = validateSubmission(pack, sub);
  if (!validation.valid) return { pack, validation };
  const { run, evidence } = await runSubmission(pack, sub, {
    injectError: injectError as never, submissionValid: true,
    sessionId: "TEST-SESSION", validationErrors: validation.errors,
    driver: new SimulationDriver(),
  });
  return { pack, validation, run, evidence };
}

// ---------------------------------------------------------------------------
// Attribute-based candidate lookups.
// Tests should describe WHAT they need (an unavailable candidate, an allergen
// candidate) rather than hardcoding a public id that may change.
// ---------------------------------------------------------------------------

export const findUnavailable = (pack: EnvironmentPack) => pack.candidates.find((c) => !c.available);
export const findAvailable = (pack: EnvironmentPack) => pack.candidates.find((c) => c.available);
export const findWithAllergen = (pack: EnvironmentPack, allergen: string) =>
  pack.candidates.find((c) => ((c.attributes?.allergenIds as string[] | undefined) ?? []).includes(allergen));
export const findRequiringAuth = (pack: EnvironmentPack) =>
  pack.candidates.find((c) => (((c.requirements?.authenticationMethods as string[] | undefined) ?? []).length > 0));
