/**
 * @kiobridge/uprlite-driver-contract
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  STATUS: PENDING_REAL_DEVICE — CONTRACT ONLY, NOT IMPLEMENTED.           │
 * │  이 패키지는 인터페이스와 데이터 형식만 정의합니다.                          │
 * │  실제 Windows 입력·클릭·키 입력·Agent 명령은 구현되어 있지 않으며,           │
 * │  이번 단계의 범위가 아닙니다.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 향후 실기기 연동 시 바뀌는 것은 이 드라이버와
 * `environments/<id>/bindings/uprlite.binding.json` 뿐입니다.
 * 공통 상태·Action·후보·옵션·안전규칙과 참가팀 실행계획은 그대로 사용됩니다.
 */
import type {
  DriverId,
  DriverStatus,
  PlanAction,
  UprliteBinding,
  UprliteControlBinding,
} from "@kiobridge/contracts";
import type {
  DriverContext,
  DriverExecutionResult,
  DriverState,
  KioskDriver,
  ResolvedTarget,
  VerificationResult,
} from "@kiobridge/kiosk-driver-contract";

/** Device-side data shapes. Populated only from a real device capture. */
export interface UprliteUiaNode {
  automationId?: string;
  name?: string;
  controlType?: string;
  boundingRectangle?: { x: number; y: number; width: number; height: number };
}

export interface UprliteOcrResult {
  region: { x: number; y: number; width: number; height: number };
  text: string;
  confidence?: number;
}

/** What a real driver would need to dispatch (NOT dispatched today). */
export interface UprliteAgentCommand {
  kind: "CLICK" | "TYPE" | "READ";
  automationId?: string;
  coordinate?: { x: number; y: number };
  text?: string;
}

export interface UprliteDriverConfig {
  binding: UprliteBinding;
  /** Must stay false in this repository. */
  allowActualDeviceCommands: false;
}

/**
 * Contract-only driver. Every method throws — implementing it requires a real
 * device, an approved Agent integration and a separate safety review.
 */
export class UprliteDriverContract implements KioskDriver {
  readonly driverId: DriverId = "UPRLITE";
  readonly status: DriverStatus = "PENDING_REAL_DEVICE";

  constructor(private readonly config: UprliteDriverConfig) {}

  /** Look up the device binding for a semantic target (data shape demo only). */
  bindingFor(state: string, targetId: string): UprliteControlBinding | undefined {
    return this.config.binding.screens?.[state]?.controls?.[targetId] ?? this.config.binding.controls?.[targetId];
  }

  private notImplemented(method: string): never {
    throw new Error(
      `[uprlite-driver] ${method}() is PENDING_REAL_DEVICE. ` +
        "실제 UPRLite/Windows Agent 연동은 이 저장소에서 구현되지 않습니다.",
    );
  }

  async initialize(_context: DriverContext): Promise<DriverState> { this.notImplemented("initialize"); }
  async resolveTarget(_a: PlanAction, _c: DriverContext, _s: DriverState): Promise<ResolvedTarget> { this.notImplemented("resolveTarget"); }
  async execute(_a: PlanAction, _s: DriverState, _c: DriverContext): Promise<DriverExecutionResult> { this.notImplemented("execute"); }
  async verify(_a: PlanAction, _s: DriverState, _c: DriverContext): Promise<VerificationResult> { this.notImplemented("verify"); }
  async stop(_r: string, _s: DriverState): Promise<DriverExecutionResult> { this.notImplemented("stop"); }
}

/** True when a binding still lacks real captured data. */
export function isBindingPending(binding: UprliteBinding): boolean {
  return binding.status !== "READY";
}
