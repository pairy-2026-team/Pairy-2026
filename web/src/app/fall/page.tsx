"use client";

// =============================================================
//  10_fall_detect 낙상 감지 타이머
//
//  주소
//    /fall?source=keyring          키링이 낙상 감지 (NFC/알림에서 열림)
//    /fall?source=test             설정의 테스트
//    /fall?kind=sos&source=manual  직접 도움 요청 (대기 없이 바로 전송)
//    /fall?id=<alertId>            진행 중인 카운트다운으로 돌아오기
//
//  화면 상태
//    starting ─▶ countdown ─(취소)──▶ cancelling ─▶ cancelled
//                   │
//                   ├─(즉시 요청 / 0초)─▶ sending ─▶ [/fall/:id/sent]
//                   │                       └─실패─▶ send_failed ─(자동 재시도 2회 / 다시 보내기)─▶ sending
//    starting ─실패─▶ start_failed
//
//  동시에 일어나는 경우
//    - 0초 자동 전송과 버튼 연타: sendingRef 로 1번만 호출 + DB도 멱등(sent면 그대로 반환)
//    - 취소를 눌렀는데 이미 전송됨: ALERT_ALREADY_SENT -> 전송 화면으로 이동해 '상황 종료'로 안내
//    - 화면을 닫음: DB의 flush_expired_countdowns()가 대기시간+30초 뒤 자동 전송
// =============================================================

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { toApiError } from "@/lib/errors";
import { beep, vibrate } from "@/lib/device";
import { coordText, getLocation, reverseGeocode } from "@/lib/geo";
import { Button, Glass, Sparkles, Spinner, cx } from "@/components/ui";
import { IconPin, IconPulse } from "@/components/icons";
import type { AlertKind, AlertSource, EmergencyAlert } from "@/lib/types";

type Phase =
  | { t: "starting" }
  | { t: "countdown" }
  | { t: "sending" }
  | { t: "send_failed"; message: string; attempts: number }
  | { t: "cancelling" }
  | { t: "cancelled" }
  | { t: "start_failed"; message: string; code: string };

const AUTO_RETRY = 3;

type LocState = { t: "pending" } | { t: "none" } | { t: "ok"; text: string };

/** 위치: 팸이 찾아올 수 있게 알림에 붙임 (실패해도 전송은 계속) */
async function shareLocation(alertId: string, setLoc: (l: LocState) => void) {
  const p = await getLocation();
  if (!p) return setLoc({ t: "none" });
  setLoc({ t: "ok", text: coordText(p.lat, p.lng) });
  api.updateAlertLocation(alertId, { lat: p.lat, lng: p.lng, accuracy: p.accuracy }).catch(() => {});
  const address = await reverseGeocode(p.lat, p.lng);
  if (address) {
    setLoc({ t: "ok", text: address });
    api.updateAlertLocation(alertId, { lat: p.lat, lng: p.lng, accuracy: p.accuracy, address }).catch(() => {});
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="pt-safe relative flex min-h-dvh flex-col px-5">
      <div className="pairy-bg pairy-bg-alert" />
      <Sparkles
        spots={[
          { top: "130px", left: "14%" },
          { top: "112px", left: "84%", size: 18 },
          { top: "300px", left: "16%", size: 12 },
          { top: "290px", left: "80%", size: 10 },
        ]}
      />
      {children}
    </main>
  );
}

