import React from "react";
import { NoDeviceBadge } from "./ui";
import type { Candidate, OptionGroup, PublicFixture, SemanticTarget, SimulationUiState } from "./types";

/**
 * Virtual kiosk renderer. It draws ONLY from the server's UI state and the
 * environment's simulation binding (layout templates) — never from coordinates
 * and never by re-running the state machine in the browser.
 */

const sameTarget = (a?: SemanticTarget, b?: SemanticTarget) =>
  !!a && !!b && a.kind === b.kind && a.id === b.id && (a.groupId ?? "") === (b.groupId ?? "");

export function Kiosk({ fixture, ui, stopped, stopReason }: {
  fixture: PublicFixture; ui: SimulationUiState; stopped: boolean; stopReason?: string;
}) {
  const screen = fixture.screens.find((s) => s.state === ui.currentState);
  const binding = fixture.simulationBinding.screens[ui.currentState];
  const template = binding?.template ?? "LANDING";
  const progress = stopped ? 1 : screen?.progress ?? 0;

  const largeText = ui.accessibilityMode.largeText;

  return (
    <div className="kiosk-frame">
      <div className={`kiosk-screen ${largeText ? "kiosk-large" : ""}`} role="region" aria-label={`가상 키오스크: ${screen?.title ?? ui.currentState}`}>
        <div className="kiosk-title">
          {stopped ? "안전경계에서 시뮬레이션을 종료했습니다" : screen?.title ?? ui.currentState}
          <div className="kiosk-sub">{stopped ? stopReason : screen?.hint}</div>
        </div>
        <div className="kiosk-progress"><div style={{ width: `${progress * 100}%` }} /></div>
        <div className="kiosk-body">
          {/* On STOP we keep the last screen visible (e.g. the cart review) and
              add a banner — the user must still be able to see what was reviewed. */}
          {stopped && <StopPanel reason={stopReason} />}
          <Template template={template} fixture={fixture} ui={ui} groups={binding?.groups} />
        </div>
        <div className="kiosk-foot" aria-live="polite">
          현재 상태: <span className="mono">{ui.currentState}</span>
          {ui.selectedCandidate && <> · 선택: <strong>{ui.selectedCandidate.name}</strong></>}
        </div>
      </div>
      <NoDeviceBadge />
    </div>
  );
}

function StopPanel({ reason }: { reason?: string }) {
  return (
    <div className="kiosk-stop-banner" role="status">
      <span className="kiosk-stop-badge">STOP</span>
      <span>결제 · 실제 접수 · 실제 신청은 수행되지 않았습니다.</span>
      {reason && <span className="mono">{reason}</span>}
    </div>
  );
}

function Template({ template, fixture, ui, groups }: {
  template: string; fixture: PublicFixture; ui: SimulationUiState; groups?: string[];
}) {
  switch (template) {
    case "TWO_COLUMN_SELECTION": return <TwoColumn fixture={fixture} ui={ui} groups={groups} />;
    case "FOUR_CARD_GRID": return <CardGrid fixture={fixture} ui={ui} />;
    case "OPTION_GROUP_LIST": return <OptionList fixture={fixture} ui={ui} groups={groups} />;
    case "ORDER_REVIEW": return <OrderReview ui={ui} />;
    case "HOSPITAL_REVIEW": return <KeyValueReview title="접수 내용" data={ui.hospitalReview} />;
    case "PUBLIC_SERVICE_REVIEW": return <KeyValueReview title="신청 안내 내용" data={ui.publicOfficeReview} />;
    case "BASIC_SANDBOX_REVIEW": return <KeyValueReview title="연습 결과" data={ui.sandboxReview} />;
    default: return <Landing ui={ui} />;
  }
}

function Landing({ ui }: { ui: SimulationUiState }) {
  return (
    <div className="kiosk-landing">
      <p>화면 안내를 확인하고 진행합니다.</p>
      {ui.selectedCandidate && <p className="muted">선택됨: {ui.selectedCandidate.name}</p>}
    </div>
  );
}

function groupsFor(fixture: PublicFixture, ids?: string[]): OptionGroup[] {
  if (!ids) return fixture.optionGroups;
  return ids.map((g) => fixture.optionGroups.find((x) => x.groupId === g)).filter(Boolean) as OptionGroup[];
}

function TwoColumn({ fixture, ui, groups }: { fixture: PublicFixture; ui: SimulationUiState; groups?: string[] }) {
  const list = groupsFor(fixture, groups);
  return (
    <div className="kiosk-two-col">
      {list.flatMap((g) =>
        g.options.map((o) => {
          const selected = ui.selectedOptions[g.groupId] === o.id;
          const pressed = sameTarget(ui.pressedTarget, { kind: g.kind ?? "option", id: o.id, groupId: g.groupId })
            || sameTarget(ui.pressedTarget, { kind: "option", id: o.id, groupId: g.groupId });
          const hi = sameTarget(ui.highlightedTarget, { kind: g.kind ?? "option", id: o.id, groupId: g.groupId });
          return (
            <div key={`${g.groupId}:${o.id}`} className={`kiosk-big-btn ${selected ? "selected" : ""} ${pressed ? "pressed" : ""} ${hi ? "highlighted" : ""}`}>
              {o.label}
              {selected && <span className="check">✓</span>}
            </div>
          );
        }),
      )}
    </div>
  );
}

/**
 * A real kiosk shows a page of cards, not a scrolling list. The driver decides
 * which page the run is on; the operator may look at other pages, but browsing
 * is READ-ONLY — it never changes execution state.
 */
