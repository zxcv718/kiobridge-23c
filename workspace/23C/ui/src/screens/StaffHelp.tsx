import React from "react";
import { useFlow } from "../flow";
import { Cta, Emphasize, Screen } from "../components";

/**
 * 직원 호출.
 *
 * 대응하는 시안이 없어 다른 화면과 같은 문법으로 짰다 — 인사말 → 큰 제목 →
 * 부제 → 넓은 여백 → 화면 아래 CTA.
 *
 * 어느 화면에서든 여기로 나올 수 있다 — 막다른 길을 만들지 않는다는 약속이
 * 실제로 지켜지는지는 tests/a11y.test.ts 가 화면 파일마다 검사한다.
 * (이 화면 자신은 면제 대상이다. 직원 도움 화면에 직원 도움 버튼은 없다.)
 *
 * 뒤로가기를 두지 않는다. 흐름에 «직전 화면» 기록이 없어서 어디로 되돌릴지
 * 정할 수 없고, 아무 데나 보내는 뒤로가기는 없느니만 못하다.
 */
export function StaffHelp() {
  const { setStep } = useFlow();

  return (
    <Screen
      label="직원 호출"
      noStaff="직원 도움 화면 자체다 — 여기서 자기 자신으로 가는 길을 또 둘 이유가 없다"
      eyebrow="고객님,"
      title={<Emphasize text="직원을 불러 드릴게요" word="직원" />}
      subtitle="막히는 단계가 있으면 언제든 이 버튼으로 나올 수 있습니다 — 막다른 길을 만들지 않습니다."
      actions={<Cta tone="primary" label="처음으로 돌아가기" onClick={() => setStep("start")} />}
    >
      <p className="hint">시뮬레이션이므로 실제 호출은 일어나지 않습니다.</p>
    </Screen>
  );
}
