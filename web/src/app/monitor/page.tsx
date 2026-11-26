"use client";

// =============================================================
//  키링 시리얼 모니터 (/monitor)  — PC 크롬 · 엣지 전용
//
//  키링을 USB로 꽂고 [시리얼 연결] -> 포트 고르기 -> 0.1초마다 들어오는 값을 보여 줌
//    - X · Y · Z 가속도, 합해진 g (그래프)
//    - 홀센서: 친구 키링(자석)이 맞대져 있는지
//    - 낙상 감지 횟수, 지금 상태 (낙상 감지 중이면 빨간 배너 + 남은 초)
//    - 걸음 · 친구 맞대기 횟수, 원본 로그
//  키링이 없으면 [데모 데이터]로 화면 확인 (걷기 · 낙상 흉내)
//
//  데이터 형식 · 연결 코드는 lib/serial.ts, 펌웨어 쪽은 printTelemetry()
//  ⚠️ Arduino IDE 시리얼 모니터가 열려 있으면 포트를 못 열어요 (하나만 쓸 수 있음)
// =============================================================

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { connectSerial, parseTelemetry, serialErrorMessage, serialSupported, type KeyringState, type SerialConnection, type Telemetry } from "@/lib/serial";
import { cx } from "@/components/ui";

const HISTORY = 150; // 그래프에 보이는 샘플 수 (0.1초 x 150 = 15초)
const LOG_MAX = 200;
const FREEFALL_G = 0.5; // 펌웨어 FREEFALL_G 와 같게

type Conn = { t: "idle" } | { t: "connecting" } | { t: "serial" } | { t: "demo" } | { t: "error"; msg: string };
type Sample = { g: number; at: number };

const STATE_UI: Record<KeyringState, { label: string; tone: "ok" | "warn" | "danger"; icon: string }> = {
  NORMAL: { label: "정상", tone: "ok", icon: "✓" },
  FALLING: { label: "떨어지는 중…", tone: "warn", icon: "↓" },
  CHECK: { label: "충격 감지 · 움직임 확인 중", tone: "warn", icon: "!" },
  ALERT: { label: "낙상 감지 중", tone: "danger", icon: "!" },
  EMERGENCY: { label: "응급 상황 · 팸에게 도움 요청", tone: "danger", icon: "‼" },
};

