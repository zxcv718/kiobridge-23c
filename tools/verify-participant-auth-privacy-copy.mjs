#!/usr/bin/env node
/**
 * 로그인·저장·개인정보 안내가 일관되고 모호하지 않은지 검사합니다.
 *
 *   node tools/verify-participant-auth-privacy-copy.mjs [projectRoot]
 *
 * 참가팀이 Example UI 의 "로그인 없음"을 과제 전체의 로그인 금지로 읽는 일이
 * 있었습니다. 이 검증기는 두 가지를 봅니다.
 *
 *   1. 필수 의미가 실제로 적혀 있는가
 *   2. 범위를 밝히지 않은 모호한 문구가 참가팀 안내에 남아 있는가
 *
 * 2번은 오탐이 나기 쉽습니다. 나쁜 예시를 보여주는 문서, 코드블록, 인용구,
 * 주석은 사용자에게 노출되는 안내가 아니므로 검사 대상에서 제외합니다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const exists = (rel) => existsSync(path.join(ROOT, rel));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf-8");

const errors = [];
const notes = [];

/* ── 검사 대상 ───────────────────────────────────────────────── */

const UI_HTML = "participant-workspace/example-ui/index.html";
const DOCS = [
  UI_HTML,
  "participant-workspace/example-ui/README.md",
  "00_START_HERE.html", "00_START_HERE.md", "README_FIRST.md",
  "PARTICIPANT_CHECKLIST.md",
  "participant-workspace/README.md",
  "docs/WHAT_YOU_BUILD.md", "docs/PARTICIPANT_GUIDE.md",
  "docs/LOGINLESS_QR_PROFILE_GUIDE.md", "docs/PARTICIPANT_IDEA_CATALOG.md",
  "docs/ORGANIZER_DISTRIBUTION_GUIDE.md",
  "docs/ONBOARDING_VIDEO_SCRIPT_7_MINUTES.md",
  "participant-workspace/participant-ux.template.json",
];

/**
 * 사용자에게 노출되는 안내만 남깁니다.
 *  - ``` 코드블록      : 명령·JSON 예시
 *  - > 인용구           : 공지 템플릿·나쁜 예시 인용
 *  - <!-- --> · // · /* : 주석
 *  - "이렇게 말하지 마세요"/"잘못된 안내" 표 행: 금지 표현을 보여주는 자리
 */
function visibleGuidance(text) {
  const out = [];
  let fenced = false;
  for (const raw of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (/^\s*>/.test(raw)) continue;                       // 인용구
    if (/^\s*(\/\/|\/\*|\*|<!--)/.test(raw)) continue;      // 주석
    if (/잘못된 안내|이렇게 말하지 마세요|금지되는 표현|나쁜 예|하지 마세요|피하세요|오해/.test(raw)) continue;
    out.push(raw.replace(/<!--[\s\S]*?-->/g, ""));
  }
  return out.join("\n");
}

/* ── 1. 필수 의미가 적혀 있는가 ───────────────────────────────── */

