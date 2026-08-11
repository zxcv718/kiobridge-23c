/**
 * 제출 폴더의 README 를 원본에서 다시 깔고, 해시를 실제 파일에서 읽어 채운다.
 *
 * `participant:package` 는 돌 때마다 submission-output/23C/README.md 를 **빈 서식으로
 * 덮어쓴다.** 그것이 그 도구의 일이다 — 참가팀이 채우라고 주는 서식이니까. 문제는 우리가
 * 그 자리에 공들여 쓴 글을 매번 손으로 되살려야 했다는 것이고, 실제로 한 번은 되살린 뒤
 * 덧붙인 문단이 다음 패키징에서 통째로 날아갔다.
 *
 * 더 나쁜 경우는 되살리는 것을 **잊는** 것이다. 그러면 「(채우세요)」가 여덟 칸 그대로인
 * 서식이 제출된다. 검사가 없으니 아무도 알려주지 않는다.
 *
 * 그래서 원본을 workspace/23C/submission-readme.md 에 두고 여기서 깐다. 손으로 하던 일이
 * 아니라 명령 하나가 되면, 잊는 것이 가능하지 않다.
 *
 * 해시는 **원본에 적어 두지 않는다.** 제출물이 바뀌면 해시도 바뀌는데 원본에 박아 두면
 * 둘이 갈라지고, 갈라진 것을 사람이 눈으로 맞춰야 한다. 실제 파일에서 계산해 채운다.
 *
 *   npx tsx workspace/23C/install-readme.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const out = join(root, "submission-output", "23C");

const submission = readFileSync(join(out, "participant-submission.json"));
const sha = createHash("sha256").update(submission).digest("hex");

let readme = readFileSync(join(here, "submission-readme.md"), "utf8");

/* 원본에 어떤 해시가 적혀 있든 지금 것으로 맞춘다. 자리가 없으면 그건 원본이 깨진
   것이므로 조용히 넘어가지 않는다 — 해시 없는 README 는 제출 요건을 못 채운다. */
const slot = /`[0-9a-f]{64}`/g;
const found = readme.match(slot)?.length ?? 0;
if (found === 0) {
  console.error("submission-readme.md 에 SHA-256 자리(`<64자리>`)가 없습니다.");
  process.exit(1);
}
readme = readme.replace(slot, `\`${sha}\``);

/* 빈 서식이 새어 나가지 않게 막는다. 패키저의 「(채우세요)」가 원본에 섞여 들어오면
   그대로 제출될 수 있다. */
if (readme.includes("(채우세요)")) {
  console.error("submission-readme.md 에 «(채우세요)» 가 남아 있습니다 — 빈 서식이 섞였습니다.");
  process.exit(1);
}

writeFileSync(join(out, "README.md"), readme);

/* submission.sha256 · validation-report.md 는 패키저가 쓴다. 우리가 계산한 값과
   같은지 여기서 확인한다 — 네 곳이 갈라지면 심사자가 먼저 발견하게 된다. */
const others: Record<string, string> = {
  "submission.sha256": readFileSync(join(out, "submission.sha256"), "utf8"),
  "validation-report.md": readFileSync(join(out, "validation-report.md"), "utf8"),
};
const 어긋남 = Object.entries(others).filter(([, text]) => !text.includes(sha));
if (어긋남.length > 0) {
  console.error(`해시가 어긋납니다: ${어긋남.map(([f]) => f).join(", ")} — 패키징을 다시 하세요.`);
  process.exit(1);
}

console.log(`README 설치 완료 · SHA-256 ${sha}`);
console.log(`  일치: README.md · ${Object.keys(others).join(" · ")} · 실제 파일`);
