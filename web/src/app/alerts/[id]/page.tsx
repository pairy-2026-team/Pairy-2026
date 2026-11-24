"use client";

// 14_danger_alert 긴급 알림 (팸 멤버가 받는 화면)
//  내 응답 (alert_recipients.status, 뒤로 돌아가지 않음)
//    delivered ─'내가 확인했어요'─▶ seen ─'지금 갈게요'─▶ on_the_way
//         └──────── 119 전화하기 ────▶ calling
//  응답한 사람은 '상황 종료'로 resolved 처리 가능

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAlertRefresh, useLoad } from "@/lib/hooks";
import { errorMessage } from "@/lib/errors";
import { clock } from "@/lib/date";
import { Avatar, ConfirmSheet, ErrorState, Glass, Loading, TopBar, cx, useToast } from "@/components/ui";
import { AlertBadge, markAlertSeen } from "@/components/AlertListener";
import { RECIPIENT_LABEL, RecipientChip } from "@/components/RecipientChip";
import { AlertStatusChip, LocationCard, RESPONSE_LABEL } from "@/components/AlertBits";
import type { AlertDetail, AlertRecipient, RecipientStatus } from "@/lib/types";

const hhmm = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(
        new Date(iso),
      )
    : "";

function subline(a: AlertDetail) {
  if (a.status === "resolved") return `${clock(a.resolved_at)}에 상황이 종료됐어요`;
  const t = hhmm(a.started_at);
  if (a.kind === "sos" || a.send_reason === "manual") return `${t} · 직접 도움을 요청했어요`;
  if (a.send_reason === "auto") return `${t} · 응답이 없어 자동으로 전송됐어요`;
  return `${t} · ${a.countdown_seconds}초간 응답이 없었어요`;
}

type Step = { color: string; time: string; text: string };
function timeline(a: AlertDetail, recipients: AlertRecipient[]): Step[] {
  const steps: Step[] = [
    {
      color: "#e8445e",
      time: hhmm(a.started_at),
      text: a.kind === "sos" ? "도움 요청 · 직접" : "낙상 감지 · 키링 센서",
    },
  ];
  if (a.sent_at) {
    if (a.kind !== "sos")
      steps.push({
        color: "#ff9f43",
        time: hhmm(a.sent_at),
        text: a.send_reason === "manual" ? "본인이 바로 도움 요청" : "본인 응답 없음",
      });
    steps.push({ color: "#2cc495", time: hhmm(a.sent_at), text: `팸 ${a.notified_count}명에게 알림 전송` });
  }
  recipients
    .filter((r) => r.status !== "delivered")
    .sort((x, y) => x.updated_at.localeCompare(y.updated_at))
    .forEach((r) => steps.push({ color: "#7c5cf0", time: hhmm(r.updated_at), text: `${r.nickname} · ${RECIPIENT_LABEL[r.status]}` }));
  if (a.resolved_at) steps.push({ color: "#2cc495", time: hhmm(a.resolved_at), text: "상황 종료 · 괜찮아요" });
  return steps;
}

