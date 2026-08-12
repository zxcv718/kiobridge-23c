import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFlow } from "../flow";
import { parseStoreCode } from "../logic";
import { Cta, Screen } from "../components";
import { FLOW_STEPS } from "../model";
import "./qr.css";

/**
 * 화면목록 S01-B — QR 연동 (Figma 150:329 스캔 안내 · 연결 완료는 확정 시안 PNG 2026-08-12).
 *
 * **흐름의 1걸음이다(기획 확정 2026-08-12).** 한때 흐름 밖 관문으로 뺐지만, 확정 시안의
 * 진행 표시가 «QR 연동»을 다섯 걸음의 첫째로 그린다. 앱을 그냥 열면 이 화면이 먼저
 * 나오고, QR 을 찍거나 코드를 넣으면 홈(2걸음)이 나온다. 매장 QR 링크(?env=)로 열렸으면
 * 이 걸음을 마친 것으로 보고 건너뛴다 — 그 확인은 홈이 한다(flow.tsx).
 *
 * **우리가 QR을 만드는 것이 아니다.** 폰 카메라로 매장에 붙은 QR을 읽는 화면이다.
 * 읽기만 하면 되므로 브라우저에 내장된 `BarcodeDetector` + `getUserMedia` 로 충분하고,
 * QR 라이브러리를 새로 들이지 않는다(키트 루트 package.json 은 플랫폼 파일이라 손대지 않는다).
 *
 * **읽은 다음 무엇을 하는가.** 서버가 없으므로 세션을 «발급»받을 수는 없다. 여기서 하는
 * 일은 하나다 — QR에 적힌 매장 코드를 우리가 가진 환경(`fixture.manifest.environmentId`)과
 * 대조하는 것. 같으면 어느 매장인지 밝히고 홈으로 보내고, 다르면 «이 매장 정보는 아직
 * 없습니다»라고 정직하게 말한다. 어느 쪽이든 막다른 길을 만들지 않는다.
 * 「세션이 발급되었습니다」 같은, 우리가 하지 않은 일을 한 것처럼 말하는 문구를 쓰지 않는다.
 * 연결 완료 부제는 확정 시안 그대로 「매장 정보와 세션을 모두 확인했어요」다 — 한동안
 * «세션» 낱말을 빼고 지켰지만 기획이 시안 표기를 확정했다(2026-08-12, FIGMA_RULES §2.8
 * 번복 기록). «발급·생성»처럼 일이 일어난 것으로 읽히는 말은 여전히 쓰지 않는다.
 *
 * **이 화면의 핵심은 읽히는 경우가 아니라 읽히지 않는 경우다.** BarcodeDetector 는
 * Safari·Firefox 에 없고, 카메라 권한은 거부될 수 있고, 카메라가 없는 기기도 있다.
 * 세 경우 모두에서 ① 왜 안 되는지 한 문장으로 말하고 ② 직접 입력 ③ 직원 요청
 * ④ 건너뛰기가 같은 화면에 있어야 한다.
 *
 * 시안(150:359)의 화면 아래는 캡션 한 줄과 흰 버튼 둘 — «직접 입력»·«직원 요청» — 이다.
 * 그대로 둔다. 직접 입력 폼은 버튼으로 접고(§2.1) **카메라를 못 쓰는 것이 확인된 순간에만
 * 저절로 편다** — 그때는 이 입력이 본길이라 «한 번 더 눌러야 닿는 곳»에 둘 수 없고, 시안은
 * 그 상태를 그린 적이 없어 우리가 정하는 자리이기 때문이다.
 * 건너뛰기(«QR 없이 계속하기»)는 시안에 없지만 지우지 않는다 — iOS 처럼 스캔이 아예
 * 막힌 기기에서 앞으로 갈 수 있는 마지막 길이라, 캡션이 소개하는 대안 묶음 아래에 둔다.
 */

