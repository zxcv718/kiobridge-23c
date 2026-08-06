/** Type surface for the checklist generator, used by the packaging tests. */
export const REPO_ROOT: string;
export const TEMPLATE_REL: string;
export const TEMPLATE_PATH: string;
export const CHECKLIST_BASENAME: string;
export const WEB_PORT: string;
export const API_PORT: string;
export const START_BAT: string;
export const STOP_BAT: string;
export const CONTRACT_VERSION: string;
export const CLI_COMMANDS: string[];
export function productVersion(root?: string): string;
export function generateWindowsFinalChecklist(options?: {
  productVersion?: string;
  inputContractVersion?: string;
  webPort?: string;
  apiPort?: string;
  startBat?: string;
  stopBat?: string;
  edition?: string;
  templatePath?: string;
}): string;
export function sha256(buf: Buffer | string): string;
