"use client";

// =============================================================
//  키링 시리얼 모니터: Web Serial 연결 + 데이터 줄 해석
//
//  펌웨어가 0.1초마다 보내는 줄 (firmware/pariy_keyring printTelemetry)
//    @{"ax":0.02,"ay":-0.01,"az":1.00,"g":1.00,"hall":0,"state":"NORMAL","cd":0,"falls":2,...}
//  '@' 로 시작하면 데이터, 아니면 사람이 읽는 로그 (">>> 낙상 경고 시작" 등)
//
//  Web Serial 은 PC 크롬 · 엣지에서만 되고, https 또는 localhost 에서만 열림
// =============================================================

export type KeyringState = "NORMAL" | "FALLING" | "CHECK" | "ALERT" | "EMERGENCY";

export type Telemetry = {
  ax: number;
  ay: number;
  az: number;
  g: number; // √(x²+y²+z²), 가만히 있으면 ≈ 1
  hall: boolean; // 자석(친구 키링)이 닿아 있음
  state: KeyringState;
  cd: number; // ALERT 일 때 취소까지 남은 초
  falls: number; // 켜진 뒤 낙상 경고 횟수
  steps: number;
  friends: number;
  mpu: boolean; // 가속도 센서 연결됨
  impact: number; // 지금 충격 기준 g
};

const STATES: KeyringState[] = ["NORMAL", "FALLING", "CHECK", "ALERT", "EMERGENCY"];
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** 한 줄 -> 데이터 (데이터 줄이 아니거나 깨졌으면 null) */
export function parseTelemetry(line: string): Telemetry | null {
  const t = line.trim();
  if (!t.startsWith("@{")) return null;
  try {
    const o = JSON.parse(t.slice(1)) as Record<string, unknown>;
    const state = STATES.includes(o.state as KeyringState) ? (o.state as KeyringState) : "NORMAL";
    return {
      ax: num(o.ax),
      ay: num(o.ay),
      az: num(o.az),
      g: num(o.g, 1),
      hall: o.hall === 1 || o.hall === true,
      state,
      cd: num(o.cd),
      falls: num(o.falls),
      steps: num(o.steps),
      friends: num(o.friends),
      mpu: o.mpu !== 0 && o.mpu !== false,
      impact: num(o.impact, 2),
    };
  } catch {
    return null; // 연결 직후 앞부분이 잘린 줄 등
  }
}

// ---- Web Serial (타입스크립트 기본 타입에 아직 없어서 필요한 만큼만 선언) ----
type SerialPortLike = {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  addEventListener(type: "disconnect", fn: () => void): void;
};
type SerialLike = { requestPort(): Promise<SerialPortLike> };

export const serialSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

/** 연결 에러 -> 한국어 */
export function serialErrorMessage(e: unknown) {
  const name = (e as { name?: string })?.name ?? "";
  const msg = String((e as { message?: string })?.message ?? e);
  if (name === "NotFoundError" || /No port selected/i.test(msg)) return "포트를 고르지 않았어요. 다시 눌러서 키링 포트를 골라 주세요.";
  if (name === "NetworkError" || name === "InvalidStateError" || /Failed to open/i.test(msg))
    return "포트를 열 수 없어요. Arduino IDE 시리얼 모니터나 다른 탭이 이 포트를 쓰고 있으면 닫아 주세요.";
  if (name === "SecurityError") return "이 주소에서는 시리얼 연결이 막혀 있어요. https 또는 localhost 에서 열어 주세요.";
  return msg;
}

export type SerialConnection = { close(): Promise<void> };

/**
 * 포트를 고르게 하고(브라우저 창) 줄 단위로 읽기 시작
 * onLine 은 한 줄마다, onClose 는 USB 를 뽑거나 끊겼을 때
 */
export async function connectSerial(onLine: (line: string) => void, onClose: (reason?: string) => void, baudRate = 115200): Promise<SerialConnection> {
  const serial = (navigator as unknown as { serial: SerialLike }).serial;
  const port = await serial.requestPort();
  await port.open({ baudRate });

  let stopped = false;
  // 바이트 -> 글자(UTF-8, 한글 로그 포함). pipeTo 가 끝나야 포트를 닫을 수 있어서 promise 를 들고 있음
  const decoder = new TextDecoderStream();
  const piped = port.readable!.pipeTo(decoder.writable as unknown as WritableStream<Uint8Array>).catch(() => {});
  const reader = decoder.readable.getReader();
  port.addEventListener("disconnect", () => {
    if (!stopped) onClose("키링 USB 연결이 끊겼어요");
  });

  (async () => {
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? ""; // 아직 안 끝난 줄은 다음에
        for (const l of lines) if (l.trim()) onLine(l);
        if (buf.length > 4000) buf = ""; // 줄바꿈이 안 오는 이상한 데이터 방어
      }
    } catch (e) {
      if (!stopped) onClose(serialErrorMessage(e));
    } finally {
      reader.releaseLock();
    }
  })();

  return {
    async close() {
      stopped = true;
      try {
        await reader.cancel();
      } catch {
        /* 이미 끊김 */
      }
      await piped; // 읽기 스트림이 다 닫힌 뒤에 포트를 닫아야 "포트 사용 중" 에러가 안 남
      try {
        await port.close();
      } catch {
        /* 이미 닫힘 */
      }
      onClose();
    },
  };
}
