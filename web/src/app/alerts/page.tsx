"use client";

// 홈 종 아이콘: 긴급 알림 (emergency_alerts)
//   지금 진행 중 + 지난 기록(내 낙상 · 내가 받은 알림)
//   각 알림의 상태 · 위치 · 응답 상태를 한 줄씩 보여 줌

import { api } from "@/lib/api";
import { useAlertRefresh, useLoad } from "@/lib/hooks";
import { clock, dateLabel, kstDate, timeAgo } from "@/lib/date";
import { Avatar, ErrorState, Glass, Loading, TopBar, cx } from "@/components/ui";
import { IconChevron, IconPin } from "@/components/icons";
import { AlertBadge } from "@/components/AlertListener";
import { AlertStatusChip, RESPONSE_LABEL } from "@/components/AlertBits";
import type { AlertDetail } from "@/lib/types";

const isActive = (a: AlertDetail) => a.status === "countdown" || a.status === "sent";

function hrefOf(a: AlertDetail): string | null {
  if (!a.is_mine) return `/alerts/${a.id}`;
  if (a.status === "countdown") return `/fall?id=${a.id}`;
  if (a.status === "cancelled") return null; // 취소된 내 알림은 상세 화면 없음
  return `/fall/${a.id}/sent`;
}

function when(iso: string) {
  return kstDate(new Date(iso)) === kstDate() ? `오늘 ${clock(iso)}` : `${dateLabel(iso)} ${clock(iso)}`;
}

export default function AlertsPage() {
  const { data, error, loading, reload } = useLoad(() => api.listAlertHistory(30));
  useAlertRefresh(() => reload(true), 8000);

  const active = data?.filter(isActive) ?? [];
  const past = data?.filter((a) => !isActive(a)) ?? [];

  return (
    <main className="px-5">
      <TopBar back="/home" backStyle="circle" title="긴급 알림" className="-mx-5" />
      {loading && !data ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState message={error ?? "불러오지 못했어요."} onRetry={() => reload()} />
      ) : (
        <>
          <h2 className="mb-2 px-1 text-[16px] font-bold">지금 진행 중</h2>
          {active.length === 0 ? (
            <Glass className="rounded-[24px] p-4 text-center">
              <p className="text-[15px] font-bold">진행 중인 긴급 알림이 없어요</p>
              <p className="mt-1 text-[13px] text-sub">팸 멤버가 넘어지면 여기와 화면 위에 바로 알려 드려요</p>
            </Glass>
          ) : (
            <ul className="space-y-3">
              {active.map((a) => (
                <li key={a.id}>
                  <AlertRow a={a} />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 mb-2 flex items-center justify-between px-1">
            <h2 className="text-[16px] font-bold">알림 기록</h2>
            <span className="text-[13px] text-sub">최근 {past.length}건</span>
          </div>
          {past.length === 0 ? (
            <p className="px-1 py-6 text-center text-[14px] text-sub">아직 기록이 없어요</p>
          ) : (
            <ul className="space-y-2.5">
              {past.map((a) => (
                <li key={a.id}>
                  <AlertRow a={a} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function AlertRow({ a }: { a: AlertDetail }) {
  const live = isActive(a);
  const href = hrefOf(a);
  const what = a.kind === "sos" ? "도움 요청" : a.trigger_source === "test" ? "낙상 테스트" : "낙상 감지";
  const title = a.is_mine ? `내 ${what}` : `${a.nickname}님 ${what}`;
  const response =
    a.status === "cancelled"
      ? "본인이 괜찮다고 취소했어요"
      : a.status === "countdown"
        ? `${a.countdown_seconds}초 안에 응답을 기다리는 중`
        : a.responder_nickname
          ? `${a.responder_nickname} · ${RESPONSE_LABEL[a.response_status]}`
          : `${a.notified_count}명에게 전달 · ${RESPONSE_LABEL[a.response_status]}`;

  const body = (
    <>
      <div className="flex items-center gap-3">
        <Avatar
          name={a.nickname}
          id={a.user_id}
          size={live ? 48 : 42}
          ring={live ? "#e8445e" : undefined}
          badge={live ? <AlertBadge /> : undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold">{title}</p>
          <p className="truncate text-[12.5px] text-sub">{live ? timeAgo(a.sent_at ?? a.started_at) : when(a.started_at)}</p>
        </div>
        <AlertStatusChip status={a.status} />
        {href && <IconChevron className="-mr-1 shrink-0 text-sub" />}
      </div>
      <div className="mt-2.5 space-y-1 border-t border-white/70 pt-2.5 pl-[54px] text-[13px]">
        <p className="font-semibold text-ink-2">{response}</p>
        {a.latitude != null && (
          <p className="flex items-center gap-1 text-sub">
            <IconPin size={14} className="shrink-0" />
            <span className="truncate">{a.address ?? `${a.latitude.toFixed(4)}, ${a.longitude?.toFixed(4)}`}</span>
          </p>
        )}
      </div>
    </>
  );

  const cls = cx("rounded-[24px] p-4", live && "border-[#ffb3c0] bg-[#fff1f3]/70");
  return href ? (
    <Glass href={href} className={cls}>
      {body}
    </Glass>
  ) : (
    <Glass className={cx(cls, "opacity-90")}>{body}</Glass>
  );
}