function FallTimer() {
  const router = useRouter();
  const sp = useSearchParams();
  const resumeId = sp.get("id");
  const kind: AlertKind = sp.get("kind") === "sos" ? "sos" : "fall";
  const rawSource = sp.get("source");
  const source: AlertSource = rawSource === "manual" || rawSource === "test" ? rawSource : "keyring";

  const [phase, setPhase] = useState<Phase>({ t: "starting" });
  const [alert, setAlert] = useState<EmergencyAlert | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [total, setTotal] = useState(10);
  const [now, setNow] = useState(() => Date.now());

  const [loc, setLoc] = useState<LocState>({ t: "pending" });
  const startedRef = useRef(false);
  const sendingRef = useRef(false);
  const lastSecRef = useRef<number | null>(null);

  // ---------- 1. 시작 ----------
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        let a: EmergencyAlert | null;
        if (resumeId) {
          a = await api.getMyAlert(resumeId);
          if (!a) throw toApiError("ALERT_NOT_FOUND");
        } else {
          a = await api.startFall(source, kind);
        }
        setAlert(a);
        if (a.status === "sent" || a.status === "resolved") return router.replace(`/fall/${a.id}/sent`);
        if (a.status === "cancelled") return setPhase({ t: "cancelled" });

        const secs = a.countdown_seconds;
        setTotal(Math.max(1, secs));
        // 새로 만든 알림은 내 시계 기준, 이어보기는 서버 시작 시각 기준 (최대 secs)
        const elapsed = resumeId ? Math.max(0, Date.now() - new Date(a.started_at).getTime()) : 0;
        const t0 = Date.now();
        setNow(t0); // 첫 화면에서 남은 시간이 11초처럼 커 보이지 않게 기준 시각을 맞춤
        setDeadline(t0 + Math.max(0, Math.min(secs * 1000, secs * 1000 - elapsed)));
        setPhase({ t: "countdown" });
        // 주소를 id로 바꿔서 새로고침해도 같은 알림을 이어감
        if (!resumeId) router.replace(`/fall?id=${a.id}`, { scroll: false });
        shareLocation(a.id, setLoc);
      } catch (e) {
        const err = toApiError(e);
        setPhase({ t: "start_failed", message: err.message, code: err.code });
      }
    })();
  }, [resumeId, source, kind, router]);

  // ---------- 2. 전송 ----------
  const send = useCallback(
    async (reason: "timeout" | "manual", attempts = 0) => {
      if (!alert || sendingRef.current) return;
      sendingRef.current = true;
      setPhase({ t: "sending" });
      try {
        const sent = await api.sendFall(alert.id, reason);
        vibrate([300, 100, 300]);
        router.replace(`/fall/${sent.id}/sent`);
      } catch (e) {
        const err = toApiError(e);
        sendingRef.current = false;
        if (err.code === "ALERT_NOT_ACTIVE") return setPhase({ t: "cancelled" }); // 그사이 취소됨
        setPhase({ t: "send_failed", message: err.message, attempts: attempts + 1 });
      }
    },
    [alert, router],
  );

  // 전송 실패 -> 네트워크 문제일 수 있으니 자동으로 몇 번 더 시도
  useEffect(() => {
    if (phase.t !== "send_failed" || phase.attempts >= AUTO_RETRY) return;
    const t = setTimeout(() => send("manual", phase.attempts), 2000 * phase.attempts);
    return () => clearTimeout(t);
  }, [phase, send]);

  // ---------- 3. 카운트다운 ----------
  useEffect(() => {
    if (phase.t !== "countdown") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [phase.t]);

  const remainingMs = deadline ? Math.max(0, deadline - now) : total * 1000;
  const remaining = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (phase.t !== "countdown" || deadline == null) return;
    if (remainingMs <= 0) {
      // 타이머가 0초가 되는 순간이 곧 '전송' 상태 전이
      // eslint-disable-next-line react-hooks/set-state-in-effect
      send("timeout");
      return;
    }
    if (lastSecRef.current !== remaining) {
      lastSecRef.current = remaining;
      vibrate(remaining <= 3 ? 250 : 120);
      beep(remaining <= 3 ? 1046 : 880, 120);
    }
  }, [phase.t, deadline, remainingMs, remaining, send]);

  // ---------- 4. 취소 ----------
  const cancel = async () => {
    if (!alert || sendingRef.current) return;
    setPhase({ t: "cancelling" });
    try {
      await api.cancelFall(alert.id);
      vibrate(60);
      setPhase({ t: "cancelled" });
    } catch (e) {
      const err = toApiError(e);
      if (err.code === "ALERT_ALREADY_SENT") return router.replace(`/fall/${alert.id}/sent?late_cancel=1`);
      setPhase({ t: "countdown" }); // 취소 실패 -> 카운트다운 유지, 다시 누를 수 있게
    }
  };

  // ---------- 화면 ----------
  if (phase.t === "cancelled") {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="text-[28px] font-bold">알림을 취소했어요</h1>
          <p className="mt-2 text-[15px] text-sub">괜찮으시다니 다행이에요. 팸에게는 알림이 가지 않았어요.</p>
        </div>
        <div className="pb-safe">
          <Button href="/home">홈으로</Button>
        </div>
      </Shell>
    );
  }

  if (phase.t === "start_failed") {
    const disabled = phase.code === "FALL_DETECTION_DISABLED";
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="text-[26px] font-bold">{disabled ? "낙상 감지가 꺼져 있어요" : "알림을 시작하지 못했어요"}</h1>
          <p className="mt-2 text-[15px] text-sub">{disabled ? "위험 감지 설정에서 낙상 감지를 다시 켜 주세요." : phase.message}</p>
        </div>
        <div className="pb-safe space-y-3">
          {!disabled && (
            <a href="tel:119" className="grad-danger flex h-14 items-center justify-center rounded-full text-[17px] font-bold text-white">
              위급하면 119에 직접 전화
            </a>
          )}
          <Button variant="glass" href={disabled ? "/settings/safety" : "/home"}>
            {disabled ? "위험 감지 설정으로 가기" : "홈으로"}
          </Button>
        </div>
      </Shell>
    );
  }

  const isSos = kind === "sos" || alert?.kind === "sos";
  const R = 92;
  const C = 2 * Math.PI * R;
  const ratio = remainingMs / (total * 1000);
  const busy = phase.t === "sending" || phase.t === "cancelling" || phase.t === "starting";
  const failed = phase.t === "send_failed";
  const sensor =
    source === "test" || alert?.trigger_source === "test"
      ? "테스트 · 낙상 감지 체험"
      : isSos
        ? "직접 도움 요청"
        : "키링 센서 · 강한 충격 감지";

  return (
    <Shell>
      <div className="flex justify-center pt-8">
        <span className="glass inline-flex items-center gap-2 rounded-full px-5 py-2 text-[15px] font-bold text-danger">
          <span className="size-2.5 rounded-full bg-danger" />
          {isSos ? "도움 요청" : "낙상 감지됨"}
        </span>
      </div>

      {/* 타이머 */}
      <div className="relative mx-auto mt-4 flex size-[280px] items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-white/25" />
        <span className="absolute inset-[30px] rounded-full bg-white/30" />
        {phase.t === "countdown" && <span className="animate-pulse-ring absolute inset-[44px] rounded-full bg-white/40" />}
        <div className="relative size-[212px] rounded-full bg-white/90 shadow-[0_10px_40px_-10px_rgba(232,68,94,0.4)]">
          <svg viewBox="0 0 212 212" className="absolute inset-0 size-full -rotate-90">
            <defs>
              <linearGradient id="fall-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#FF9A5C" />
                <stop offset="1" stopColor="#E8445E" />
              </linearGradient>
            </defs>
            <circle cx="106" cy="106" r={R} stroke="#ffe3e3" strokeWidth="14" fill="none" />
            <circle
              cx="106"
              cy="106"
              r={R}
              stroke="url(#fall-grad)"
              strokeWidth="14"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - ratio)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {busy ? (
              <Spinner className="size-12 border-4" />
            ) : failed ? (
              <>
                <span className="text-[15px] font-bold text-danger">전송 실패</span>
                <span className="mt-1 text-[13px] text-sub">
                  {phase.attempts < AUTO_RETRY ? "다시 보내는 중…" : "아래에서 다시 보내 주세요"}
                </span>
              </>
            ) : (
              <>
                <span className="text-[14px] text-ink-2">자동 요청까지</span>
                <span className="text-[70px] leading-none font-bold tabular-nums">{remaining}</span>
                <span className="mt-1 text-[14px] text-ink-2">초</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <h1 className="text-[28px] font-bold">
          {failed ? "알림을 못 보냈어요" : phase.t === "sending" ? "팸에게 알리는 중…" : isSos ? "도움을 요청할게요" : "넘어지셨나요?"}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {failed ? (
            phase.message
          ) : (
            <>
              움직임이 없으면 {total}초 뒤
              <br />
              팸에게 자동으로 도움을 요청해요
            </>
          )}
        </p>
      </div>

      <Glass className="mt-6 space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#ffe2e6] text-danger">
            <IconPulse size={20} />
          </span>
          <span className="text-[15px] font-bold">{sensor}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lilac text-violet">
            <IconPin size={20} />
          </span>
          <span className={cx("text-[15px]", loc.t === "ok" ? "text-ink-2" : "text-sub")}>
            {loc.t === "ok" ? loc.text : loc.t === "pending" ? "위치 확인 중…" : "위치 권한이 꺼져 있어 위치 없이 알려요"}
          </span>
        </div>
      </Glass>

      <div className="pb-safe mt-auto space-y-3 pt-6">
        {failed ? (
          <>
            <Button onClick={() => send("manual", phase.attempts)}>다시 보내기</Button>
            <a href="tel:119" className="grad-danger flex h-14 items-center justify-center rounded-full text-[17px] font-bold text-white">
              119에 직접 전화하기
            </a>
          </>
        ) : (
          <>
            <Button onClick={cancel} disabled={busy}>
              {phase.t === "cancelling" ? "취소하는 중…" : "괜찮아요, 취소할게요"}
            </Button>
            <Button variant="danger" onClick={() => send("manual")} disabled={busy}>
              지금 바로 도움 요청
            </Button>
          </>
        )}
        <p className="pt-1 text-center text-[13px] text-sub">
          {source === "test" || alert?.trigger_source === "test" ? "테스트 모드 · 취소하지 않으면 실제로 알림이 가요" : "Pairy 키링 · 연결됨"}
        </p>
      </div>
    </Shell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Shell>{null}</Shell>}>
      <FallTimer />
    </Suspense>
  );
}
