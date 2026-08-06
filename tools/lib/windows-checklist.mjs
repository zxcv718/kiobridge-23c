/**
 * Single source of truth for WINDOWS_FINAL_CHECKLIST.md.
 *
 * v5.1.1 shipped the checklist to release/ only — participants never got it.
 * The fix is not to copy the file twice; it is to have exactly one generator
 * whose output lands in both places, byte for byte.
 *
 * Outputs (identical bytes, identical SHA-256):
 *   <repo root>/WINDOWS_FINAL_CHECKLIST.md   → ships inside the participant ZIP
 *   release/WINDOWS_FINAL_CHECKLIST.md       → organiser review copy
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TEMPLATE_REL = "tools/templates/WINDOWS_FINAL_CHECKLIST.template.md";
export const TEMPLATE_PATH = path.join(REPO_ROOT, TEMPLATE_REL);
/** Where participants find it: ZIP root, not release/. */
export const CHECKLIST_BASENAME = "WINDOWS_FINAL_CHECKLIST.md";

/** Ports and launcher names are stated once so the checklist cannot drift. */
export const WEB_PORT = "3000";
export const API_PORT = "4000";
export const START_BAT = "start-windows.bat";
export const STOP_BAT = "stop-windows.bat";
export const CONTRACT_VERSION = "1.0.0";

/** Participant CLI commands the checklist must walk through, in order. */
export const CLI_COMMANDS = [
  "participant:doctor", "participant:demo", "participant:init",
  "participant:progress", "participant:validate", "participant:package",
];

export function productVersion(root = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")).version;
}

/**
 * Renders the checklist. Every version-bearing value is substituted, so a
 * version bump can never leave a stale number behind in the shipped file.
 */
export function generateWindowsFinalChecklist({
  productVersion: version,
  inputContractVersion = CONTRACT_VERSION,
  webPort = WEB_PORT,
  apiPort = API_PORT,
  startBat = START_BAT,
  stopBat = STOP_BAT,
  edition = "participant",
  templatePath = TEMPLATE_PATH,
} = {}) {
  if (!version) throw new Error("generateWindowsFinalChecklist: productVersion 이 필요합니다.");
  const zipName = `kiobridge-simulation-kit-v${version}-${edition}.zip`;
  const rendered = readFileSync(templatePath, "utf-8")
    .replaceAll("{{PRODUCT_VERSION}}", version)
    .replaceAll("{{CONTRACT_VERSION}}", inputContractVersion)
    .replaceAll("{{WEB_PORT}}", webPort)
    .replaceAll("{{API_PORT}}", apiPort)
    .replaceAll("{{START_BAT}}", startBat)
    .replaceAll("{{STOP_BAT}}", stopBat)
    .replaceAll("{{ZIP_NAME}}", zipName)
    .replaceAll("{{TEMPLATE_PATH}}", TEMPLATE_REL);

  const unresolved = rendered.match(/\{\{[A-Z_]+\}\}/g);
  if (unresolved) throw new Error(`치환되지 않은 자리표시자: ${[...new Set(unresolved)].join(", ")}`);
  return rendered;
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
