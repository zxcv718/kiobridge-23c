import React from "react";
import type { DataClassification, SafetyCheckResult } from "./types";

export function DataBadge({ value }: { value: DataClassification | string }) {
  const map: Record<string, { cls: string; label: string }> = {
    ACTUAL_EXTRACTED: { cls: "actual", label: "ACTUAL_EXTRACTED" },
    SYNTHETIC_MOCK: { cls: "sim", label: "SYNTHETIC_MOCK" },
    SYNTHETIC_PROFILE: { cls: "sim", label: "SYNTHETIC_PROFILE" },
    PENDING_REAL_DEVICE: { cls: "pending", label: "PENDING_REAL_DEVICE" },
  };
  const m = map[value] ?? { cls: "sim", label: String(value) };
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" style={{ background: "currentColor" }} aria-hidden /> {m.label}
    </span>
  );
}

export function OutcomeBadge({ outcome }: { outcome: SafetyCheckResult["outcome"] | "PASS" | "FAIL" }) {
  const cls = outcome === "PASS" ? "pass" : outcome === "FAIL" ? "stop" : outcome.toLowerCase();
  return (
    <span className={`badge ${cls}`}>
      <span className="dot" style={{ background: "currentColor" }} aria-hidden /> {outcome}
    </span>
  );
}

export function SimBadge() {
  return (
    <div className="sim-badge">
      <div className="box">
        SIMULATION ONLY
        <br />
        actualDeviceCommandSent: false
      </div>
    </div>
  );
}

export function NoDeviceBadge() {
  return (
    <div className="no-device">
      SIMULATED UI · NO ACTUAL DEVICE CONNECTION · actualDeviceCommandSent: false
    </div>
  );
}

export function SubmissionBadge() {
  return <span className="badge pending">PARTICIPANT SUBMISSION · 읽기 전용</span>;
}
