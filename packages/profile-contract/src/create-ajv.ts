/**
 * The one AJV factory used by every official validation channel.
 *
 * Before this existed, each channel built its own AJV. None of them registered
 * format handlers, so AJV printed `unknown format "date-time" ignored` at
 * startup and every `format` keyword in the schemas was silently a no-op —
 * "not-a-date" validated cleanly. Anything that compiles a contract schema must
 * come through here.
 */
import Ajv, { type Options } from "ajv";
import addFormats from "ajv-formats";
import { isIso8601UtcTimestamp } from "./timestamp";

/** Custom format name for Canonical Input timestamps. */
export const UTC_TIMESTAMP_FORMAT_NAME = "iso-8601-utc";

/**
 * `ajv-formats`' own `date-time` follows RFC 3339, which permits numeric
 * offsets. Canonical Input allows UTC only, so the contract uses this stricter
 * format instead.
 */
export function addContractFormats(ajv: Ajv): Ajv {
  addFormats(ajv);
  ajv.addFormat(UTC_TIMESTAMP_FORMAT_NAME, {
    type: "string",
    validate: (value: string) => isIso8601UtcTimestamp(value),
  });
  return ajv;
}

/**
 * Build an AJV that knows every format the contract schemas reference.
 *
 * `strict: false` is kept from the previous setup so that schema authoring
 * conventions already in the repo keep working; it does NOT affect format
 * checking, which is what was broken.
 */
export function createContractAjv(options: Options = {}): Ajv {
  const ajv = new Ajv({ allErrors: true, strict: false, ...options });
  return addContractFormats(ajv);
}
