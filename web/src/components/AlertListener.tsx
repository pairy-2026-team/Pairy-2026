"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAlertRefresh } from "@/lib/hooks";
import { beep, vibrate } from "@/lib/device";
import type { AlertDetail } from "@/lib/types";
import { Avatar } from "./ui";

const SEEN_KEY = "pairy-seen-alerts";
const readSeen = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]");
  } catch {
    return [];
  }
};

/** 알림 상세를 직접 열었으면 팝업을 다시 띄우지 않음 */
export function markAlertSeen(id: string) {
  try {
    const seen = readSeen();
    if (!seen.includes(id)) sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id].slice(-50)));
  } catch {
    /* 무시 */
  }
}

/**
 * 앱 어디에 있든 팸 멤버의 낙상 알림을 상단에 띄운다 → 누르면 14_danger_alert
 * Supabase Realtime + 8초 폴링(실시간 연결이 끊겨도 놓치지 않게)
 */
export function AlertListener() {
  const path = usePathname() ?? "";
  const [alert, setAlert] = useState<AlertDetail | null>(null);
  const disabled =
    path === "/" || path.startsWith("/login") || path.startsWith("/start") || path.startsWith("/signup") || path.startsWith("/fall");

  const check = useCallback(async () => {
    if (disabled) return;
    try {
      const list = await api.listIncomingAlerts();
      const seen = readSeen();
      const fresh = list.find((a) => !seen.includes(a.id));
      if (fresh) {
        setAlert((prev) => {
          if (prev?.id !== fresh.id) {
            vibrate([400, 150, 400, 150, 400]);
            beep(988, 250);
          }
          return fresh;
        });
      } else setAlert(null);
    } catch {
      /* 로그인 전 등 */
    }
  }, [disabled]);

  useEffect(() => {
    // 화면을 옮길 때마다 확인 (setState는 네트워크 응답 뒤에만 일어남)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
  }, [check, path]);
  useAlertRefresh(check, 8000);

  const dismiss = () => {
    if (!alert) return;
    markAlertSeen(alert.id);
    setAlert(null);
  };

  if (!alert || disabled || path.startsWith(`/alerts/${alert.id}`)) return null;

  return (
    <div className="pt-safe fixed inset-x-0 top-0 z-[70] mx-auto max-w-[430px] px-4">
      <div className="glass animate-slide-up mt-3 rounded-[26px] border-[#ff9fb0] bg-white/85 p-4">
        <div className="flex items-center gap-3">
          <span className="relative">
            <span className="animate-pulse-ring absolute inset-0 rounded-full bg-danger/40" />
            <Avatar
              name={alert.nickname}
              id={alert.user_id}
              size={48}
              ring="#e8445e"
              badge={<AlertBadge />}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-danger">긴급 알림</p>
            <p className="truncate text-[17px] font-bold">
              {alert.nickname}님에게 {alert.kind === "sos" ? "도움 요청이 왔어요" : "낙상이 감지됐어요"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={dismiss} className="glass h-11 flex-1 rounded-full text-[15px] font-bold text-sub">
            나중에
          </button>
          <Link
            href={`/alerts/${alert.id}`}
            onClick={dismiss}
            className="grad-primary flex h-11 flex-[2] items-center justify-center rounded-full text-[15px] font-bold text-white"
          >
            바로 확인하기
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AlertBadge() {
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-amber text-[14px] font-black text-white ring-2 ring-white">
      !
    </span>
  );
}