export default function MonitorPage() {
  const [conn, setConn] = useState<Conn>({ t: "idle" });
  const [tel, setTel] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [supported, setSupported] = useState(true);
  const connRef = useRef<SerialConnection | null>(null);
  const showRawRef = useRef(false);
  const demo = useDemo();

  useEffect(() => {
    showRawRef.current = showRaw;
  }, [showRaw]);
  // 서버 렌더링 때는 navigator 가 없어서 화면이 뜬 뒤에 확인
  useEffect(() => {
    const t = setTimeout(() => setSupported(serialSupported()), 0);
    return () => clearTimeout(t);
  }, []);

  const addLog = useCallback((line: string) => setLogs((l) => [...l.slice(-(LOG_MAX - 1)), line]), []);

  /** 한 줄 처리: 데이터 줄이면 숫자 갱신, 아니면 로그 */
  const onLine = useCallback(
    (line: string) => {
      const t = parseTelemetry(line);
      if (t) {
        setTel(t);
        setHistory((h) => [...h.slice(-(HISTORY - 1)), { g: t.g, at: Date.now() }]);
        if (showRawRef.current) addLog(line);
      } else {
        addLog(line);
      }
    },
    [addLog],
  );

  const reset = () => {
    setTel(null);
    setHistory([]);
    setLogs([]);
  };

  const connect = async () => {
    demo.stop();
    reset();
    setConn({ t: "connecting" });
    try {
      connRef.current = await connectSerial(onLine, (reason) => {
        connRef.current = null;
        setConn(reason ? { t: "error", msg: reason } : { t: "idle" });
      });
      setConn({ t: "serial" });
      addLog("[연결됨] 115200bps · 키링 데이터를 기다리는 중…");
    } catch (e) {
      setConn({ t: "error", msg: serialErrorMessage(e) });
    }
  };

  const disconnect = async () => {
    if (connRef.current) await connRef.current.close();
    connRef.current = null;
    demo.stop();
    setConn({ t: "idle" });
  };

  const startDemo = async () => {
    if (connRef.current) await connRef.current.close();
    reset();
    setConn({ t: "demo" });
    demo.start(onLine);
  };

  // 페이지를 떠나면 포트 닫기
  useEffect(
    () => () => {
      connRef.current?.close();
      demo.stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const live = conn.t === "serial" || conn.t === "demo";
  const noData = live && !tel;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto">
      <div className="pairy-bg" />
      <main className="mx-auto max-w-[1080px] px-5 pt-8 pb-16 sm:px-8">
        <header className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <Link href="/my" className="text-[13px] font-bold text-violet">
              ← Pairy
            </Link>
            <h1 className="mt-1 text-[28px] font-extrabold tracking-tight sm:text-[32px]">Pairy 키링 실시간 데이터</h1>
          </div>
          {live ? (
            <button onClick={disconnect} className="glass h-12 rounded-full px-6 text-[15px] font-bold">
              {conn.t === "demo" ? "데모 멈추기" : "연결 끊기"}
            </button>
          ) : (
            <>
              <button
                onClick={connect}
                disabled={!supported || conn.t === "connecting"}
                className="grad-primary h-12 rounded-full px-6 text-[15px] font-bold text-white disabled:opacity-40"
              >
                {conn.t === "connecting" ? "포트 고르는 중…" : "시리얼 연결"}
              </button>
              <button onClick={startDemo} className="glass h-12 rounded-full px-5 text-[15px] font-bold text-ink-2">
                데모 데이터
              </button>
            </>
          )}
        </header>

        <ConnStatus conn={conn} supported={supported} noData={noData} />

        {conn.t === "demo" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => demo.fall()} className="grad-danger rounded-full px-4 py-2 text-[14px] font-bold text-white">
              낙상 흉내
            </button>
            <button onClick={() => demo.cancel()} className="glass rounded-full px-4 py-2 text-[14px] font-bold">
              버튼으로 취소
            </button>
            <button onClick={() => demo.toggleMagnet()} className="glass rounded-full px-4 py-2 text-[14px] font-bold">
              자석 대기 / 떼기
            </button>
          </div>
        )}

        <StateBanner tel={tel} />

        <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="낙상 감지 횟수" value={tel ? `${tel.falls}회` : "–"} />
          <Tile label="걸음 수" value={tel ? tel.steps.toLocaleString("ko-KR") : "–"} />
          <Tile label="친구 맞대기" value={tel ? `${tel.friends}번` : "–"} />
          <Tile
            label="홀센서"
            value={tel ? (tel.hall ? "맞대짐" : "떨어짐") : "–"}
            badge={tel ? <Dot on={tel.hall} /> : null}
            sub={tel?.hall ? "친구 키링 자석이 닿아 있어요" : "자석이 닿으면 '맞대짐'"}
          />
        </section>

        <section className="glass mt-4 rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-[13px] font-bold text-ink-2">합해진 가속도 √(x²+y²+z²)</p>
              <p className="text-[44px] leading-none font-extrabold tabular-nums">
                {tel ? tel.g.toFixed(2) : "–"}
                <span className="ml-1 text-[18px] font-bold text-sub">g</span>
              </p>
            </div>
            <Axis label="X" v={tel?.ax} />
            <Axis label="Y" v={tel?.ay} />
            <Axis label="Z" v={tel?.az} />
            {tel && !tel.mpu && <p className="text-[14px] font-bold text-danger">⚠ 가속도 센서 연결 안 됨 · 배선 확인</p>}
          </div>
          <GChart samples={history} impact={tel?.impact ?? 2} />
          <p className="mt-2 text-[12px] text-sub">
            최근 15초 · 가만히 있으면 1g · {FREEFALL_G}g 아래로 떨어진 뒤 충격 기준을 넘고 2초간 움직임이 없으면 낙상 감지
          </p>
        </section>

        <section className="mt-4 overflow-hidden rounded-[24px] bg-[#17142b] text-white">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <h2 className="text-[14px] font-bold">시리얼 로그</h2>
            <label className="flex items-center gap-2 text-[13px] text-white/70">
              <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
              데이터 줄(@)도 보기
            </label>
          </div>
          <Log lines={logs} />
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------
function ConnStatus({ conn, supported, noData }: { conn: Conn; supported: boolean; noData: boolean }) {
  let text: string | null = null;
  let bad = false;
  if (!supported) {
    text = "이 브라우저는 시리얼 연결을 지원하지 않아요. PC의 크롬 또는 엣지에서 열어 주세요. (폰 · 사파리 · 파이어폭스 안 됨)";
    bad = true;
  } else if (conn.t === "error") {
    text = conn.msg;
    bad = true;
  } else if (noData) {
    text = "연결됐어요. 데이터가 안 오면: 키링에 최신 펌웨어가 올라갔는지, 보드 설정 'USB CDC On Boot = Enabled' 인지 확인해 주세요.";
  } else if (conn.t === "idle") {
    text = "키링을 USB로 연결하고 [시리얼 연결]을 눌러 포트를 골라 주세요. Arduino IDE 시리얼 모니터는 닫아 주세요.";
  } else if (conn.t === "serial") {
    text = "키링과 연결됨 · 0.1초마다 갱신";
  } else if (conn.t === "demo") {
    text = "데모 데이터를 보여 주는 중이에요 (실제 키링 아님)";
  }
  if (!text) return null;
  return <p className={cx("mt-3 text-[14px]", bad ? "font-bold text-danger" : "text-ink-2")}>{text}</p>;
}

function StateBanner({ tel }: { tel: Telemetry | null }) {
  if (!tel) return null;
  const ui = STATE_UI[tel.state];
  const danger = ui.tone === "danger";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "mt-4 flex items-center gap-4 rounded-[24px] px-5 py-4",
        ui.tone === "ok" && "bg-mint text-mint-ink",
        ui.tone === "warn" && "bg-[#fff0dc] text-[#9a5a0c]",
        danger && "grad-danger text-white shadow-[0_12px_30px_-12px_rgba(232,68,94,0.7)]",
      )}
    >
      <span className={cx("relative flex size-11 shrink-0 items-center justify-center rounded-full text-[20px] font-black", danger ? "bg-white/25" : "bg-white/70")}>
        {danger && <span className="animate-pulse-ring absolute inset-0 rounded-full bg-white/40" />}
        {ui.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[20px] font-extrabold">{ui.label}</p>
        {tel.state === "ALERT" && <p className="text-[14px] font-semibold opacity-90">키링 BOOT 버튼을 누르면 취소돼요</p>}
        {tel.state === "EMERGENCY" && <p className="text-[14px] font-semibold opacity-90">BOOT 버튼을 2초 길게 누르면 &lsquo;괜찮아요&rsquo;</p>}
      </div>
      {tel.state === "ALERT" && (
        <span className="text-right">
          <span className="block text-[12px] font-bold opacity-90">취소까지</span>
          <span className="text-[40px] leading-none font-extrabold tabular-nums">{tel.cd}</span>
          <span className="ml-0.5 text-[16px] font-bold">초</span>
        </span>
      )}
    </div>
  );
}

