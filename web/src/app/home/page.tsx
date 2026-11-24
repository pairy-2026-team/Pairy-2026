"use client";

// 01_home_1 홈 대시보드: 걸음 수 · 키링 상태 · 바로가기 · 우리 팸

import Link from "next/link";
import { api } from "@/lib/api";
import { useAlertRefresh, useLoad } from "@/lib/hooks";
import { n } from "@/lib/format";
import { timeAgo } from "@/lib/date";
import { Avatar, ErrorState, Glass, IconBubble, Loading, Pill, Sparkles, cx } from "@/components/ui";
import { IconBell, IconCard, IconChevron, IconNfc, IconShield, IconUsers, PairyLogo } from "@/components/icons";
import { LiveDot, StepRing, useLiveSteps } from "@/components/Steps";
import { AlertBadge } from "@/components/AlertListener";
import { FamCard } from "@/components/FamCard";
import type { HomeData, Sensitivity } from "@/lib/types";

const SENS_LABEL: Record<Sensitivity, string> = { low: "낮음", normal: "보통", high: "높음" };

export default function HomePage() {
  const { data, error, loading, reload } = useLoad(() => api.getHome());
  useAlertRefresh(() => reload(true), 15000);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "불러오지 못했어요."} onRetry={() => reload()} />;
  return <Home data={data} />;
}

function Home({ data }: { data: HomeData }) {
  const { me, incomingAlerts } = data;
  const fam = data.fams[0];

  return (
    <main className="relative px-5">
      <Sparkles
        spots={[
          { top: "92px", left: "44%", size: 12 },
          { top: "86px", left: "74%", size: 10 },
          { top: "108px", left: "86%", size: 18 },
        ]}
      />

      <header className="pt-safe flex items-center justify-between pt-5">
        <div className="flex items-center gap-2">
          <PairyLogo size={32} />
          <span className="text-[23px] font-bold tracking-tight">Pairy</span>
        </div>
        <Link href="/alerts" aria-label="알림" className="glass relative flex size-11 items-center justify-center rounded-full">
          <IconBell size={22} />
          {incomingAlerts.length > 0 && <span className="absolute top-2 right-2.5 size-2.5 rounded-full bg-danger ring-2 ring-white" />}
        </Link>
      </header>

      <section className="pt-5 pb-4">
        <h1 className="text-[27px] font-bold tracking-tight">안녕, {me.nickname}!</h1>
        <p className="mt-1 text-[15px] text-sub">오늘도 반짝이는 하루예요</p>
      </section>

      {/* 팸 멤버 긴급 알림 */}
      {incomingAlerts.map((a) => (
        <Glass key={a.id} href={`/alerts/${a.id}`} className="mb-3 flex items-center gap-3 border-[#ffb3c0] p-4">
          <Avatar name={a.nickname} id={a.user_id} size={46} ring="#e8445e" badge={<AlertBadge />} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold">{a.nickname}님에게 낙상이 감지됐어요</p>
            <p className="text-[13px] text-sub">{timeAgo(a.sent_at)} · 눌러서 확인하기</p>
          </div>
          <IconChevron className="text-sub" />
        </Glass>
      ))}

      <StepsCard data={data} />

      {/* 바로가기 */}
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <QuickTile href="/nfc" icon={<IconNfc size={24} />} title="NFC 태그" desc="친구와 교환" />
        <QuickTile href="/card" icon={<IconCard size={22} />} title="내 명함" desc="보기 · 공유" />
        <QuickTile href="/fam/new" icon={<IconUsers size={22} />} title="팸 만들기" desc="번호로 초대" />
      </div>

      <SafetyCard data={data} />

      {/* 우리 팸 */}
      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[18px] font-bold">우리 팸</h2>
          <Link href="/fam" className="text-[14px] font-bold text-violet">
            모두 보기
          </Link>
        </div>
        {fam ? (
          <FamCard fam={fam} meId={me.id} />
        ) : (
          <Glass className="text-center">
            <p className="text-[16px] font-bold">아직 팸이 없어요</p>
            <p className="mt-1 text-[14px] text-sub">친구를 골라 우리 팸을 만들어 보세요</p>
            <Link href="/fam/new" className="grad-primary mt-4 inline-flex h-10 items-center rounded-full px-5 text-[14px] font-bold text-white">
              팸 만들기
            </Link>
          </Glass>
        )}
      </section>
    </main>
  );
}

