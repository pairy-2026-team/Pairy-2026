"use client";

// 걸음 수 자세히: 오늘 걸음(실시간) · 목표 달성률 · 최근 7일 · 하루 목표 바꾸기
//   데이터: daily_steps (키링이 올림) + profiles.step_goal

import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad, useNow } from "@/lib/hooks";
import { kstDate, timeAgo, weekdayLabel } from "@/lib/date";
import { n } from "@/lib/format";
import { ErrorState, Glass, IconBubble, Loading, Sparkles, TopBar, cx } from "@/components/ui";
import { IconFoot, IconTarget } from "@/components/icons";
import { GoalSheet, LiveDot, StepRing, useLiveSteps } from "@/components/Steps";
import type { StepsData } from "@/lib/types";

export default function StepsPage() {
  const { data, setData, error, loading, reload } = useLoad(() => api.getSteps());
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "걸음 수를 불러오지 못했어요."} onRetry={() => reload()} />;
  return <Steps data={data} onGoal={(goal) => setData({ ...data, goal })} />;
}

function Steps({ data, onGoal }: { data: StepsData; onGoal: (goal: number) => void }) {
  const { steps, updatedAt, pulse } = useLiveSteps({ steps: data.today, updatedAt: data.updatedAt });
  const now = useNow(5000);
  const [goalOpen, setGoalOpen] = useState(false);
  const goal = data.goal;
  const pct = Math.round((steps / goal) * 100);
  const left = Math.max(0, goal - steps);
  const km = (steps * 0.7) / 1000;

  // 오늘 값은 실시간 값으로 바꿔 끼움
  const today = kstDate();
  const week = data.week.map((d) => (d.day === today ? { ...d, steps } : d));
  const max = Math.max(goal, ...week.map((d) => d.steps)) * 1.1;
  const hit = week.filter((d) => d.steps >= goal).length;
  const avg = Math.round(week.reduce((a, d) => a + d.steps, 0) / week.length);

  return (
    <main className="relative px-5">
      <TopBar back="/home" backStyle="circle" title="걸음 수" className="-mx-5" />
      <Sparkles spots={[{ top: "90px", left: "12%" }, { top: "120px", left: "86%", size: 18 }, { top: "300px", left: "84%", size: 10 }]} />

      <Glass className="relative flex flex-col items-center pt-6 pb-5">
        <LiveDot className="absolute top-4 right-5" />
        <StepRing steps={steps} goal={goal} size={220} pulse={pulse} />
        <p className="mt-3 text-[15px] font-bold">
          {left === 0 ? "🎉 오늘 목표를 달성했어요!" : `목표까지 ${n(left)}걸음 남았어요`}
        </p>
        <p className="mt-1 text-[12.5px] text-sub">
          {updatedAt && now ? `키링에서 ${timeAgo(updatedAt, now)} 받음` : "키링이 걸음을 보내면 바로 바뀌어요"}
        </p>
      </Glass>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <Stat label="달성률" value={`${pct}%`} />
        <Stat label="이동 거리" value={`${km.toFixed(1)}km`} />
        <Stat label="소모 열량" value={`${n(Math.round(steps * 0.04))}kcal`} />
      </div>

      {/* 하루 목표 */}
      <Glass className="mt-3 flex items-center gap-3 rounded-[24px] p-4">
        <IconBubble size={44}>
          <IconTarget size={22} />
        </IconBubble>
        <div className="flex-1">
          <p className="text-[13px] text-sub">하루 목표</p>
          <p className="text-[20px] font-bold tabular-nums">{n(goal)}걸음</p>
        </div>
        <button onClick={() => setGoalOpen(true)} className="grad-primary h-10 rounded-full px-5 text-[14px] font-bold text-white">
          목표 바꾸기
        </button>
      </Glass>

      {/* 최근 7일 */}
      <Glass className="mt-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold">최근 7일</h2>
          <span className="text-[13px] font-bold text-violet">목표 달성 {hit}일</span>
        </div>
        <p className="mt-0.5 text-[13px] text-sub">하루 평균 {n(avg)}걸음</p>

        <div className="relative mt-5 h-[150px]">
          {/* 목표선 */}
          <div className="absolute inset-x-0 border-t-2 border-dashed border-violet/40" style={{ bottom: `${(goal / max) * 100}%` }}>
            <span className="absolute -top-[9px] left-0 rounded-full bg-white/90 px-2 text-[10.5px] leading-4 font-bold text-violet">목표</span>
          </div>
          <div className="absolute inset-0 flex items-end justify-between gap-2">
            {week.map((d) => {
              const isToday = d.day === today;
              const ok = d.steps >= goal;
              return (
                <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end">
                  <span className={cx("mb-1 text-[10.5px] font-bold tabular-nums", isToday ? "text-violet" : "text-sub")}>
                    {d.steps >= 1000 ? `${(d.steps / 1000).toFixed(1)}k` : d.steps}
                  </span>
                  <div
                    className={cx(
                      "w-full max-w-[30px] rounded-full transition-[height] duration-700",
                      isToday || ok ? "grad-primary" : "bg-white/80",
                    )}
                    style={{ height: `${Math.max(4, (d.steps / max) * 100)}%`, opacity: isToday || ok ? 1 : 0.9 }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex justify-between gap-2">
          {week.map((d) => (
            <span key={d.day} className={cx("flex-1 text-center text-[12px] font-bold", d.day === today ? "text-violet" : "text-ink-2")}>
              {d.day === today ? "오늘" : weekdayLabel(d.day)}
            </span>
          ))}
        </div>
      </Glass>

      <p className="mt-4 mb-2 flex items-center justify-center gap-1.5 text-[12.5px] text-sub">
        <IconFoot size={15} /> 키링을 가방에 달고 걸으면 자동으로 세요
      </p>

      <GoalSheet open={goalOpen} goal={goal} onClose={() => setGoalOpen(false)} onSaved={onGoal} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Glass className="rounded-[22px] p-3.5 text-center">
      <p className="text-[12px] text-sub">{label}</p>
      <p className="mt-1 text-[18px] font-bold tabular-nums">{value}</p>
    </Glass>
  );
}