function Tile({ label, value, sub, badge }: { label: string; value: string; sub?: string; badge?: ReactNode }) {
  return (
    <div className="glass rounded-[24px] p-5">
      <p className="flex items-center gap-2 text-[13px] font-bold text-ink-2">
        {badge}
        {label}
      </p>
      <p className="mt-2 text-[30px] leading-none font-extrabold tabular-nums">{value}</p>
      {sub && <p className="mt-2 text-[12px] text-sub">{sub}</p>}
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return <span aria-hidden className={cx("size-2.5 rounded-full", on ? "bg-violet ring-4 ring-violet/20" : "bg-mute")} />;
}

function Axis({ label, v }: { label: string; v?: number }) {
  // -2g ~ +2g 를 막대로 (가운데 0)
  const pct = v == null ? 0 : Math.max(-1, Math.min(1, v / 2)) * 50;
  return (
    <div className="w-[120px]">
      <p className="flex items-baseline justify-between text-[13px] font-bold text-ink-2">
        {label}
        <span className="text-[20px] font-extrabold text-ink tabular-nums">{v == null ? "–" : v.toFixed(2)}</span>
      </p>
      <div className="relative mt-1.5 h-2 rounded-full bg-white/70">
        <span className="absolute top-0 left-1/2 h-full w-px bg-ink/20" />
        <span
          className="absolute top-0 h-full rounded-full bg-violet"
          style={{ left: pct < 0 ? `${50 + pct}%` : "50%", width: `${Math.abs(pct)}%` }}
        />
      </div>
    </div>
  );
}

/** 합해진 g 그래프: 한 줄 + 기준선(떨어짐 · 가만히 · 충격). 마우스를 올리면 그 순간 값 */
function GChart({ samples, impact }: { samples: Sample[]; impact: number }) {
  const W = 1000;
  const H = 220;
  const PAD_L = 8;
  const PAD_R = 92; // 기준선 이름 자리
  const MAX = Math.max(3.5, impact + 1, ...samples.map((s) => s.g));
  const x = (i: number) => PAD_L + (i / (HISTORY - 1)) * (W - PAD_L - PAD_R);
  const y = (g: number) => H - 10 - (Math.min(g, MAX) / MAX) * (H - 24);
  const offset = HISTORY - samples.length; // 데이터가 적으면 오른쪽부터 채움
  const d = samples.map((s, i) => `${i ? "L" : "M"}${x(i + offset).toFixed(1)},${y(s.g).toFixed(1)}`).join(" ");
  const [hover, setHover] = useState<number | null>(null);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD_L) / (W - PAD_L - PAD_R)) * (HISTORY - 1)) - offset;
    setHover(i >= 0 && i < samples.length ? i : null);
  };
  const h = hover != null ? samples[hover] : null;
  const last = samples[samples.length - 1];

  const refs = [
    { g: FREEFALL_G, label: `떨어짐 ${FREEFALL_G}g` },
    { g: 1, label: "가만히 1g" },
    { g: impact, label: `충격 ${impact.toFixed(1)}g` },
  ];

  return (
    <div className="relative mt-5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[220px] w-full touch-none"
        preserveAspectRatio="none"
        role="img"
        aria-label={`최근 15초 가속도 그래프${last ? `, 지금 ${last.g.toFixed(2)}g` : ""}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(r.g)} y2={y(r.g)} stroke="#2a2350" strokeOpacity={0.18} strokeWidth={1} strokeDasharray={r.g === 1 ? undefined : "6 6"} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        <line x1={PAD_L} x2={W - PAD_R} y1={H - 10} y2={H - 10} stroke="#2a2350" strokeOpacity={0.25} vectorEffect="non-scaling-stroke" />
        {d && <path d={d} fill="none" stroke="#5b3fe0" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {h && hover != null && (
          <line x1={x(hover + offset)} x2={x(hover + offset)} y1={6} y2={H - 10} stroke="#2a2350" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* 기준선 이름은 HTML 로 (SVG 가 가로로 늘어나도 글자가 안 찌그러지게) */}
      {refs.map((r) => (
        <span key={r.label} className="pointer-events-none absolute right-0 -translate-y-1/2 text-[11px] font-bold text-sub" style={{ top: `${(y(r.g) / H) * 100}%` }}>
          {r.label}
        </span>
      ))}
      {h && hover != null && (
        <span
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl bg-ink/90 px-3 py-1.5 text-center whitespace-nowrap text-white"
          style={{ left: `${(x(hover + offset) / W) * 100}%` }}
        >
          <b className="block text-[15px] tabular-nums">{h.g.toFixed(2)}g</b>
          <span className="text-[11px] text-white/70">{last ? ((last.at - h.at) / 1000).toFixed(1) : "0.0"}초 전</span>
        </span>
      )}
      {samples.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-[14px] text-sub">연결하면 여기에 그래프가 그려져요</p>}
    </div>
  );
}

function Log({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight; // 맨 아래 보고 있을 때만 따라감
  }, [lines]);
  return (
    <pre ref={ref} className="h-[260px] overflow-y-auto px-5 py-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-white/85">
      {lines.length ? lines.join("\n") : "아직 받은 로그가 없어요."}
    </pre>
  );
}

// ---------------------------------------------------------------
//  데모 데이터: 펌웨어와 같은 형식의 줄을 만들어 같은 처리 경로로 흘려보냄
// ---------------------------------------------------------------
function useDemo() {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const s = useRef({ t: 0, state: "NORMAL" as KeyringState, phaseAt: 0, falls: 0, steps: 0, friends: 0, hall: false, alertAt: 0 });
  const emit = useRef<(l: string) => void>(() => {});

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(
    (onLine: (l: string) => void) => {
      stop();
      emit.current = onLine;
      s.current = { t: 0, state: "NORMAL", phaseAt: 0, falls: 0, steps: 0, friends: 0, hall: false, alertAt: 0 };
      onLine("===== Pariy 키링 시작 (데모) =====");
      timer.current = setInterval(() => {
        const st = s.current;
        st.t += 1;
        const since = st.t - st.phaseAt;
        let g: number;
        if (st.state === "FALLING") {
          g = since < 3 ? 0.2 : 3.1; // 떨어짐 -> 쾅
          if (since >= 3) {
            st.state = "CHECK";
            st.phaseAt = st.t;
            onLine("... 충격 감지, 2초간 움직임 확인");
          }
        } else if (st.state === "CHECK") {
          g = 1 + (Math.random() - 0.5) * 0.06;
          if (since >= 25) {
            st.state = "ALERT";
            st.phaseAt = st.t;
            st.alertAt = st.t;
            st.falls += 1;
            onLine(">>> 낙상 경고 시작: 떨어진 뒤 움직임 없음");
            onLine(">>> 10초 안에 BOOT 버튼을 누르면 취소됩니다");
          }
        } else if (st.state === "ALERT" || st.state === "EMERGENCY") {
          g = 1 + (Math.random() - 0.5) * 0.04;
          if (st.state === "ALERT" && st.t - st.alertAt >= 100) {
            st.state = "EMERGENCY";
            onLine("!!! 응급 상황: 취소되지 않아 팸에게 도움을 요청합니다 !!!");
          }
        } else {
          // 걷기: 0.5초 주기로 출렁
          g = 1 + 0.32 * Math.sin(st.t * 1.25) + (Math.random() - 0.5) * 0.1;
          if (st.t % 5 === 0) st.steps += 1;
        }
        const ax = (Math.random() - 0.5) * 0.3 * g;
        const ay = (Math.random() - 0.5) * 0.3 * g;
        const az = Math.sqrt(Math.max(0, g * g - ax * ax - ay * ay));
        const cd = st.state === "ALERT" ? Math.max(0, Math.ceil((100 - (st.t - st.alertAt)) / 10)) : 0;
        onLine(
          `@${JSON.stringify({ ax: +ax.toFixed(2), ay: +ay.toFixed(2), az: +az.toFixed(2), g: +g.toFixed(2), hall: st.hall ? 1 : 0, state: st.state, cd, falls: st.falls, steps: st.steps, friends: st.friends, mpu: 1, impact: 2 })}`,
        );
        if (st.t % 10 === 0) onLine(`상태=${STATE_UI[st.state].label} | 걸음=${st.steps} | 친구=${st.friends} | 가속도=${g.toFixed(2)}`);
      }, 100);
    },
    [stop],
  );

  const fall = useCallback(() => {
    const st = s.current;
    if (st.state !== "NORMAL") return;
    st.state = "FALLING";
    st.phaseAt = st.t;
    emit.current("... 떨어지는 중");
  }, []);
  const cancel = useCallback(() => {
    const st = s.current;
    if (st.state === "NORMAL") return;
    st.state = "NORMAL";
    emit.current(">>> 경고 해제: 버튼");
  }, []);
  const toggleMagnet = useCallback(() => {
    const st = s.current;
    st.hall = !st.hall;
    if (st.hall) {
      st.friends += 1;
      emit.current(`*** 친구 키링 연결! 누적 ${st.friends}번`);
    }
  }, []);

  return { start, stop, fall, cancel, toggleMagnet };
}
