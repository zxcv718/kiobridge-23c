import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFlow } from "../flow";
import { FLOW_STEPS } from "../model";
import { Card, Cta, Emphasize, Screen } from "../components";
import "./qr.css";

/**
 * 화면목록 S04a·S04b — 매장 QR 연동 (Figma 150:329 스캔 안내 · 150:365 연결 완료).
 *
 * **우리가 QR을 만드는 것이 아니다.** 폰 카메라로 매장에 붙은 QR을 읽는 화면이다.
 * 읽기만 하면 되므로 브라우저에 내장된 `BarcodeDetector` + `getUserMedia` 로 충분하고,
 * QR 라이브러리를 새로 들이지 않는다(키트 루트 package.json 은 플랫폼 파일이라 손대지 않는다).
 *
 * **읽은 다음 무엇을 하는가.** 서버가 없으므로 세션을 «발급»받을 수는 없다. 여기서 하는
 * 일은 하나다 — QR에 적힌 매장 코드를 우리가 가진 환경(`fixture.manifest.environmentId`)과
 * 대조하는 것. 같으면 어느 매장인지 밝히고 다음으로 보내고, 다르면 «이 매장 정보는 아직
 * 없습니다»라고 정직하게 말한다. 어느 쪽이든 막다른 길을 만들지 않는다.
 * 「세션이 발급되었습니다」 같은, 우리가 하지 않은 일을 한 것처럼 말하는 문구를 쓰지 않는다.
 * (디자인 150:365 의 부제가 «매장 정보와 세션을 모두 확인했어요»인데 그대로 쓰지 않는 이유다.)
 *
 * **이 화면의 핵심은 읽히는 경우가 아니라 읽히지 않는 경우다.** BarcodeDetector 는
 * Safari·Firefox 에 없고, 카메라 권한은 거부될 수 있고, 카메라가 없는 기기도 있다.
 * 세 경우 모두에서 ① 왜 안 되는지 한 문장으로 말하고 ② 직접 입력 ③ 직원 요청
 * ④ 건너뛰기가 같은 화면에 있어야 한다.
 *
 * 디자인은 «직접 입력»·«직원 요청»을 화면 아래 버튼 두 개로 두었지만, 직접 입력은 그
 * 자리에 입력칸으로 펼쳐 둔다. 카메라가 안 되는 사용자에게는 그쪽이 본길이고, 본길을
 * «한 번 더 눌러야 닿는 곳»에 두면 안 되기 때문이다. 아래 버튼 자리는 건너뛰기와
 * 직원 도움이 쓴다.
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

/**
 * QR 원문에서 매장 코드를 뽑는다.
 *
 * 매장 QR에 무엇이 들어 있을지는 매장이 정한다 — 코드만 있을 수도, 링크일 수도 있다.
 * 그래서 «링크면 매장을 가리키는 값을, 아니면 원문을» 쓰는 정도로만 해석한다.
 * 여기서 더 똑똑하게 굴면, 실패했을 때 사용자가 무엇을 잘못했는지 알 수 없게 된다.
 */
export function parseStoreCode(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    for (const k of ["environmentId", "env", "store", "storeId"]) {
      const v = u.searchParams.get(k);
      if (v?.trim()) return v.trim();
    }
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg.length > 0) return decodeURIComponent(seg[seg.length - 1]);
    return u.hostname;
  } catch { /* URL 이 아니면 원문을 그대로 본다 */ }
  return s;
}