/** 카메라 프레임을 얼마나 자주 훑는가. 너무 촘촘하면 저사양 기기에서 화면이 끊긴다. */
const SCAN_INTERVAL_MS = 250;

/* BarcodeDetector 는 아직 표준 DOM 타입에 없다. 우리가 쓰는 만큼만 좁게 적는다 —
   넓게 적으면 «있다고 선언했지만 없는 브라우저»를 타입이 가려 준다. */
interface DetectedBarcode { rawValue?: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

type Phase =
  | "checking"      // 카메라를 쓸 수 있는지 확인하는 중
  | "scanning"      // 카메라가 켜졌고 QR을 찾는 중
  | "noCamera"      // 미지원·권한 거부·기기 없음 — 폴백만 남는다
  | "connected"     // S04b — 우리가 아는 매장이다
  | "unknownStore"; // 읽었지만 이 기기에 없는 매장이다

export function QrConnect() {
  const { fixture, setStep, t } = useFlow();
  const envId = fixture?.manifest.environmentId ?? "";
  const storeName = fixture?.manifest.displayName ?? fixture?.manifest.name ?? "";

  const [phase, setPhase] = useState<Phase>("checking");
  /** 카메라를 못 쓰는 이유. 한 문장으로, 무엇 때문인지 알 수 있게. */
  const [blocked, setBlocked] = useState("");
  /** 읽어낸 매장 코드 — «모르는 매장» 화면에서 무엇을 읽었는지 밝히는 근거다. */
  const [readCode, setReadCode] = useState("");
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState("");
  /** 직접 입력 폼을 폈는가. 시안의 기본 상태는 «버튼 하나»이므로 접힌 채로 시작한다. */
  const [typedOpen, setTypedOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  /* fixture 는 비동기로 도착한다. 카메라 루프는 한 번만 켜지므로 그때의 값을 붙잡고 있으면
     늦게 온 매장 정보를 못 본다 — ref 로 «지금 값»을 보게 한다. */
  const envRef = useRef(envId);
  envRef.current = envId;

  /** 읽은 값을 우리가 가진 매장과 대조한다. 카메라와 직접 입력이 같은 길을 지난다. */
  const decide = useCallback((raw: string) => {
    const code = parseStoreCode(raw);
    setReadCode(code);
    setPhase(code !== "" && code.toLowerCase() === envRef.current.toLowerCase() ? "connected" : "unknownStore");
  }, []);

  /* 카메라가 켜져 있어야 하는 국면. 이 값이 false 로 바뀌는 순간 아래 정리 함수가 돌면서
     트랙이 꺼진다 — 읽기에 성공했을 때도, 사용자가 화면을 떠날 때도 같은 길이다. */
  const cameraWanted = phase === "checking" || phase === "scanning";

  useEffect(() => {
    if (!cameraWanted) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    /** 카메라를 확실히 끈다. 안 끄면 시연 내내 카메라 표시등이 켜져 있다. */
    const stop = () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    void (async () => {
      // ① 기능 감지 — 없는 브라우저가 실제로 있다(Safari·Firefox). 예외까지 감싼다.
      let detector: BarcodeDetectorLike;
      try {
        const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (!Ctor || typeof navigator.mediaDevices?.getUserMedia !== "function") {
          throw new Error("unsupported");
        }
        detector = new Ctor({ formats: ["qr_code"] });
      } catch {
        if (stopped) return;
        setBlocked("이 브라우저에는 카메라로 QR을 읽는 기능이 없습니다. 아래 방법으로 진행해 주세요.");
        setPhase("noCamera");
        return;
      }

      // ② 카메라 열기 — 거부·부재·그 밖의 실패를 구분해서 알린다
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch (e) {
        if (stopped) return;
        const name = (e as { name?: string })?.name ?? "";
        setBlocked(
          name === "NotAllowedError" || name === "SecurityError"
            ? "카메라 사용을 허용하지 않으셔서 QR을 읽을 수 없습니다. 아래 방법으로 진행해 주세요."
            : name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError"
              ? "이 기기에서 쓸 수 있는 카메라를 찾지 못했습니다. 아래 방법으로 진행해 주세요."
              : "카메라를 켜지 못했습니다. 아래 방법으로 진행해 주세요.",
        );
        setPhase("noCamera");
        return;
      }
      // 여는 사이에 화면을 떠났을 수 있다 — 그때 받은 스트림은 그 자리에서 끈다
      if (stopped) { for (const track of stream.getTracks()) track.stop(); return; }

      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream;
      // 재생이 시작되기를 기다리지 않는다. 자동재생이 막힌 브라우저에서도 아래 훑기는
      // 계속 돌아야 하고, 프레임이 아직 없는 동안의 실패는 다음 차례에서 회복된다.
      void video.play().catch(() => { /* 재생 거부는 훑기를 막지 않는다 */ });
      setPhase("scanning");

      const tick = async () => {
        if (stopped) return;
        try {
          const found = await detector.detect(video);
          if (stopped) return;
          const value = found.find((b) => b.rawValue)?.rawValue;
          if (value) { decide(value); return; } // 국면이 바뀌면 정리 함수가 카메라를 끈다
        } catch { /* 프레임 하나가 실패한 것이므로 다음 차례에 다시 본다 */ }
        timer = window.setTimeout(() => { void tick(); }, SCAN_INTERVAL_MS);
      };
      void tick();
    })();

    return stop;
  }, [cameraWanted, decide]);

  /* 카메라를 못 쓰는 것이 확인되면 직접 입력을 펴 둔다. 시안이 그리지 않은 상태이고,
     그때는 이것이 앞으로 가는 본길이라 한 번 더 누르게 할 이유가 없다. 편 뒤에도
     사용자가 다시 접을 수 있게 «상태를 덮어쓰기»가 아니라 «한 번 켜기»로 둔다. */
  useEffect(() => { if (phase === "noCamera") setTypedOpen(true); }, [phase]);

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (parseStoreCode(typed) === "") { setTypedError("매장 코드를 입력해 주세요."); return; }
    setTypedError("");
    decide(typed);
  };

  const rescan = () => { setReadCode(""); setPhase("checking"); };
  /** 이 걸음을 지나면 홈이다 — 2걸음이 거기서 시작된다. */
  const goHome = () => setStep("start");

  /** 진행 표시 — 다섯 걸음의 첫째 (확정 시안 S01-B). 세 상태가 같은 자리를 쓴다. */
  const steps = { labels: FLOW_STEPS, current: 1 };

  /* ── S01-B 연결 완료 (확정 시안 PNG 2026-08-12) ── */
  if (phase === "connected") {
    return (
      <Screen
        onBack={rescan} backLabel="다시 스캔"
        steps={steps}
        label="매장 QR 연동 — 연결됨"
        /* 제목은 시안 150:391, 부제는 확정 시안 그대로다(«세션» 낱말 경위는 파일머리 주석).
           제목은 단일 텍스트 노드의 균일 22px Bold 라 강조 분할(`Emphasize`)을 쓰지 않는다(§3). */
        title="연결되었습니다"
        subtitle="매장 정보와 세션을 모두 확인했어요"
        actions={<>
          <Cta tone="primary" label="이 매장으로 계속하기" onClick={goHome} />
          <Cta label="다시 스캔하기" onClick={rescan} />
        </>}
      >
        {/* 확정 시안의 초록 확인 원 — 장식이다. 성공은 제목과 아래 카드 문장이 글자로 말한다. */}
        <div className="qr-done" aria-hidden="true"><span className="qr-donemark">✓</span></div>

        {/* 매장 카드 — 시안의 값(닭강정 가게·chicken-store)은 목업이 아니라 실제 fixture 값과
            우연히 같다. 화면은 늘 fixture 에서 읽는다(FIGMA_RULES §2). */}
        <div className="qr-store">
          <div className="qr-storehead">
            <span className="qr-storeicon" aria-hidden="true">🍗</span>
            <div>
              <p className="qr-storename">{storeName}</p>
              <p className="qr-storesub">매장과 연동되었어요</p>
            </div>
          </div>
          <hr className="qr-storediv" />
          <div className="qr-storerow">
            <span className="qr-storelabel">연동 환경 ID</span>
            {/* 대조에 성공한 걸음이므로 정본(fixture 의 environmentId)을 적는다 —
                읽은 원문(readCode)과 대소문자가 달라도 연동된 것은 이 환경이다 */}
            <code className="qr-code">{envId}</code>
          </div>
        </div>
      </Screen>
    );
  }

  /* ── 읽기는 됐지만 우리가 모르는 매장 ── */
  if (phase === "unknownStore") {
    return (
      <Screen
        onBack={rescan} backLabel="다시 스캔"
        steps={steps}
        label="매장 QR 연동 — 모르는 매장"
        title="이 매장 정보는 아직 없습니다"
        subtitle="매장 코드는 읽었습니다. 다만 이 기기에 담긴 매장과 다릅니다."
        actions={<>
          <Cta tone="primary" label="이대로 계속하기" onClick={goHome} />
          <Cta label="다시 스캔하기" onClick={rescan} />
        </>}
      >
        <div className="qr-view miss">
          <span className="qr-mark" aria-hidden="true">⌗</span>
        </div>
        <p className="banner warn" role="status">
          읽은 매장 코드는 <code className="qr-code">{readCode}</code> 입니다.
          {" "}이 기기에는 <b>{storeName}</b>(<code className="qr-code">{envId}</code>) 정보만 있습니다.
        </p>
        <p className="hint">
          {t(
            "그냥 진행하셔도 됩니다. 이 기기에 있는 매장으로 주문을 도와드립니다.",
            "QR이 가리키는 매장 정보를 가져올 방법이 없어 그 매장으로는 진행할 수 없습니다. 이대로 계속하시면 이 기기에 담긴 매장 정보로 주문을 도와드립니다.",
          )}
        </p>
      </Screen>
    );
  }

  /* ── S01-B 스캔 안내 (검사 중·스캔 중·카메라 불가) — 뒤로가기가 없다: 이 앞에는 화면이 없다 ── */
  return (
    <Screen
      steps={steps}
      label="매장 QR 연동"
      /* 제목·부제는 시안 150:355·150:356 그대로다. 제목은 단일 텍스트 노드의 균일 22px
         Bold 라 강조 분할을 쓰지 않는다(§3). 카메라를 못 쓸 때만 시안에 없는 상태이므로
         우리가 정한다 — 무엇이 막혔는지 제목에서 바로 말한다. */
      title={cameraWanted ? "매장 QR을 스캔해주세요" : "카메라로 QR을 읽을 수 없습니다"}
      subtitle={cameraWanted
        ? "키오스크에 표시된 QR을 비춰주시면 자동으로 연결돼요"
        : "카메라 대신 아래 방법으로 진행하실 수 있습니다."}
      actions={<>
        {/* 시안 150:360 — 두 흰 버튼 **위**의 가운데 정렬 캡션 */}
        <p className="qr-asks">QR을 스캔하기 어려우신가요?</p>

        {/* 시안 208:775 «직접 입력». Cta 는 aria-expanded 를 받지 않으므로(부품을 이
            화면 사정으로 넓히지 않는다) 여기만 네이티브 버튼을 쓴다 — 같은 `.btn ghost`
            라 모양은 시안의 흰 CTA 와 같다. */}
        <button type="button" className="btn ghost"
          aria-expanded={typedOpen} aria-controls="qr-typed"
          onClick={() => setTypedOpen((v) => !v)}>
          직접 입력
        </button>
        {/* 접을 때 지우지 않고 `hidden` 으로 둔다 — 위 aria-controls 가 가리키는 것이
            늘 있어야 하고, 폼 자체는 카메라가 막힌 사람에게 유일한 길이다. */}
        <form id="qr-typed" className="qr-fallback" hidden={!typedOpen} onSubmit={submitTyped}>
          {/* 카메라가 막힌 것이 확인된 순간에는 이 칸이 앞으로 가는 본길이다 — 그때만
              가리킨다. 카메라가 살아 있는데 사용자가 「직접 입력」을 펴 본 경우에는
              여전히 창을 가리킨다(가리키는 곳은 한 화면에 하나다). */}
          <label className={phase === "noCamera" ? "field kb-guide" : "field"}>
            {/* 안내를 라벨 안에 넣는다. 설명을 한 줄 더 두면 접힌 화면(390×844)에서
                정작 눌러야 할 «이 코드로 연결하기»가 밖으로 밀린다. */}
            <span className="qr-label">매장 코드 직접 입력 — 키오스크 화면 아래쪽에 있습니다</span>
            <input name="storeCode" value={typed} inputMode="text" autoComplete="off"
              placeholder="예: chicken-store"
              onChange={(e) => { setTyped(e.target.value); setTypedError(""); }} />
          </label>
          {typedError && <p className="qr-error" role="alert">{typedError}</p>}
          <div className="btnrow">
            {/* Cta 는 type="button" 이라 폼 제출을 못 한다. 여기만 네이티브 제출 버튼을 쓴다 —
                Enter 키로도 넘어갈 수 있어야 하기 때문이다(같은 .btn 클래스라 모양은 같다). */}
            <button type="submit" className="btn primary" disabled={!fixture}>이 코드로 연결하기</button>
          </div>
          {!fixture && <p className="hint">매장 정보를 불러오는 중입니다. 잠시만 기다려 주세요.</p>}
        </form>

        {/* 시안 208:777 «직원 요청» — 이 화면에서 직원 도움으로 가는 유일한 길이다 */}
        <Cta label="직원 요청" onClick={() => setStep("staff")} />
        {/* 시안에는 없다. 스캔이 아예 막힌 기기에서 앞으로 갈 마지막 길이라 지우지 않고,
            캡션이 대안을 소개하는 이 묶음의 맨 아래에 둔다. */}
        <Cta label="QR 없이 계속하기" onClick={goHome} />
      </>}
    >
      {/* 카메라를 못 쓸 때는 창을 그리지 않는다. 볼 것이 없는 200px 상자가 화면 절반을
          차지하면, 이때 실제로 써야 하는 입력칸이 아래로 밀려 접힌 화면 밖으로 나간다. */}
      {/* 「화면 안내」가 가리킬 곳은 **지금 해야 할 일**이다. 카메라가 살아 있으면 그 일은
          «QR을 창에 비추는 것»이라 창에 고리와 화살표를 둔다. 아래 바에 두면 안 되는
          이유가 이 화면에 있다 — 거기 담긴 주 버튼은 «직접 입력»을 폈을 때 나오는 폼의
          제출 버튼이라, 스캔하면 되는 사람에게는 아직 할 일이 아니다. */}
      {cameraWanted && (
        <div className="qr-view kb-guide">
          <video ref={videoRef} className="qr-cam" muted playsInline autoPlay aria-hidden="true" />
        </div>
      )}
      {/* 상태를 색이나 그림이 아니라 문장으로 말한다. 카메라 영상 위에는 아무것도 얹지 않는다. */}
      <p className={phase === "noCamera" ? "banner warn" : "qr-status"} role="status">
        {phase === "checking" ? "카메라를 준비하고 있습니다."
          : phase === "scanning" ? "카메라가 켜졌습니다. QR을 찾고 있습니다."
            : blocked}
      </p>
    </Screen>
  );
}
