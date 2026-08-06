import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createContractAjv } from "@kiobridge/profile-contract";
import { REPO_ROOT, loadEnvironmentPack, loadExample, loadPublicCanonicalInputs, processSubmission } from "../../shared";
import { buildSandboxSubmission } from "../sandbox/sandbox-plan-builder";
import { discoverEnvironmentIds } from "../../../apps/simulation-api/src/loader";
import * as E from "@kiobridge/profile-contract";
import { validateCanonicalInput } from "@kiobridge/profile-contract";

// Same factory as the API: a format that works in one must work in both.
const ajv = createContractAjv();
for (const dir of ["core", "domains"]) {
  const full = path.join(REPO_ROOT, "schemas", dir);
  for (const f of readdirSync(full)) {
    if (!f.endsWith(".json")) continue;
    const schema = JSON.parse(readFileSync(path.join(full, f), "utf-8"));
    if (schema.$id && !ajv.getSchema(schema.$id)) ajv.addSchema(schema);
  }
}
const S = (id: string) => ajv.getSchema(`https://kiobridge.local/schemas/${id}`)!;
const submissionSchema = S("core/participant-submission.schema.json");
const evidenceSchema = S("core/evidence.schema.json");
const profileSchema = S("core/canonical-profile.schema.json");
const envPackSchema = S("core/environment-pack.schema.json");

const ENVS = discoverEnvironmentIds();
const readJson = (rel: string) => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf-8"));

describe("스키마 ↔ TypeScript 타입 일치 (자동검사)", () => {
  it("sandbox 완성 제출이 스키마를 만족한다", () => {
    const sub = buildSandboxSubmission(loadEnvironmentPack("sandbox"));
    expect(submissionSchema(sub), JSON.stringify(submissionSchema.errors)).toBe(true);
  });

  it("공개 Canonical Input 예제(프로필+컨텍스트)가 계약을 만족한다", () => {
    for (const env of ENVS) {
      for (const doc of loadPublicCanonicalInputs(env)) {
        const { _note, _expectedValidation, ...input } = doc as Record<string, unknown>;
        const r = validateCanonicalInput(input);
        // 일부 예제는 "그대로 제출하면 거부된다"를 가르치기 위한 것이다.
        expect(r.valid, `${env}: ${JSON.stringify(r.errors)}`).toBe(_expectedValidation !== "REQUIRES_RECONFIRMATION");
      }
    }
  });

  it("서버 Evidence 가 evidence 스키마(v1.2)를 만족한다", async () => {
    const out = await processSubmission(buildSandboxSubmission(loadEnvironmentPack("sandbox")));
    expect(evidenceSchema(out.evidence), JSON.stringify(evidenceSchema.errors)).toBe(true);
  });

  it("모든 환경 manifest 가 environment-pack 스키마 + inputContract 를 만족한다", () => {
    for (const env of ENVS) {
      const m = loadEnvironmentPack(env).manifest;
      expect(envPackSchema(m), `${env}: ${JSON.stringify(envPackSchema.errors)}`).toBe(true);
      expect(m.inputContract?.version, `${env} inputContract.version`).toBe("1.0.0");
      expect(m.supportedProfileContractVersions).toContain("1.0.0");
    }
  });

  it("participant-submission 은 프로필을 재정의하지 않고 $ref 로 참조한다", () => {
    const raw = readJson("schemas/core/participant-submission.schema.json");
    expect(raw.properties.profile.$ref).toContain("canonical-profile.schema.json");
    expect(raw.properties.sessionContext.$ref).toContain("session-context-base.schema.json");
    expect(raw.properties.profile.properties, "프로필 정의 중복 금지").toBeUndefined();
  });

  it("스키마 enum 과 TypeScript enum 이 일치한다", () => {
    const chicken = readJson("schemas/domains/chicken-store.context.schema.json");
    expect(chicken.properties.preferences.properties.serviceType.enum).toEqual(E.values(E.SERVICE_TYPE));
    expect(chicken.properties.preferences.properties.spicyLevel.enum).toEqual(E.values(E.SPICY_LEVEL));
    expect(chicken.properties.hardConstraints.properties.allergenIds.items.enum).toEqual(E.values(E.ALLERGEN));

    const hospital = readJson("schemas/domains/hospital.context.schema.json");
    expect(hospital.properties.facts.properties.visitType.enum).toEqual(E.values(E.VISIT_TYPE));
    expect(hospital.properties.facts.properties.departmentId.enum).toEqual(E.values(E.DEPARTMENT));

    const pub = readJson("schemas/domains/public-office.context.schema.json");
    expect(pub.properties.capabilities.properties.availableAuthMethods.items.enum).toEqual(E.values(E.AUTH_METHOD));

    const prof = readJson("schemas/core/canonical-profile.schema.json");
    expect(prof.properties.interaction.properties.preferredInput.enum).toEqual(E.values(E.PREFERRED_INPUT));
    expect(prof.properties.source.properties.collectionChannel.enum).toEqual(E.values(E.COLLECTION_CHANNEL));
  });

  it("vocabulary 파일이 enum 과 일치한다", () => {
    const v = readJson("schemas/vocabularies/chicken-store.vocabulary.json");
    expect(v.preferences.serviceType).toEqual(E.values(E.SERVICE_TYPE));
    expect(v.hardConstraints.allergenIds).toEqual(E.values(E.ALLERGEN));
  });

  it("displayName 은 TypeScript·스키마 모두 선택 필드", () => {
    const prof = readJson("schemas/core/canonical-profile.schema.json");
    expect(prof.required).not.toContain("displayName");
    const sub = buildSandboxSubmission(loadEnvironmentPack("sandbox"));
    delete (sub.profile as { displayName?: string }).displayName;
    expect(profileSchema(sub.profile), JSON.stringify(profileSchema.errors)).toBe(true);
  });

  it("스키마는 targetId 를 거부하고 semantic target 을 요구한다", () => {
    const sub = buildSandboxSubmission(loadEnvironmentPack("sandbox"));
    const bad = JSON.parse(JSON.stringify(sub));
    delete bad.executionPlan.actions[0].target;
    bad.executionPlan.actions[0].targetId = "btnSomething";
    expect(submissionSchema(bad)).toBe(false);
  });

  it("extensions 는 허용되고 핵심 객체는 additionalProperties:false", () => {
    const sub = buildSandboxSubmission(loadEnvironmentPack("sandbox"));
    sub.extensions = { "TEAM-EXAMPLE": { schemaVersion: "1.0.0", features: ["VOICE_PROFILE"], metadata: {} } };
    expect(submissionSchema(sub), JSON.stringify(submissionSchema.errors)).toBe(true);
    (sub as unknown as Record<string, unknown>).randomField = 123;
    expect(submissionSchema(sub)).toBe(false);
  });

  it("공개 형식 예제(sandbox)가 스키마를 만족한다", () => {
    expect(submissionSchema(loadExample("valid", "sandbox.json"))).toBe(true);
  });
});
