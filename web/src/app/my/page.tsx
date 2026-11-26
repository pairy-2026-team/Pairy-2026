"use client";

// 마이 탭: 내 정보 + 명함 · 기기 · 안전 설정으로 가는 메뉴
// (시안에 마이 화면이 따로 없어서 13_device_connected 와 같은 스타일로 구성)

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad, useNow } from "@/lib/hooks";
import { getSupabase, IS_DEMO } from "@/lib/supabase/client";
import { Avatar, ErrorState, Glass, Loading, cx } from "@/components/ui";
import { IconBell, IconCard, IconChevron, IconNfc, IconShield } from "@/components/icons";
import { deviceStatus } from "@/lib/types";

export default function MyPage() {
  const router = useRouter();
  const now = useNow(10000);
  const [leaving, setLeaving] = useState(false);
  const { data, error, loading, reload } = useLoad(async () => {
    const [me, devices] = await Promise.all([api.getMe(), api.listDevices()]);
    return { me, devices };
  });

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "불러오지 못했어요."} onRetry={() => reload()} />;

  const { me, devices } = data;
  const st = now ? deviceStatus(devices[0], now) : "unknown";
  const deviceDesc =
    devices.length === 0 ? "키링 연결하기" : st === "connected" ? "연결됨" : st === "disconnected" ? "연결 끊김" : "";

  const logout = async () => {
    setLeaving(true);
    await getSupabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <main className="px-5 pb-6">
      <header className="pt-safe pt-6 pb-5">
        <h1 className="text-[28px] font-bold">마이</h1>
      </header>

      <Glass href="/card" className="flex items-center gap-4 rounded-[26px] p-5">
        <Avatar name={me.nickname} id={me.id} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[22px] font-bold">{me.nickname}</p>
          <p className="truncate text-[14px] text-sub">
            {me.handle ? `@${me.handle} · ` : ""}친구 번호 {me.friend_code}
          </p>
        </div>
        <IconChevron className="text-sub" />
      </Glass>

      <Glass className="mt-3 divide-y divide-black/5 rounded-[24px] px-4 py-1">
        <MenuRow href="/card" icon={<IconCard size={20} />} title="내 명함" desc="보기 · QR · 링크 공유" />
        <MenuRow href="/nfc" icon={<IconNfc size={20} />} title="NFC 태그" desc="키링에 내 명함 쓰기 · 친구 키링 읽기" />
        <MenuRow
          href="/device"
          icon={<span className="text-[18px]">🧚</span>}
          title="내 기기"
          desc={deviceDesc}
          descClass={st === "connected" ? "text-mint-ink font-semibold" : st === "disconnected" ? "text-[#b86a12] font-semibold" : ""}
        />
        <MenuRow href="/receipt" icon={<span className="text-[18px]">🧾</span>} title="오늘의 갓생 영수증" desc="오늘 걸음 · 맞대기를 영수증으로" />
        <MenuRow href="/settings/safety" icon={<IconShield size={20} />} title="위험 감지 설정" desc="민감도 · 대기 시간 · 알림 받는 사람" />
        <MenuRow href="/alerts" icon={<IconBell size={20} />} title="긴급 알림 기록" desc="내 낙상 · 받은 알림" />
      </Glass>

      {!IS_DEMO && (
        <button
          onClick={logout}
          disabled={leaving}
          className="glass mt-5 h-14 w-full rounded-full text-[16px] font-bold text-sub disabled:opacity-50"
        >
          {leaving ? "로그아웃 중…" : "로그아웃"}
        </button>
      )}
    </main>
  );
}

function MenuRow({
  href,
  icon,
  title,
  desc,
  descClass,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  descClass?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 py-3.5 active:opacity-70">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lilac text-violet">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold">{title}</p>
        {desc && <p className={cx("truncate text-[13px] text-sub", descClass)}>{desc}</p>}
      </div>
      <IconChevron className="text-sub" />
    </Link>
  );
}
