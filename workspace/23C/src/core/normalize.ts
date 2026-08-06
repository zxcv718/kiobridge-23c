/**
 * STEP 2·3 보조 — 자유 형식 원본 입력을 공식 enum으로 정규화하는 동의어 테이블.
 *
 * 원칙 (docs/MAPPING_GUIDE.md):
 *  - 값을 추측하지 않는다. 매핑 불가면 undefined(누락) 또는 "UNKNOWN".
 *  - 부분 문자열 추측 금지 — 명시된 동의어만 인정한다.
 */
// 값 import는 브라우저 안전한 profile-contract에서 — SDK 인덱스는 evaluator(node:fs)를 재수출해 브라우저 번들이 깨진다
import {
  SERVICE_TYPE, SPICY_LEVEL, BONE_TYPE, CUP_OPTION, ALLERGEN, SENTINEL,
} from "@kiobridge/profile-contract";

type Table = Record<string, string>;

const norm = (v: unknown): string => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "_");

const SERVICE_TABLE: Table = {
  "포장": SERVICE_TYPE.TAKE_OUT, "포장하기": SERVICE_TYPE.TAKE_OUT, "테이크아웃": SERVICE_TYPE.TAKE_OUT,
  "TAKEOUT": SERVICE_TYPE.TAKE_OUT, "TAKE_OUT": SERVICE_TYPE.TAKE_OUT,
  "매장": SERVICE_TYPE.DINE_IN, "먹고가기": SERVICE_TYPE.DINE_IN, "먹고_가기": SERVICE_TYPE.DINE_IN,
  "DINEIN": SERVICE_TYPE.DINE_IN, "DINE_IN": SERVICE_TYPE.DINE_IN,
  "상관없음": SENTINEL.NO_PREFERENCE, "아무거나": SENTINEL.NO_PREFERENCE, "NO_PREFERENCE": SENTINEL.NO_PREFERENCE,
};

const SPICY_TABLE: Table = {
  "순한맛": SPICY_LEVEL.MILD, "순한": SPICY_LEVEL.MILD, "안맵게": SPICY_LEVEL.MILD, "MILD": SPICY_LEVEL.MILD,
  "보통맛": SPICY_LEVEL.MEDIUM, "보통": SPICY_LEVEL.MEDIUM, "MEDIUM": SPICY_LEVEL.MEDIUM,
  "매운맛": SPICY_LEVEL.HOT, "맵게": SPICY_LEVEL.HOT, "매운": SPICY_LEVEL.HOT, "HOT": SPICY_LEVEL.HOT,
  "상관없음": SENTINEL.NO_PREFERENCE, "NO_PREFERENCE": SENTINEL.NO_PREFERENCE,
};

const BONE_TABLE: Table = {
  "순살": BONE_TYPE.BONELESS, "BONELESS": BONE_TYPE.BONELESS,
  "뼈": BONE_TYPE.BONE, "뼈있는": BONE_TYPE.BONE, "BONE": BONE_TYPE.BONE,
  "상관없음": SENTINEL.NO_PREFERENCE, "NO_PREFERENCE": SENTINEL.NO_PREFERENCE,
};

const CUP_TABLE: Table = {
  "종이컵": CUP_OPTION.PAPER, "종이": CUP_OPTION.PAPER, "PAPER": CUP_OPTION.PAPER,
  "일반컵": CUP_OPTION.REGULAR, "일반": CUP_OPTION.REGULAR, "REGULAR": CUP_OPTION.REGULAR,
  "없음": CUP_OPTION.NONE, "필요없음": CUP_OPTION.NONE, "NONE": CUP_OPTION.NONE,
  "상관없음": SENTINEL.NO_PREFERENCE, "NO_PREFERENCE": SENTINEL.NO_PREFERENCE,
};

const ALLERGEN_TABLE: Table = {
  "땅콩": ALLERGEN.PEANUT, "PEANUT": ALLERGEN.PEANUT,
  "콩": ALLERGEN.SOY, "대두": ALLERGEN.SOY, "간장": ALLERGEN.SOY, "SOY": ALLERGEN.SOY,
  "우유": ALLERGEN.MILK, "유제품": ALLERGEN.MILK, "MILK": ALLERGEN.MILK,
  "계란": ALLERGEN.EGG, "달걀": ALLERGEN.EGG, "EGG": ALLERGEN.EGG,
  "밀": ALLERGEN.WHEAT, "밀가루": ALLERGEN.WHEAT, "WHEAT": ALLERGEN.WHEAT,
  "새우": ALLERGEN.SHRIMP, "SHRIMP": ALLERGEN.SHRIMP,
  "모름": SENTINEL.UNKNOWN, "몰라요": SENTINEL.UNKNOWN, "UNKNOWN": SENTINEL.UNKNOWN,
};

const lookup = (table: Table, v: unknown): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  // 4상태 구분(UNKNOWN_POLICY): "해당없음"은 NO_PREFERENCE와 다른 sentinel이다
  const n = norm(v);
  if (n === "해당없음" || n === "NOT_APPLICABLE") return SENTINEL.NOT_APPLICABLE;
  return table[n] ?? table[String(v).trim()];
};

export const toServiceType = (v: unknown) => lookup(SERVICE_TABLE, v);
export const toSpicyLevel = (v: unknown) => lookup(SPICY_TABLE, v);
export const toBoneType = (v: unknown) => lookup(BONE_TABLE, v);
export const toCupOption = (v: unknown) => lookup(CUP_TABLE, v);

/** 알레르기 목록 정규화 — 매핑 불가 항목은 추측하지 않고 UNKNOWN으로 남긴다(재확인 대상). */
export function toAllergens(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  if (arr.length === 0) return [];
  const out = arr.map((a) => lookup(ALLERGEN_TABLE, a) ?? SENTINEL.UNKNOWN);
  return [...new Set(out)];
}

export function toQuantity(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

export function toBudgetKrw(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(String(v).replace(/[,원\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export const asBool = (v: unknown, fallback = false): boolean =>
  typeof v === "boolean" ? v : fallback;