export function QrConnect() {
  const { fixture, setStep, t } = useFlow();
  const envId = fixture?.manifest.environmentId ?? "";
  const storeName = fixture?.manifest.displayName ?? fixture?.manifest.name ?? "";

  const [phase, setPhase] = useState<Phase>("checking");
  /** 카메라를 못 쓰는 이유. 한 문장으로, 무엇 때문인지 알 수 있게. */
  const [blocked, setBlocked] = useState("");
  /** 읽어낸 매장 코드와 그것을 어떻게 얻었는지 — 결과 화면에서 근거로 보여준다. */
  const [readCode, setReadCode] = useState("");
  const [readVia, setReadVia] = useState("");
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  /* fixture 는 비동기로 도착한다. 카메라 루프는 한 번만 켜지므로 그때의 값을 붙잡고 있으면
     늦게 온 매장 정보를 못 본다 — ref 로 «지금 값»을 보게 한다. */
  const envRef = useRef(envId);
  envRef.current = envId;

  /** 읽은 값을 우리가 가진 매장과 대조한다. 카메라와 직접 입력이 같은 길을 지난다. */
  const decide = useCallback((raw: string, via: string) => {
    const code = parseStoreCode(raw);
    setReadCode(code);
    setReadVia(via);
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
          if (value) { decide(value, "카메라 스캔"); return; } // 국면이 바뀌면 정리 함수가 카메라를 끈다
        } catch { /* 프레임 하나가 실패한 것이므로 다음 차례에 다시 본다 */ }
        timer = window.setTimeout(() => { void tick(); }, SCAN_INTERVAL_MS);
      };
      void tick();
    })();

    return stop;
  }, [cameraWanted, decide]);

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (parseStoreCode(typed) === "") { setTypedError("매장 코드를 입력해 주세요."); return; }
    setTypedError("");
    decide(typed, "직접 입력");
  };

  const rescan = () => { setReadCode(""); setReadVia(""); setPhase("checking"); };
  const goNext = () => setStep("sessionStart");

  const steps = { labels: FLOW_STEPS, current: 4 };

  /* ── S04b 연결 완료 ── */
  if (phase === "connected") {
    return (
      <Screen
        onBack={rescan} backLabel="다시 스캔"
        steps={steps}
        label="매장 QR 연동 — 연결됨"
        title={<Emphasize text="연결되었습니다" word="연결" />}
        subtitle="QR에 적힌 매장이 이 기기에 있는 매장 정보와 같습니다."
        actions={<>
          <Cta tone="primary" label="이 매장으로 계속하기" onClick={goNext} />
          <Cta label="다시 스캔하기" onClick={rescan} />
        </>}
      >
        <div className="qr-view done">
          <span className="qr-mark" aria-hidden="true">✓</span>
        </div>
        {/* 성공을 테두리 색으로만 말하지 않는다 — 문장으로도 말한다 */}
        <p className="banner ok" role="status">
          <b>{storeName}</b> 매장으로 확인했습니다.
        </p>
        <Card rows={[
          { label: "매장", value: storeName },
          { label: "매장 코드", value: <code className="qr-code">{readCode}</code> },
          { label: "확인 방법", value: readVia },
        ]} />
        <p className="hint">
          여기서 한 일은 <b>매장을 맞춰 본 것</b>까지입니다. 주문은 다음 화면에서 이 기기 안에서 시작됩니다.
        </p>
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
        title={<Emphasize text="이 매장 정보는 아직 없습니다" word="아직" />}
        subtitle="QR은 읽었습니다. 다만 이 기기에 담긴 매장과 다릅니다."
        actions={<>
          <Cta tone="primary" label="이대로 계속하기" onClick={goNext} />
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

  /* ── S04a 스캔 안내 (검사 중·스캔 중·카메라 불가) ── */
  return (
    <Screen
      onBack={() => setStep("saveChoice")}
      steps={steps}
      label="매장 QR 연동"
      title={cameraWanted
        ? <Emphasize text="매장 QR을 비춰 주세요" word="QR" />
        : <Emphasize text="카메라로 QR을 읽을 수 없습니다" word="QR" />}
      subtitle={cameraWanted
        ? t(
          "키오스크 화면의 QR을 카메라에 비춰 주세요.",
          "키오스크에 표시된 QR을 카메라에 비춰 주시면 어느 매장인지 확인해 드립니다. 사진을 찍거나 어디로 보내지 않습니다.",
        )
        : "카메라 대신 아래 방법으로 진행하실 수 있습니다."}
      actions={<>
        <Cta label="QR 없이 계속하기" onClick={goNext} />
      </>}
    >
      {/* 카메라를 못 쓸 때는 창을 그리지 않는다. 볼 것이 없는 200px 상자가 화면 절반을
          차지하면, 이때 실제로 써야 하는 입력칸이 아래로 밀려 접힌 화면 밖으로 나간다. */}
      {cameraWanted && (
        <div className="qr-view">
          <video ref={videoRef} className="qr-cam" muted playsInline autoPlay aria-hidden="true" />
        </div>
      )}
      {/* 상태를 색이나 그림이 아니라 문장으로 말한다. 카메라 영상 위에는 아무것도 얹지 않는다. */}
      <p className={phase === "noCamera" ? "banner warn" : "qr-status"} role="status">
        {phase === "checking" ? "카메라를 준비하고 있습니다."
          : phase === "scanning" ? "카메라가 켜졌습니다. QR을 찾고 있습니다."
            : blocked}
      </p>

      <form className="qr-fallback" onSubmit={submitTyped}>
        <p className="qr-asks">QR을 스캔하기 어려우신가요?</p>
        <label className="field">
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
    </Screen>
  );
}