function StepsCard({ data }: { data: HomeData }) {
  const { steps, pulse } = useLiveSteps({ steps: data.stepsToday });
  const alert = data.myActiveAlert;
  const left = Math.max(0, data.stepGoal - steps);
  return (
    <Glass className="relative flex flex-col items-center px-5 pt-5 pb-5">
      <LiveDot className="absolute top-4 right-5" />
      <Link href="/steps" aria-label="걸음 수 자세히 보기" className="flex flex-col items-center">
        <StepRing steps={steps} goal={data.stepGoal} pulse={pulse} />
        <span className="mt-1 text-[13px] font-semibold text-ink-2">
          {left === 0 ? "오늘 목표를 달성했어요!" : `목표까지 ${n(left)}걸음`}
        </span>
      </Link>

      {alert ? (
        <Link
          href={alert.status === "countdown" ? `/fall?id=${alert.id}` : `/fall/${alert.id}/sent`}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#ffe1e6] px-5 py-2.5 text-[14px] font-bold text-danger"
        >
          <span className="size-2 rounded-full bg-danger" />
          {alert.status === "countdown" ? "낙상 감지됨 · 확인하기" : "도움 요청 중 · 상태 보기"}
        </Link>
      ) : data.device === "disconnected" ? (
        <Pill className="mt-4 bg-[#fff0dc] px-5 py-2.5 text-[14px] text-[#b86a12]">
          <span className="size-2 rounded-full bg-amber" />
          키링 연결 끊김
        </Pill>
      ) : (
        <Pill className="mt-4 bg-mint px-5 py-2.5 text-[14px] text-mint-ink">
          <span className="size-2 rounded-full bg-mint-ink" />
          {data.device === "connected" ? "정상 · 키링 연결됨" : "정상 · 안전 감지 중"}
        </Pill>
      )}
    </Glass>
  );
}

/** safety_settings 요약: 지금 어떤 조건으로 지켜지고 있는지 한눈에 */
function SafetyCard({ data }: { data: HomeData }) {
  const s = data.safety;
  const on = s.fall_detection_enabled;
  const who = [s.notify_fams && "팸", s.notify_friends && "친구"].filter(Boolean).join("·") || "없음";
  return (
    <Glass href="/settings/safety" className="mt-3 flex items-center gap-3 rounded-[24px] p-4">
      <span
        className={cx(
          "flex size-11 shrink-0 items-center justify-center rounded-full text-white",
          on ? "grad-primary" : "bg-mute",
        )}
      >
        <IconShield size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold">
          낙상 감지 {on ? "켜짐" : "꺼짐"}
          {on && <span className="ml-1.5 text-[13px] font-semibold text-violet">민감도 {SENS_LABEL[s.fall_sensitivity]}</span>}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] text-sub">
          {on
            ? `응답 없으면 ${s.wait_seconds}초 뒤 ${who} ${data.recipientCount}명에게 알림`
            : "넘어져도 알림이 가지 않아요 · 눌러서 설정"}
        </p>
      </div>
      <IconChevron className="text-sub" />
    </Glass>
  );
}

function QuickTile({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Glass href={href} className="rounded-[22px] p-3.5">
      <IconBubble size={38}>{icon}</IconBubble>
      <p className="mt-3 text-[15px] font-bold">{title}</p>
      <p className="mt-0.5 text-[12px] text-sub">{desc}</p>
    </Glass>
  );
}
