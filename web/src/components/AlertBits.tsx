"use client";

// emergency_alerts 를 화면에 보여 주는 공통 부품
//   상태 칩 (확인 중 / 도움 요청 중 / 취소됨 / 종료)
//   응답 상태 (응답 대기 / 확인했어요 / 전화 거는 중 / 가고 있어요)
//   위치 카드 (시안 11_fall_sos_sent 의 지도 카드)

import { timeAgo } from "@/lib/date";
import { useNow } from "@/lib/hooks";
import { coordText, mapUrl } from "@/lib/geo";
import type { AlertLocation, AlertStatus, ResponseStatus } from "@/lib/types";
import { IconPin } from "./icons";
import { Glass, cx } from "./ui";

export const ALERT_STATUS: Record<AlertStatus, { label: string; cls: string; dot: string }> = {
  countdown: { label: "확인 중", cls: "bg-[#fff0dc] text-[#b86a12]", dot: "bg-amber" },
  sent: { label: "도움 요청 중", cls: "bg-[#ffe1e6] text-danger", dot: "bg-danger" },
  cancelled: { label: "취소됨", cls: "bg-white/80 text-sub", dot: "bg-mute" },
  resolved: { label: "상황 종료", cls: "bg-mint text-mint-ink", dot: "bg-mint-ink" },
};

export const RESPONSE_LABEL: Record<ResponseStatus, string> = {
  waiting: "응답 기다리는 중",
  seen: "확인했어요",
  calling: "전화 거는 중",
  on_the_way: "가고 있어요",
};

export function AlertStatusChip({ status, className }: { status: AlertStatus; className?: string }) {
  const s = ALERT_STATUS[status];
  return (
    <span className={cx("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold", s.cls, className)}>
      <span className={cx("size-1.5 rounded-full", s.dot, status === "sent" && "animate-pulse")} />
      {s.label}
    </span>
  );
}

/** 지도 느낌의 일러스트 + 핀. 실제 지도는 '지도에서 보기'로 연다 */
function MiniMap({ live }: { live?: boolean }) {
  return (
    <div className="relative h-[104px] overflow-hidden rounded-[18px] bg-[#eef4fb]">
      <svg viewBox="0 0 320 104" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        <ellipse cx="60" cy="96" rx="80" ry="30" fill="#cdeedd" />
        <path d="M230 -10 Q270 30 330 20 L330 -10 Z" fill="#bfdcf5" />
        <path d="M-10 58 L330 40" stroke="#fff" strokeWidth="14" />
        <path d="M-10 30 L330 22" stroke="#fff" strokeWidth="6" />
        <path d="M70 -10 L110 120" stroke="#fff" strokeWidth="9" />
        <path d="M210 -10 L240 120" stroke="#fff" strokeWidth="6" />
      </svg>
      <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        {live && <span className="animate-pulse-ring absolute size-16 rounded-full bg-danger/30" />}
        <span className="absolute size-12 rounded-full bg-danger/15" />
        <span className="relative size-5 rounded-full border-[3px] border-white bg-danger shadow-md" />
      </span>
    </div>
  );
}

export function LocationCard({
  loc,
  live,
  title,
  className,
}: {
  loc: AlertLocation;
  /** 진행 중이라 위치가 계속 갱신되는 중 */
  live?: boolean;
  title?: string;
  className?: string;
}) {
  const now = useNow(10000);
  const has = loc.latitude != null && loc.longitude != null;
  return (
    <Glass className={cx("p-3", className)}>
      {has ? (
        <a href={mapUrl(loc.latitude!, loc.longitude!)} target="_blank" rel="noreferrer" aria-label="지도 앱에서 위치 보기">
          <MiniMap live={live} />
        </a>
      ) : (
        <div className="flex h-[72px] items-center justify-center rounded-[18px] bg-white/50 text-[13px] text-sub">
          {live ? "위치를 확인하는 중이에요…" : "위치 정보가 없어요 (위치 권한이 꺼져 있었어요)"}
        </div>
      )}
      <div className="flex items-start gap-2 px-1.5 pt-3 pb-1">
        <IconPin size={18} className="mt-0.5 shrink-0 text-violet" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{title ?? (live ? "실시간 위치 공유 중" : "마지막 위치")}</p>
          {has && (
            <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
              {loc.address ?? coordText(loc.latitude!, loc.longitude!)}
              {loc.accuracy_m != null && <span className="text-sub"> · 오차 약 {Math.round(loc.accuracy_m)}m</span>}
            </p>
          )}
          {has && loc.location_updated_at && now > 0 && (
            <p className="mt-0.5 text-[12px] text-sub">{timeAgo(loc.location_updated_at, now)} 갱신</p>
          )}
        </div>
        {live && has && <span className="mt-1.5 size-2.5 shrink-0 animate-pulse rounded-full bg-green" />}
      </div>
      {has && (
        <a
          href={mapUrl(loc.latitude!, loc.longitude!)}
          target="_blank"
          rel="noreferrer"
          className="mx-1.5 mt-2 mb-1 flex h-10 items-center justify-center rounded-full bg-white/80 text-[14px] font-bold text-violet"
        >
          지도에서 보기
        </a>
      )}
    </Glass>
  );
}