function DangerAlert() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(async () => {
    const [a, recipients] = await Promise.all([api.getAlertDetail(id), api.getAlertRecipients(id)]);
    return a ? { a, recipients } : null;
  }, [id]);
  useAlertRefresh(() => reload(true), 4000, id);
  const [busy, setBusy] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.a.is_mine) router.replace(`/fall/${data.a.id}/sent`);
    else markAlertSeen(data.a.id);
  }, [data, router]);

  if (loading && !data) return <Loading />;
  if (error || !data)
    return (
      <>
        <TopBar back="/home" backStyle="circle" title="긴급 알림" />
        <ErrorState message={error ?? "알림을 찾을 수 없거나 볼 수 없는 알림이에요."} onRetry={() => reload()} />
      </>
    );

  const { a, recipients } = data;
  const resolved = a.status === "resolved";
  const my = a.my_status ?? "delivered";

  const respond = async (r: Exclude<RecipientStatus, "delivered">, msg?: string) => {
    setBusy(r);
    try {
      await api.respondFall(a.id, r);
      if (msg) toast(msg);
      await reload(true);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const resolve = async () => {
    setBusy("resolve");
    try {
      await api.resolveFall(a.id);
      setResolveOpen(false);
      await reload(true);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // 하단 링크: 지금 내 응답 단계에 따라 다음 행동
  const next =
    my === "delivered"
      ? { label: "내가 확인했어요 · 팸에게 알리기", run: () => respond("seen", "팸에게 확인했다고 알렸어요") }
      : my === "seen"
        ? { label: "지금 갈게요 · 팸에게 알리기", run: () => respond("on_the_way", "팸에게 가고 있다고 알렸어요") }
        : { label: "도착했어요 · 상황 종료하기", run: () => setResolveOpen(true) };

  return (
    <main className="relative flex min-h-[calc(100dvh-7rem)] flex-col px-5">
      <TopBar back="/home" backStyle="circle" title="긴급 알림" className="-mx-5" />

      <Glass
        className={cx(
          "flex items-center gap-4 p-5",
          resolved ? "border-[#b9ecd8] bg-white/70" : "border-[#ffb3c0] bg-[#fff1f3]/80",
        )}
      >
        <Avatar
          name={a.nickname}
          id={a.user_id}
          size={66}
          ring={resolved ? "#2cc495" : "#e8445e"}
          badge={resolved ? undefined : <AlertBadge />}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[18px] leading-snug font-bold">
            {resolved ? `${a.nickname}님은 괜찮아요` : `${a.nickname}님에게 ${a.kind === "sos" ? "도움 요청이 왔어요" : "낙상이 감지됐어요"}`}
          </p>
          <p className="mt-1 text-[13px] text-sub">{subline(a)}</p>
        </div>
      </Glass>

      <div className="mt-3 flex items-center justify-between px-1">
        <AlertStatusChip status={a.status} />
        <span className="text-[13px] font-semibold text-ink-2">
          {a.responder_nickname
            ? `${a.responder_nickname} · ${RESPONSE_LABEL[a.response_status]}`
            : RESPONSE_LABEL[a.response_status]}
        </span>
      </div>

      <LocationCard
        className="mt-3"
        loc={a}
        live={a.status === "sent"}
        title={a.status === "sent" ? `${a.nickname}님 위치 · 실시간` : `${a.nickname}님 마지막 위치`}
      />

      <Glass className="mt-4 p-5">
        <h2 className="text-[16px] font-bold">진행 상황</h2>
        <ol className="mt-3">
          {timeline(a, recipients).map((s, i, arr) => (
            <li key={i} className="relative flex items-center gap-3 py-2">
              {i < arr.length - 1 && <span className="absolute top-[22px] left-[6px] h-[calc(100%-4px)] w-[2px] bg-white" />}
              <span className="relative size-[14px] shrink-0 rounded-full ring-2 ring-white" style={{ background: s.color }} />
              <span className="w-12 shrink-0 text-[14px] font-bold text-ink-2 tabular-nums">{s.time}</span>
              <span className="text-[15px] font-bold">{s.text}</span>
            </li>
          ))}
        </ol>
      </Glass>

      {recipients.length > 0 && (
        <Glass className="mt-4 px-4 py-3">
          <h2 className="mb-1 px-1 text-[16px] font-bold">팸 응답</h2>
          <ul>
            {recipients.map((r, i) => (
              <li key={r.user_id} className={cx("flex items-center gap-3 px-1 py-2", i > 0 && "border-t border-white/80")}>
                <Avatar name={r.nickname} id={r.user_id} size={32} />
                <span className="flex-1 text-[15px] font-bold">{r.nickname}</span>
                <RecipientChip status={r.status} />
              </li>
            ))}
          </ul>
        </Glass>
      )}

      <div className="mt-auto pt-6">
        {resolved ? (
          <button onClick={() => router.push("/home")} className="grad-primary h-14 w-full rounded-full text-[17px] font-bold text-white">
            홈으로
          </button>
        ) : (
          <>
            <a
              href="tel:119"
              onClick={() => respond("calling")}
              className="grad-primary flex h-14 w-[48%] items-center justify-center rounded-full text-[17px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(91,63,224,0.7)]"
            >
              119 전화하기
            </a>
            <button
              onClick={next.run}
              disabled={!!busy}
              className="mt-3 w-full py-2 text-center text-[15px] font-bold text-violet disabled:opacity-50"
            >
              {next.label}
            </button>
          </>
        )}
      </div>

      <ConfirmSheet
        open={resolveOpen}
        title={`${a.nickname}님 상황을 종료할까요?`}
        desc="직접 확인했을 때만 종료해 주세요. 다른 팸 멤버의 알림도 함께 끝나요."
        confirmLabel="종료하기"
        loading={busy === "resolve"}
        onConfirm={resolve}
        onClose={() => setResolveOpen(false)}
      />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <DangerAlert />
    </Suspense>
  );
}
