"use client";

// =============================================================
//  키링 시리얼 모니터: Web Serial 연결 + 데이터 줄 해석
//
//  펌웨어가 0.1초마다 보내는 줄 (firmware/pariy_keyring printTelemetry)
//    @{"ax":0.02,"ay":-0.01,"az":1.00,"g":1.00,"hall":0,"state":"NORMAL","cd":0,"falls":2,...}
//  '@' 로 시작하면 데이터, 아니면 사람이 읽는 로그 (">>> 낙상 경고 시작" 등)
//
//  팀원 펌웨어 형식도 읽음 (상태 값 없이 숫자만 있는 한 줄)
//    가속도(g) x=-0.93 y=0.28 z=0.25 합=1.00 | 홀센서=1 | 걷기=42 뛰기=16 낙상=0
//    -> 낙상 숫자가 올라가면 화면이 10초 동안 '낙상 감지 중'을 띄움 (monitor/page.tsx)
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
  steps: number; // 걸음 (팀원 형식: 걷기)
  runs: number | null; // 뛰기 (팀원 형식에만 있음)
  friends: number | null; // 친구 맞대기 (팀원 형식에는 없음)
  mpu: boolean; // 가속도 센서 연결됨
  impact: number; // 지금 충격 기준 g
  source: "json" | "text"; // json = Pairy 펌웨어(@{...}), text = 팀원 펌웨어(숫자만)
};

const STATES: KeyringState[] = ["NORMAL", "FALLING", "CHECK", "ALERT", "EMERGENCY"];
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** 팀원 펌웨어 한 줄: "가속도(g) x=.. y=.. z=.. 합=.. | 홀센서=1 | 걷기=42 뛰기=16 낙상=0" */
function parseTextLine(t: string): Telemetry | null {
  const f = (re: RegExp) => {
    const m = t.match(re);
    return m ? Number(m[1]) : null;
  };
  const ax = f(/\bx\s*=\s*(-?\d+(?:\.\d+)?)/i);
  const ay = f(/\by\s*=\s*(-?\d+(?:\.\d+)?)/i);
  const az = f(/\bz\s*=\s*(-?\d+(?:\.\d+)?)/i);
  if (ax == null || ay == null || az == null) return null; // 가속도 세 축이 있어야 데이터 줄로 봄
  const g = f(/(?:합|sum|\bg)\s*=\s*(-?\d+(?:\.\d+)?)/i) ?? Math.sqrt(ax * ax + ay * ay + az * az);
  const hall = f(/(?:홀센서|홀|hall)\s*=\s*(\d+)/i);
  return {
    ax,
    ay,
    az,
    g,
    hall: hall === 1, // 1/0 뜻은 모듈마다 반대일 수 있어서 화면에서 뒤집을 수 있음
    state: "NORMAL", // 상태 값이 없음 -> 화면이 낙상 숫자 변화로 판단
    cd: 0,
    falls: f(/(?:낙상|fall)\s*=\s*(\d+)/i) ?? 0,
    steps: f(/(?:걷기|걸음|walk|steps?)\s*=\s*(\d+)/i) ?? 0,
    runs: f(/(?:뛰기|run)\s*=\s*(\d+)/i),
    friends: f(/(?:친구|friends?)\s*=\s*(\d+)/i),
    mpu: true,
    impact: 3, // 팀원 펌웨어 충격 기준 3.0g (자유낙하 0.3g 후 500ms 안에)
    source: "text",
  };
}

/** 한 줄 -> 데이터 (데이터 줄이 아니거나 깨졌으면 null) */
export function parseTelemetry(line: string): Telemetry | null {
  const t = line.trim();
  if (!t.startsWith("@{")) return parseTextLine(t);
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
      runs: typeof o.runs === "number" ? o.runs : null,
      friends: num(o.friends),
      mpu: o.mpu !== 0 && o.mpu !== false,
      impact: num(o.impact, 2),
      source: "json",
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