function CardGrid({ fixture, ui }: { fixture: PublicFixture; ui: SimulationUiState }) {
  const pageSize = ui.pageSize > 0 ? ui.pageSize : 4;
  const pageCount = Math.max(1, Math.ceil(fixture.candidates.length / pageSize));
  const runPage = Math.min(Math.max(ui.currentPage ?? 0, 0), pageCount - 1);

  // Viewing offset chosen by the operator. Reset whenever the run turns a page,
  // so the screen always follows the simulation by default.
  const [viewPage, setViewPage] = React.useState(runPage);
  React.useEffect(() => { setViewPage(runPage); }, [runPage]);
  const page = Math.min(Math.max(viewPage, 0), pageCount - 1);

  const start = page * pageSize;
  const visible = fixture.candidates.slice(start, start + pageSize);
  const emptySlots = Math.max(0, pageSize - visible.length);
  const following = page === runPage;

  return (
    <div className="kiosk-page">
      <div className="kiosk-grid" role="group" aria-label={`후보 ${page + 1}/${pageCount} 페이지`}>
        {visible.map((c: Candidate, slot: number) => {
          const selected = ui.selectedCandidate?.id === c.candidateId;
          const pressed = sameTarget(ui.pressedTarget, { kind: "candidate", id: c.candidateId });
          const hi = sameTarget(ui.highlightedTarget, { kind: "candidate", id: c.candidateId });
          return (
            <div
              key={c.candidateId}
              className={`kiosk-card ${selected ? "selected" : ""} ${pressed ? "pressed" : ""} ${hi ? "highlighted" : ""} ${!c.available ? "soldout" : ""}`}
              aria-label={`${c.name}${!c.available ? " (품절)" : ""}${selected ? " 선택됨" : ""}`}
              aria-disabled={!c.available}
              data-testid="candidate-card"
              data-candidate-id={c.candidateId}
              data-page-index={page}
              data-slot-index={slot}
              data-selected={selected ? "true" : "false"}
              data-highlighted={hi ? "true" : "false"}
              data-pressed={pressed ? "true" : "false"}
            >
              <div className="name">{c.name}</div>
              {typeof c.price === "number" && <div className="price">{c.price.toLocaleString()}원</div>}
              {!c.available && <div className="soldout-tag">품절</div>}
              {selected && <div className="check">✓ 선택됨</div>}
            </div>
          );
        })}
        {Array.from({ length: emptySlots }, (_, i) => (
          <div key={`empty-${i}`} className="kiosk-card empty" aria-hidden />
        ))}
      </div>

      <div className="kiosk-pager">
        <button
          type="button" className="pager-btn" data-testid="candidate-page-prev"
          onClick={() => setViewPage((p) => Math.max(0, p - 1))}
          disabled={page === 0} aria-label="이전 페이지"
        >← 이전</button>
        <span className="pager-status" data-testid="candidate-page-indicator" aria-live="polite">
          {page + 1} / {pageCount} 페이지
        </span>
        <button
          type="button" className="pager-btn" data-testid="candidate-page-next"
          onClick={() => setViewPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={page >= pageCount - 1} aria-label="다음 페이지"
        >다음 →</button>
        {!following && (
          <span className="pager-note" data-testid="kiosk-page-viewonly">
            보기 전용 — 실행은 {runPage + 1}페이지에서 진행 중입니다
          </span>
        )}
      </div>
    </div>
  );
}

function OptionList({ fixture, ui, groups }: { fixture: PublicFixture; ui: SimulationUiState; groups?: string[] }) {
  return (
    <div className="kiosk-options">
      {groupsFor(fixture, groups).map((g) => (
        <div key={g.groupId} className="opt-group">
          <div className="opt-label">{g.label}{g.required && <span className="req"> *</span>}</div>
          <div className="opt-row">
            {g.options.map((o) => {
              const selected = ui.selectedOptions[g.groupId] === o.id;
              const pressed = sameTarget(ui.pressedTarget, { kind: "option", id: o.id, groupId: g.groupId });
              const hi = sameTarget(ui.highlightedTarget, { kind: "option", id: o.id, groupId: g.groupId });
              return (
                <div key={o.id} className={`opt-chip ${selected ? "selected" : ""} ${pressed ? "pressed" : ""} ${hi ? "highlighted" : ""}`}>
                  {o.label}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderReview({ ui }: { ui: SimulationUiState }) {
  const total = ui.cartItems.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);
  return (
    <div className="kiosk-review">
      <div className="review-title">장바구니 🔒 읽기 전용</div>
      {ui.serviceType && <div className="review-line"><span>이용 방식</span><strong>{ui.serviceType}</strong></div>}
      {ui.cartItems.length === 0 && <p className="muted">담긴 항목이 없습니다.</p>}
      {ui.cartItems.map((it) => (
        <div key={it.candidateId} className="review-item">
          <div className="review-line"><span>{it.name}</span><strong>{((it.price ?? 0) * it.quantity).toLocaleString()}원</strong></div>
          <div className="review-opts">
            {Object.entries(it.options).map(([k, v]) => <span key={k} className="opt-chip small">{v}</span>)}
            <span className="opt-chip small">수량 {it.quantity}</span>
          </div>
        </div>
      ))}
      <div className="review-total"><span>합계</span><strong>{total.toLocaleString()}원</strong></div>
      <p className="review-note">결제는 진행되지 않습니다.</p>
    </div>
  );
}

function KeyValueReview({ title, data }: { title: string; data?: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {});
  return (
    <div className="kiosk-review">
      <div className="review-title">{title} 🔒 읽기 전용</div>
      {entries.length === 0 && <p className="muted">확인할 내용이 아직 없습니다.</p>}
      {entries.map(([k, v]) => (
        <div key={k} className="review-line"><span>{k}</span><strong>{typeof v === "object" ? JSON.stringify(v) : String(v)}</strong></div>
      ))}
    </div>
  );
}