/** 문서마다 반드시 담아야 하는 의미. 표현이 달라도 되도록 정규식으로 봅니다. */
const REQUIRED = [
  {
    id: "EXAMPLE_UI_IS_REFERENCE",
    label: "Example UI 는 참고 예제",
    re: /참고 예제|참고 UI|reference example/i,
    files: [UI_HTML, "participant-workspace/example-ui/README.md", "00_START_HERE.html",
      "docs/ORGANIZER_DISTRIBUTION_GUIDE.md"],
  },
  {
    id: "EXAMPLE_UI_WORKS_WITHOUT_LOGIN",
    label: "Example UI 는 로그인 없이 작동",
    re: /이 (예제|화면|UI)[\s\S]{0,60}로그인 없이|로그인 없이 (동작|작동)하는/,
    files: [UI_HTML, "participant-workspace/example-ui/README.md", "00_START_HERE.html",
      "docs/ORGANIZER_DISTRIBUTION_GUIDE.md"],
  },
  {
    id: "LOGIN_IS_OPTIONAL",
    label: "로그인 기능은 선택사항",
    re: /로그인[\s\S]{0,30}선택사항|로그인[\s\S]{0,40}금지되지 않|선택적 로그인/,
    files: [UI_HTML, "participant-workspace/example-ui/README.md", "00_START_HERE.html",
      "00_START_HERE.md", "README_FIRST.md", "docs/PARTICIPANT_GUIDE.md",
      "docs/LOGINLESS_QR_PROFILE_GUIDE.md", "docs/ORGANIZER_DISTRIBUTION_GUIDE.md",
      "docs/ONBOARDING_VIDEO_SCRIPT_7_MINUTES.md"],
  },
  {
    id: "CORE_FLOW_WITHOUT_LOGIN",
    label: "핵심 흐름은 로그인 없이 가능",
    re: /로그인하지 않(아도|은)[\s\S]{0,60}(핵심|기본)|핵심[\s\S]{0,40}로그인 없이/,
    files: [UI_HTML, "participant-workspace/example-ui/README.md", "00_START_HERE.html",
      "00_START_HERE.md", "README_FIRST.md", "PARTICIPANT_CHECKLIST.md",
      "docs/PARTICIPANT_GUIDE.md", "docs/LOGINLESS_QR_PROFILE_GUIDE.md",
      "docs/ORGANIZER_DISTRIBUTION_GUIDE.md", "docs/ONBOARDING_VIDEO_SCRIPT_7_MINUTES.md"],
  },
  {
    id: "DEVICE_STORAGE_OPTIONAL",
    label: "기기 저장은 선택사항",
    re: /저장[\s\S]{0,30}선택사항|저장하지 않아도/,
    files: [UI_HTML, "participant-workspace/example-ui/README.md"],
  },
  {
    id: "FREE_CHANNELS",
    label: "QR·음성 등 자유 구현",
    re: /(QR|음성)[\s\S]{0,90}자유/,
    files: [UI_HTML, "participant-workspace/example-ui/README.md", "00_START_HERE.html",
      "00_START_HERE.md", "README_FIRST.md", "docs/PARTICIPANT_GUIDE.md",
      "docs/ORGANIZER_DISTRIBUTION_GUIDE.md"],
  },
  {
    id: "SYNTHETIC_DATA_ONLY",
    label: "심사는 가상 데이터 사용",
    re: /가상[·・]?[^\n]{0,10}(합성)?\s*데이터|합성 데이터/,
    files: [UI_HTML, "participant-workspace/example-ui/README.md", "00_START_HERE.html",
      "00_START_HERE.md", "README_FIRST.md", "docs/PARTICIPANT_GUIDE.md",
      "docs/LOGINLESS_QR_PROFILE_GUIDE.md", "docs/ORGANIZER_DISTRIBUTION_GUIDE.md",
      "docs/ONBOARDING_VIDEO_SCRIPT_7_MINUTES.md"],
  },
  {
    id: "REAL_SERVICE_PRIVACY",
    label: "실제 서비스는 별도 개인정보 보호 필요",
    re: /실제 서비스[\s\S]{0,90}(동의|개인정보)/,
    files: [UI_HTML, "participant-workspace/example-ui/README.md", "00_START_HERE.html",
      "00_START_HERE.md", "README_FIRST.md", "docs/PARTICIPANT_GUIDE.md",
      "docs/LOGINLESS_QR_PROFILE_GUIDE.md"],
  },
  {
    id: "NOT_AN_ANSWER_KEY",
    label: "Example UI 는 공식 정답이 아님",
    re: /공식 정답(이|이나)?[\s\S]{0,40}(아닙|아니)/,
    files: [UI_HTML, "participant-workspace/example-ui/README.md",
      "docs/ORGANIZER_DISTRIBUTION_GUIDE.md"],
  },
  {
    id: "LOGIN_REQUIRED_MEANING",
    label: "loginRequired 의미 설명",
    re: /차단되지 않는다|막히지 않/,
    files: ["participant-workspace/participant-ux.template.json"],
  },
];

for (const rule of REQUIRED) {
  for (const f of rule.files) {
    if (!exists(f)) { errors.push(`${f} 가 없습니다.`); continue; }
    if (!rule.re.test(read(f))) errors.push(`[${rule.id}] ${f} 에 "${rule.label}" 의미가 없습니다.`);
  }
}
notes.push(`필수 의미 ${REQUIRED.length}종 · 검사 문서 ${DOCS.length}개`);

/* ── 2. 범위 없는 모호한 문구 ────────────────────────────────── */

/**
 * 각 항목은 "이 표현이 나오는 줄에 범위를 밝히는 말이 함께 있는가"로 판정합니다.
 * 범위가 있으면 통과입니다. 예: "이 예제에서는 계정 없이 바로 시작합니다."
 */
