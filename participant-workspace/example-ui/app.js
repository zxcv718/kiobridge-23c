/*
 * KioBridge 사용자 접점 참고 예제.
 *
 * 프레임워크 없이 동작합니다. 인터넷 연결도 필요 없습니다.
 * 참가팀은 이 파일을 자유롭게 교체하거나 처음부터 다시 만들 수 있습니다.
 *
 * 두 가지 모드
 *   LOCAL UI PREVIEW ONLY   — API 서버 없이 화면과 JSON 만 확인
 *   SIMULATION SERVER RESULT — 로컬 KioBridge 서버가 실제로 검증·실행한 결과
 *
 * 서버가 없을 때 가짜 PASS 를 만들지 않습니다. 두 결과는 화면에서 구분됩니다.
 */
(function () {
  "use strict";

  var API = "http://127.0.0.1:4000";
  var STORAGE_KEY = "kio.example.profile";
  var ENV_ID = "sandbox";

  /* Sandbox fixture 사본. 서버가 없어도 화면이 돌아가게 하기 위한 것이며,
     서버가 붙으면 실제 fixture 로 교체됩니다. */
  var FALLBACK_CANDIDATES = [
    { candidateId: "SANDBOX-001", name: "연습 항목 A", price: 1000, available: true, supportedOptions: { SIZE: ["SMALL", "LARGE"] } },
    { candidateId: "SANDBOX-002", name: "연습 항목 B", price: 2000, available: true, supportedOptions: { SIZE: ["SMALL", "LARGE"] } },
    { candidateId: "SANDBOX-003", name: "연습 항목 (품절)", price: 1500, available: false, supportedOptions: { SIZE: ["SMALL"] } },
    { candidateId: "SANDBOX-004", name: "연습 항목 D", price: 1400, available: true, supportedOptions: { SIZE: ["SMALL", "LARGE"] } },
    { candidateId: "SANDBOX-005", name: "연습 항목 E", price: 1600, available: true, supportedOptions: { SIZE: ["SMALL", "LARGE"] } },
    { candidateId: "SANDBOX-006", name: "연습 항목 F", price: 1800, available: true, supportedOptions: { SIZE: ["SMALL", "LARGE"] } }
  ];

  var state = {
    profile: { largeText: false, highContrast: false, simpleSteps: false, voice: false },
    saveProfile: false,
    qr: null,
    sizePreference: "SMALL",
    useContext: true,
    context: [],
    candidates: FALLBACK_CANDIDATES.slice(),
    recommendation: null,
    rejected: [],
    chosenCandidateId: null,
    userConfirmed: false,
    submission: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var live = function (msg) { $("live").textContent = msg; };
  var showError = function (msg) {
    var box = $("error");
    if (!msg) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false;
    box.textContent = msg;
  };

  function show(stepId) {
    ["step-start", "step-a11y", "step-env", "step-need", "step-rec", "step-confirm", "step-done"]
      .forEach(function (id) { $(id).hidden = id !== stepId; });
    var h = $(stepId).querySelector("h2");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
  }

  /* ── 접근성 토글 ─────────────────────────────────────────────── */

  function applyAppearance() {
    document.documentElement.setAttribute("data-large", state.profile.largeText ? "on" : "off");
    document.documentElement.setAttribute("data-contrast", state.profile.highContrast ? "on" : "off");
    $("btn-large").setAttribute("aria-pressed", state.profile.largeText ? "true" : "false");
    $("btn-contrast").setAttribute("aria-pressed", state.profile.highContrast ? "true" : "false");
    $("btn-speak").setAttribute("aria-pressed", state.profile.voice ? "true" : "false");
  }

  /* 음성은 있으면 더 좋은 보조수단입니다. 없어도 전체 흐름이 동작합니다. */
  function speak(text) {
    if (!state.profile.voice) return;
    if (!("speechSynthesis" in window)) return;
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* 음성이 안 되어도 화면은 그대로 쓸 수 있습니다 */ }
  }

  /* ── 기기 내 저장 (접근성 설정만) ──────────────────────────────── */

  function loadStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function storeProfile(p) {
    // 접근성 설정만 저장합니다. 이름·연락처 같은 실제 개인정보는 애초에 받지 않습니다.
    // 저장은 선택사항이며, 저장하지 않아도 전체 흐름을 쓸 수 있습니다.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        largeText: !!p.largeText, highContrast: !!p.highContrast,
        simpleSteps: !!p.simpleSteps, voice: !!p.voice,
        savedAt: new Date().toISOString()
      }));
      return true;
    } catch (e) { return false; }
  }
  function forgetProfile() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
  }

  /* ── 상황 정보 (Mock) ─────────────────────────────────────────── */

  function loadContext() {
    // 실제 서비스라면 날씨·혼잡도 API 를 부릅니다.
    // 여기서는 파일에서 읽되, 실패해도 화면이 멈추지 않습니다.
    return fetch("mock-context.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (doc) {
        var now = new Date();
        var hour = now.getUTCHours();
        var signals = (doc && doc.contextSignals) ? doc.contextSignals.slice() : [];
        signals.push({
          type: "TIME_OF_DAY",
          key: "hourBucket",
          value: hour < 11 ? "MORNING" : hour < 15 ? "LUNCH" : "EVENING",
          source: "DEVICE_CLOCK",
          observedAt: now.toISOString(),
          confidence: 1
        });
        state.context = signals;
        renderContext();
      });
  }

  function renderContext() {
    var box = $("context-cards");
    box.textContent = "";
    if (state.context.length === 0) {
      var p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "상황 정보를 불러오지 못했습니다. 추천은 그대로 진행됩니다.";
      box.appendChild(p);
      return;
    }
    state.context.forEach(function (s) {
      var d = document.createElement("div");
      d.className = "ctx";
      var k = document.createElement("span");
      k.className = "k";
      k.textContent = contextLabel(s);
      var src = document.createElement("span");
      src.className = "src";
      src.textContent = "출처 " + s.source;
      d.appendChild(k); d.appendChild(src);
      box.appendChild(d);
    });
  }

  function contextLabel(s) {
    var map = {
      RAIN: "비가 내리고 있습니다", CLEAR: "맑습니다", HOT: "많이 덥습니다",
      MORNING: "오전입니다", LUNCH: "점심시간입니다", EVENING: "저녁입니다",
      BUSY: "지금 붐빕니다", QUIET: "여유롭습니다"
    };
    return map[String(s.value)] || (s.type + ": " + s.value);
  }

  /* ── 추천 (설명 가능한 규칙) ───────────────────────────────────── */

  function buildRecommendation() {
    var excluded = [];
    var pool = state.candidates.filter(function (c) {
      if (!c.available) { excluded.push({ candidateId: c.candidateId, name: c.name, reasonCode: "AVAILABILITY", explanation: "지금 준비되지 않았습니다" }); return false; }
      if (state.rejected.indexOf(c.candidateId) !== -1) { excluded.push({ candidateId: c.candidateId, name: c.name, reasonCode: "USER_REJECTED", explanation: "방금 다른 것을 보여달라고 하셨습니다" }); return false; }
      if (state.sizePreference !== "NO_PREFERENCE") {
        var sizes = (c.supportedOptions && c.supportedOptions.SIZE) || [];
        if (sizes.indexOf(state.sizePreference) === -1) {
          excluded.push({ candidateId: c.candidateId, name: c.name, reasonCode: "USER_PREFERENCE", explanation: "고르신 크기를 지원하지 않습니다" });
          return false;
        }
      }
      return true;
    });

    if (pool.length === 0) {
      return { empty: true, excludedCandidates: excluded };
    }

    var reasons = [];
    var usedUser = [];
    var usedContext = [];

    // 점수는 낮을수록 먼저 보여줍니다. 설계는 참가팀의 몫이며 심사 대상입니다.
    var scored = pool.map(function (c) { return { c: c, score: 0, why: [] }; });

    if (state.sizePreference !== "NO_PREFERENCE") {
      usedUser.push(state.sizePreference === "LARGE" ? "크게 원하심" : "작게 원하심");
      reasons.push("고르신 크기(" + (state.sizePreference === "LARGE" ? "크게" : "작게") + ")를 지원하는 것만 남겼습니다.");
    }

    if (state.profile.simpleSteps || state.profile.largeText) {
      usedUser.push(state.profile.largeText ? "큰 글씨 사용" : "쉬운 단계 선호");
      scored.forEach(function (s) { s.score += s.c.price / 1000; });
      reasons.push("화면을 단순하게 쓰고 계셔서, 값이 단순한 쪽을 앞에 두었습니다.");
    }

    if (state.useContext && state.context.length > 0) {
      var lunch = state.context.some(function (s) { return s.value === "LUNCH"; });
      var busy = state.context.some(function (s) { return s.value === "BUSY"; });
      var rain = state.context.some(function (s) { return s.value === "RAIN"; });
      if (lunch || busy) {
        scored.forEach(function (s) { s.score += s.c.price / 2000; });
        usedContext.push(lunch ? "점심시간" : "붐비는 시간");
        reasons.push("지금은 " + (lunch ? "점심시간" : "붐비는 시간") + "이라 빠르게 받을 수 있는 쪽을 먼저 보여드립니다.");
      }
      if (rain) {
        usedContext.push("비");
        reasons.push("지금 비가 내려 자리에 오래 머무르지 않아도 되는 쪽을 앞에 두었습니다.");
      }
    }

    scored.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return a.c.candidateId.localeCompare(b.c.candidateId);
    });

    if (reasons.length === 0) {
      reasons.push("특별히 알려주신 조건이 없어, 준비된 것 중 먼저 안내드립니다.");
    }

    var top = scored[0].c;
    var alts = scored.slice(1, 4).map(function (s) { return s.c; });

    return {
      empty: false,
      candidateId: top.candidateId,
      candidateLabel: top.name,
      price: top.price,
      reasons: reasons,
      usedUserInfo: usedUser,
      contextSignalsUsed: state.useContext ? usedContext : [],
      alternatives: alts,
      excludedCandidates: excluded,
      // 남은 후보가 하나뿐이면 사용자에게 다시 물어보는 편이 안전합니다.
      requiresReconfirmation: pool.length === 1
    };
  }

  function renderRecommendation() {
    var rec = state.recommendation;
    if (!rec || rec.empty) {
      showError("보여드릴 수 있는 것이 없습니다. 조건을 다시 골라주세요.");
      show("step-need");
      return;
    }
    showError(null);

    $("rec-name").textContent = rec.candidateLabel;
    $("rec-price").textContent = rec.price ? rec.price.toLocaleString("ko-KR") + "원" : "";

    fillList($("rec-reasons"), rec.reasons);
    fillList($("rec-used-user"), rec.usedUserInfo.length ? rec.usedUserInfo : ["알려주신 조건이 없습니다"]);
    fillList($("rec-used-context"), rec.contextSignalsUsed.length ? rec.contextSignalsUsed : ["상황 정보를 쓰지 않았습니다"]);
    fillList($("rec-excluded"), rec.excludedCandidates.length
      ? rec.excludedCandidates.map(function (x) { return x.name + " — " + x.explanation; })
      : ["제외한 것이 없습니다"]);

    var box = $("rec-alts");
    box.textContent = "";
    if (rec.alternatives.length === 0) {
      var p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "다른 선택이 없습니다.";
      box.appendChild(p);
    }
    rec.alternatives.forEach(function (c) {
      var row = document.createElement("div");
      row.className = "alt";
      var name = document.createElement("span");
      name.textContent = c.name + (c.price ? " · " + c.price.toLocaleString("ko-KR") + "원" : "");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "이걸로 바꾸기";
      btn.setAttribute("aria-label", c.name + " 로 바꾸기");
      btn.setAttribute("data-choose", c.candidateId);
      btn.addEventListener("click", function () {
        state.chosenCandidateId = c.candidateId;
        state.recommendation.candidateId = c.candidateId;
        state.recommendation.candidateLabel = c.name;
        state.recommendation.price = c.price;
        state.recommendation.reasons = ["사용자가 직접 이 항목을 고르셨습니다."];
        state.recommendation.contextSignalsUsed = [];
        renderRecommendation();
        live(c.name + " 로 바꿨습니다.");
        speak(c.name + " 로 바꿨습니다.");
      });
      row.appendChild(name); row.appendChild(btn);
      box.appendChild(row);
    });

    show("step-rec");
    live("추천: " + rec.candidateLabel);
    speak(rec.candidateLabel + " 을 추천드립니다. " + rec.reasons[0]);
  }

  function fillList(ul, items) {
    ul.textContent = "";
    items.forEach(function (t) {
      var li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  /* ── Canonical 변환 ──────────────────────────────────────────── */

  function nowUtc() { return new Date().toISOString(); }

  function buildSubmission() {
    var rec = state.recommendation;
    var size = state.sizePreference;

    var supported = (state.candidates.filter(function (c) { return c.candidateId === rec.candidateId; })[0] || {}).supportedOptions || {};
    var chosenSize = size !== "NO_PREFERENCE" ? size : ((supported.SIZE || ["SMALL"])[0]);

    var contextSignals = state.useContext ? state.context.map(function (s) {
      return {
        type: s.type, key: s.key, value: s.value, source: s.source,
        observedAt: s.observedAt, expiresAt: s.expiresAt, confidence: s.confidence
      };
    }) : [];

    var sessionContext = {
      intent: { task: "PRACTICE" },
      facts: {},
      preferences: size !== "NO_PREFERENCE" ? { size: size } : { size: "NO_PREFERENCE" },
      hardConstraints: {},
      capabilities: {},
      fieldMetadata: {
        "/preferences/size": {
          source: "WEB_FORM", confidence: 1, confirmedByUser: true, capturedAt: nowUtc()
        }
      }
    };
    // 외부 맥락은 Core 를 건드리지 않고 팀 namespace 로만 들어갑니다.
    if (contextSignals.length > 0) {
      sessionContext.extensions = { "TEAM_EXAMPLE.contextSignals": contextSignals };
    }

    var actions = [
      // WELCOME 화면이 허용하는 target kind 는 review·staff 입니다 (fixture.screens 참고).
      { actionIndex: 0, action: "start", target: { kind: "review", id: "ITEM_SELECTION" }, expectedBeforeState: "WELCOME", expectedAfterState: "ITEM_SELECTION" },
      { actionIndex: 1, action: "select_item", target: { kind: "candidate", id: rec.candidateId }, expectedBeforeState: "ITEM_SELECTION", expectedAfterState: "OPTION_SELECTION" },
      { actionIndex: 2, action: "select_option", target: { kind: "option", groupId: "SIZE", id: chosenSize }, expectedBeforeState: "OPTION_SELECTION", expectedAfterState: "OPTION_SELECTION" },
      { actionIndex: 3, action: "open_review", target: { kind: "review", id: "REVIEW" }, expectedBeforeState: "OPTION_SELECTION", expectedAfterState: "REVIEW" },
      { actionIndex: 4, action: "verify_result", target: { kind: "review", id: "REVIEW" }, expectedBeforeState: "REVIEW", expectedAfterState: "REVIEW" }
    ];

    return {
      inputContractVersion: "1.0.0",
      submissionVersion: "1.0.0",
      teamId: "TEAM-EXAMPLE",
      environmentId: ENV_ID,
      profile: {
        profileId: "EXAMPLE-UI-ANON",
        dataClassification: "SYNTHETIC_PROFILE",
        source: { collectionChannel: "WEB_FORM", providerId: "TEAM-EXAMPLE", collectedAt: nowUtc() },
        accessibility: {
          largeText: state.profile.largeText,
          simpleSteps: state.profile.simpleSteps,
          visualGuidance: false,
          hearingSupport: false,
          mobilitySupport: false,
          highContrast: state.profile.highContrast,
          staffAssistancePreferred: false
        },
        interaction: {
          preferredInput: state.profile.voice ? "MULTIMODAL" : "TOUCH",
          language: "ko-KR",
          confirmationRequired: true
        },
        consent: { personalization: state.saveProfile, retentionPolicy: state.saveProfile ? "UNTIL_USER_DELETES" : "SESSION_ONLY" }
      },
      sessionContext: sessionContext,
      recommendation: {
        recommendedCandidateId: rec.candidateId,
        alternativeCandidateIds: rec.alternatives.map(function (c) { return c.candidateId; }),
        // 스키마가 요구하는 형태: 공식 코드 + 사람이 읽을 설명
        excludedCandidates: rec.excludedCandidates.map(function (x) {
          return { candidateId: x.candidateId, reasonCode: x.reasonCode, explanation: x.explanation };
        }),
        scoreBreakdown: {},
        recommendationReasons: rec.reasons,
        unmetConditions: [],
        confidence: 0.9,
        requiresReconfirmation: !!rec.requiresReconfirmation
      },
      userDecision: { approved: true, decision: "APPROVE", confirmedAt: nowUtc() },
      executionPlan: {
        planId: "EXAMPLE-UI-PLAN",
        validationMode: "SIMULATION_ONLY",
        executionEnvironment: "DIGITAL_TWIN",
        actualDeviceCommandSent: false,
        actions: actions
      }
    };
  }

  /* ── 서버 연결 ───────────────────────────────────────────────── */

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error("응답이 " + ms + "ms 안에 오지 않았습니다")); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); },
        function (e) { clearTimeout(t); reject(e); });
    });
  }

  function api(pathName, init) {
    return withTimeout(fetch(API + pathName, Object.assign({
      headers: { "content-type": "application/json" }
    }, init || {})), 4000).then(function (r) {
      return r.text().then(function (text) {
        var body = text ? JSON.parse(text) : undefined;
        if (!r.ok) throw new Error((body && body.error) || ("HTTP " + r.status));
        return body;
      });
    });
  }

  function tryLoadFixture() {
    return api("/api/v1/environments/" + ENV_ID + "/fixture")
      .then(function (fx) {
        if (fx && Array.isArray(fx.candidates) && fx.candidates.length > 0) {
          state.candidates = fx.candidates;
        }
      })
      .catch(function () { /* 서버가 없으면 사본으로 진행합니다 */ });
  }

  function banner(kind, label, detail) {
    var box = $("result-banner");
    box.className = "banner " + kind;
    box.textContent = "";
    var l = document.createElement("span");
    l.className = "label";
    l.textContent = label;
    var d = document.createElement("span");
    d.textContent = detail;
    box.appendChild(l); box.appendChild(d);
  }

  function sendToServer() {
    var btn = $("send-server");
    btn.disabled = true;
    banner("preview", "보내는 중…", "KioBridge 서버에 연결하고 있습니다.");

    var sessionId;
    api("/api/v1/sessions", { method: "POST", body: JSON.stringify({ environmentId: ENV_ID }) })
      .then(function (s) {
        sessionId = s.sessionId;
        return api("/api/v1/sessions/" + sessionId + "/submission", { method: "POST", body: JSON.stringify(state.submission) });
      })
      .then(function () {
        return api("/api/v1/sessions/" + sessionId + "/validate", { method: "POST", body: "{}" });
      })
      .then(function (v) {
        if (!v.valid) {
          banner("error", "검증 실패", v.errors.length + "건. 아래 내용을 확인하세요.");
          $("server-result").hidden = false;
          $("preview-evidence").textContent = JSON.stringify(v.errors, null, 2);
          live("서버 검증에 실패했습니다.");
          return null;
        }
        return api("/api/v1/sessions/" + sessionId + "/execute", { method: "POST", body: "{}" })
          .then(function () { return api("/api/v1/sessions/" + sessionId + "/evidence"); });
      })
      .then(function (evidence) {
        if (!evidence) return;
        banner("server", "SIMULATION SERVER RESULT",
          "서버가 실제로 검증하고 실행했습니다 — " + evidence.result + " (" + evidence.stopType + ")");
        $("server-result").hidden = false;
        $("preview-evidence").textContent = JSON.stringify(evidence, null, 2);
        live("서버 결과: " + evidence.result);
        speak("서버 검증 결과는 " + evidence.result + " 입니다.");
      })
      .catch(function (err) {
        // 서버가 없다고 해서 통과한 것처럼 보이게 만들지 않습니다.
        banner("error", "서버에 연결하지 못했습니다",
          err.message + " — npm run dev 로 서버를 켠 뒤 다시 눌러주세요. 아래는 화면 미리보기입니다.");
        live("서버에 연결하지 못했습니다.");
      })
      .then(function () { btn.disabled = false; });
  }

  /* ── 화면 흐름 ──────────────────────────────────────────────── */

  function goDone() {
    state.submission = buildSubmission();
    $("preview-submission").textContent = JSON.stringify(state.submission, null, 2);
    $("preview-plan").textContent = JSON.stringify(state.submission.executionPlan, null, 2);
    banner("preview", "LOCAL UI PREVIEW ONLY",
      "아직 서버에 보내지 않았습니다. 아래는 이 화면이 만든 JSON 입니다.");
    $("server-result").hidden = true;
    show("step-done");
    live("제출물을 만들었습니다.");
  }

  function reset() {
    state.rejected = [];
    state.chosenCandidateId = null;
    state.userConfirmed = false;
    state.submission = null;
    state.recommendation = null;
    $("server-result").hidden = true;
    showError(null);
  }

  /* ── 이벤트 ─────────────────────────────────────────────────── */

  document.addEventListener("DOMContentLoaded", function () {
    var stored = loadStored();
    if (stored) {
      $("start-saved").hidden = false;
      $("saved-none").hidden = true;
      $("saved-summary").textContent = describeProfile(stored);
      $("a11y-forget").hidden = false;
    }

    $("btn-large").addEventListener("click", function () {
      state.profile.largeText = !state.profile.largeText; $("p-large").checked = state.profile.largeText; applyAppearance();
    });
    $("btn-contrast").addEventListener("click", function () {
      state.profile.highContrast = !state.profile.highContrast; $("p-contrast").checked = state.profile.highContrast; applyAppearance();
    });
    $("btn-speak").addEventListener("click", function () {
      state.profile.voice = !state.profile.voice; $("p-voice").checked = state.profile.voice; applyAppearance();
      if (state.profile.voice) speak("음성 안내를 켰습니다.");
    });

    $("start-anon").addEventListener("click", function () {
      state.saveProfile = false;
      show("step-a11y");
      live("설정 화면입니다.");
    });

    $("start-saved").addEventListener("click", function () {
      var s = loadStored();
      if (s) {
        state.profile.largeText = !!s.largeText;
        state.profile.highContrast = !!s.highContrast;
        state.profile.simpleSteps = !!s.simpleSteps;
        state.profile.voice = !!s.voice;
        $("p-large").checked = state.profile.largeText;
        $("p-contrast").checked = state.profile.highContrast;
        $("p-simple").checked = state.profile.simpleSteps;
        $("p-voice").checked = state.profile.voice;
        $("save-yes").checked = true;
        state.saveProfile = true;
        applyAppearance();
      }
      // 자동으로 불러온 값도 사용자가 확인하도록 설정 화면을 보여줍니다.
      show("step-a11y");
      live("이 기기에 저장된 접근성 설정을 불러왔습니다. 맞는지 확인해 주세요.");
    });

    ["p-large", "p-contrast", "p-simple", "p-voice"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        state.profile.largeText = $("p-large").checked;
        state.profile.highContrast = $("p-contrast").checked;
        state.profile.simpleSteps = $("p-simple").checked;
        state.profile.voice = $("p-voice").checked;
        applyAppearance();
      });
    });

    $("a11y-forget").addEventListener("click", function () {
      forgetProfile();
      $("start-saved").hidden = true;
      $("saved-none").hidden = false;
      $("a11y-forget").hidden = true;
      live("이 기기에 저장한 접근성 설정을 지웠습니다.");
      speak("이 기기에 저장한 접근성 설정을 지웠습니다.");
    });

    $("a11y-next").addEventListener("click", function () {
      state.saveProfile = $("save-yes").checked;
      if (state.saveProfile) {
        storeProfile(state.profile);
        $("a11y-forget").hidden = false;
        live("이 기기에 접근성 설정을 저장했습니다. 언제든 지울 수 있습니다.");
      } else {
        forgetProfile();
        $("a11y-forget").hidden = true;
      }
      show("step-env");
    });

    $("qr-mock").addEventListener("click", function () {
      // QR 에는 환경 정보만 담습니다. 개인정보를 넣지 않습니다.
      state.qr = { environmentId: ENV_ID, fixtureVersion: "1.0.0", sessionNonce: "DEMO-ONLY" };
      var el = $("qr-payload");
      el.hidden = false;
      el.textContent = JSON.stringify(state.qr, null, 2);
      tryLoadFixture().then(loadContext).then(function () { show("step-need"); });
      live("연습용 키오스크에 연결했습니다.");
    });

    $("need-back").addEventListener("click", function () { show("step-env"); });

    $("need-next").addEventListener("click", function () {
      var picked = document.querySelector('input[name="size"]:checked');
      state.sizePreference = picked ? picked.value : "NO_PREFERENCE";
      state.useContext = $("use-context").checked;
      state.recommendation = buildRecommendation();
      renderRecommendation();
    });

    $("rec-reject").addEventListener("click", function () {
      if (state.recommendation && state.recommendation.candidateId) {
        state.rejected.push(state.recommendation.candidateId);
      }
      state.recommendation = buildRecommendation();
      renderRecommendation();
      live("다른 것을 보여드립니다.");
    });

    $("rec-restart").addEventListener("click", function () {
      reset();
      show("step-need");
      live("조건을 다시 고르세요.");
    });

    $("rec-staff").addEventListener("click", function () {
      showError("직원 도움을 요청했습니다. 실제 서비스라면 이 시점에 직원 호출로 이어집니다.");
      live("직원 도움을 요청했습니다.");
      speak("직원 도움을 요청했습니다.");
    });

    $("rec-accept").addEventListener("click", function () {
      var rec = state.recommendation;
      var dl = $("confirm-summary");
      dl.textContent = "";
      [["고른 것", rec.candidateLabel],
       ["크기", state.sizePreference === "LARGE" ? "크게" : state.sizePreference === "SMALL" ? "작게" : "상관없음"],
       ["금액", rec.price ? rec.price.toLocaleString("ko-KR") + "원" : "-"],
       ["안내", "결제는 하지 않습니다 (연습용)"]].forEach(function (pair) {
        var dt = document.createElement("dt"); dt.textContent = pair[0];
        var dd = document.createElement("dd"); dd.textContent = pair[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      show("step-confirm");
      live("마지막으로 확인해 주세요.");
      speak("이대로 진행할까요?");
    });

    $("confirm-back").addEventListener("click", function () { show("step-rec"); });

    $("confirm-yes").addEventListener("click", function () {
      // 실행계획은 사용자가 확인한 뒤에만 만듭니다.
      state.userConfirmed = true;
      goDone();
    });

    $("send-server").addEventListener("click", sendToServer);

    $("download-json").addEventListener("click", function () {
      if (!state.submission) return;
      var blob = new Blob([JSON.stringify(state.submission, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "participant-submission.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      live("JSON 파일을 내려받았습니다.");
    });

    $("start-over").addEventListener("click", function () {
      reset();
      show("step-start");
      live("처음으로 돌아왔습니다.");
    });

    applyAppearance();
  });

  function describeProfile(p) {
    var on = [];
    if (p.largeText) on.push("큰 글씨");
    if (p.highContrast) on.push("고대비");
    if (p.simpleSteps) on.push("쉬운 단계");
    if (p.voice) on.push("음성 안내");
    return on.length ? on.join(" · ") : "기본 설정";
  }
})();