const SCOPE = /이 (예제|화면|UI|폴더)|Example UI|이번 (이용|한 번)|Sandbox|공식 심사|심사에는|해커톤/;
const AMBIGUOUS = [
  { id: "LOGIN_NOT_NEEDED", re: /로그인(은|이)\s*필요\s*없/, label: "로그인은 필요 없습니다" },
  { id: "NO_ACCOUNT_NEEDED", re: /계정을\s*만들\s*필요가?\s*없/, label: "계정을 만들 필요가 없습니다" },
  { id: "STORES_NOTHING", re: /아무것도\s*저장하지\s*않/, label: "아무것도 저장하지 않습니다" },
  { id: "NO_PERSONAL_DATA", re: /개인정보를?\s*(사용할\s*수\s*없|쓸\s*수\s*없)/, label: "개인정보를 사용할 수 없습니다" },
];
/** 범위를 붙여도 뜻이 바뀌지 않는, 그냥 쓰면 안 되는 표현. */
const FORBIDDEN = [
  { id: "LOGIN_BANNED", re: /로그인(을|\s*기능을)?\s*만들면\s*안\s*됩?니다/, label: "로그인을 만들면 안 됩니다" },
  { id: "MUST_BE_ANONYMOUS", re: /무조건\s*익명/, label: "무조건 익명" },
  { id: "LOGIN_NOT_EVALUATED", re: /로그인\s*기능은\s*평가하지\s*않/, label: "로그인 기능은 평가하지 않습니다" },
  { id: "CANNOT_STORE", re: /사용자\s*정보는?\s*저장할\s*수\s*없/, label: "사용자 정보는 저장할 수 없습니다" },
];

let ambiguousCount = 0;
for (const f of DOCS) {
  if (!exists(f)) continue;
  const guidance = visibleGuidance(read(f));
  guidance.split("\n").forEach((line, idx) => {
    const plain = line.replace(/<[^>]+>/g, " ");
    for (const rule of AMBIGUOUS) {
      if (rule.re.test(plain) && !SCOPE.test(plain)) {
        ambiguousCount += 1;
        errors.push(`[AMBIGUOUS_${rule.id}] ${f}: 범위 없이 "${rule.label}" — ${plain.trim().slice(0, 60)}`);
      }
    }
    for (const rule of FORBIDDEN) {
      if (rule.re.test(plain)) {
        ambiguousCount += 1;
        errors.push(`[FORBIDDEN_${rule.id}] ${f}: "${rule.label}" — ${plain.trim().slice(0, 60)}`);
      }
    }
  });
}
notes.push(`모호·금지 문구 ${ambiguousCount}건`);

/* ── 3. Example UI 구조 확인 ─────────────────────────────────── */

if (exists(UI_HTML)) {
  const html = read(UI_HTML);
  for (const [needle, label] of [
    ['id="login-optional"', "로그인 선택사항 안내 블록"],
    ["이번만 사용하기", "이번만 사용하기 버튼"],
    ["저장된 설정으로 시작", "저장된 설정으로 시작 버튼"],
    ['role="note"', "상단 안내 landmark"],
  ]) if (!html.includes(needle)) errors.push(`${UI_HTML} 에 ${label} 이 없습니다.`);

  // 상단 안내는 여러 문단이어야 합니다.
  const notice = html.match(/<section class="notice"[\s\S]*?<\/section>/);
  if (!notice) errors.push(`${UI_HTML} 상단 안내 블록을 찾을 수 없습니다.`);
  else {
    const paras = (notice[0].match(/<p[\s>]/g) ?? []).length;
    if (paras < 3) errors.push(`${UI_HTML} 상단 안내가 ${paras}문단입니다 (3문단 이상 필요).`);
    notes.push(`Example UI 상단 안내 ${paras}문단`);
  }
}

/* ── 4. 스크립트 연결 ────────────────────────────────────────── */

const pkg = JSON.parse(read("package.json"));
const SELF = "verify:participant-auth-privacy-copy";
if (!pkg.scripts?.[SELF]) errors.push(`npm script 없음: ${SELF}`);
if (!(pkg.scripts?.["release:verify"] ?? "").includes(SELF)) {
  errors.push(`release:verify 가 ${SELF} 를 부르지 않습니다.`);
}

/* ── 결과 ────────────────────────────────────────────────────── */

console.log("PARTICIPANT AUTH · PRIVACY COPY VERIFICATION");
console.log("=".repeat(52));
for (const n of notes) console.log(`  ${n}`);
console.log("");
if (errors.length > 0) {
  console.error(`실패 ${errors.length}건\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("로그인·저장·개인정보 안내가 일관되며 범위가 명확합니다.");
