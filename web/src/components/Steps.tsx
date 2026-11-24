"use client";

// 걸음 수 공통 부품: 실시간 구독 훅 · 링 · 목표 설정 시트
//   키링(MPU-6050)이 센 걸음 -> device-sync 가 daily_steps 에 저장 -> Supabase Realtime -> 여기

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { n } from "@/lib/format";
import { Button, Sheet, cx, useToast } from "./ui";
import { IconMinus, IconPlus } from "./icons";

/**
 * 오늘 걸음 수를 실시간으로 받는다.
 * - Realtime 으로 바로 반영 + 30초마다 다시 불러오기(실시간 연결이 끊겨도 맞춰지게)
 * - 화면에 다시 돌아오면 바로 새로고침
 */
export function useLiveSteps(initial: { steps: number; updatedAt?: string | null }) {
  const [steps, setSteps] = useState(initial.steps);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initial.updatedAt ?? null);
  const [pulse, setPulse] = useState(0); // 새 값이 들어올 때마다 1씩 (깜빡임 효과)

  useEffect(() => {
    let alive = true;
    const apply = (v: number, at: string | null) => {
      if (!alive) return;
      setSteps((prev) => {
        if (v !== prev) setPulse((p) => p + 1);
        return v;
      });
      if (at) setUpdatedAt(at);
    };
    const unsub = api.subscribeSteps((v, at) => apply(v, at));
    const refresh = () =>
      api
        .getSteps()
        .then((d) => apply(d.today, d.updatedAt))
        .catch(() => {});
    const t = setInterval(refresh, 30000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      unsub();
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return { steps, updatedAt, pulse };
}

/** 숫자가 바뀔 때 부드럽게 올라가는 표시 */
export function useCountUp(value: number, ms = 600) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - k, 3)));
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms]);
  return shown;
}

/** 시안 01_home 의 걸음 링 (핑크 → 보라 → 민트) */
export function StepRing({
  steps,
  goal,
  size = 168,
  pulse = 0,
}: {
  steps: number;
  goal: number;
  size?: number;
  pulse?: number;
}) {
  const shown = useCountUp(steps);
  const pct = goal > 0 ? Math.min(1, steps / goal) : 0;
  const R = 84;
  const C = 2 * Math.PI * R;
  const big = size >= 200;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" className="size-full -rotate-90">
        <defs>
          <linearGradient id="steps-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F472B6" />
            <stop offset="0.5" stopColor="#A855F7" />
            <stop offset="1" stopColor="#5FC4B8" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={R} stroke="rgba(255,255,255,0.6)" strokeWidth="14" fill="none" />
        <circle
          cx="100"
          cy="100"
          r={R}
          stroke="url(#steps-grad)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.max(pct, 0.02))}
          style={{ transition: "stroke-dashoffset 0.9s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cx("text-ink-2", big ? "text-[15px]" : "text-[14px]")}>오늘 걸음</span>
        <span
          key={pulse}
          className={cx(
            "leading-tight font-bold tabular-nums",
            big ? "text-[44px]" : "text-[34px]",
            pulse > 0 && "animate-step-bump",
          )}
        >
          {n(shown)}
        </span>
        <span className={cx("text-sub", big ? "text-[14px]" : "text-[13px]")}>목표 {n(goal)}</span>
      </div>
    </div>
  );
}

/** "● 실시간" 표시 */
export function LiveDot({ label = "실시간", className }: { label?: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[12px] font-bold text-mint-ink", className)}>
      <span className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-green opacity-70" />
        <span className="relative size-2 rounded-full bg-green" />
      </span>
      {label}
    </span>
  );
}

const PRESETS = [3000, 5000, 7000, 10000];
const MIN = 1000;
const MAX = 50000;
const STEP = 500;

/** 하루 걸음 목표 바꾸기 */
export function GoalSheet({
  open,
  goal,
  onClose,
  onSaved,
}: {
  open: boolean;
  goal: number;
  onClose: () => void;
  onSaved: (goal: number) => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState(goal);
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // 시트를 열 때마다 현재 목표에서 시작
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(goal);
  }

  const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));
  const save = async () => {
    setSaving(true);
    try {
      const g = await api.setStepGoal(value);
      toast(`하루 목표를 ${n(g)}걸음으로 바꿨어요`);
      onSaved(g);
      onClose();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <h3 className="text-[20px] font-bold">하루 걸음 목표</h3>
      <p className="mt-1 text-[14px] text-sub">키링이 센 걸음이 이 목표에 닿으면 링이 꽉 차요</p>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          aria-label="500걸음 줄이기"
          onClick={() => setValue((v) => clamp(v - STEP))}
          disabled={value <= MIN}
          className="glass flex size-12 items-center justify-center rounded-full text-violet disabled:opacity-40"
        >
          <IconMinus size={22} />
        </button>
        <div className="text-center">
          <span className="text-[40px] leading-none font-bold tabular-nums">{n(value)}</span>
          <span className="ml-1 text-[16px] font-bold text-sub">걸음</span>
        </div>
        <button
          aria-label="500걸음 늘리기"
          onClick={() => setValue((v) => clamp(v + STEP))}
          disabled={value >= MAX}
          className="glass flex size-12 items-center justify-center rounded-full text-violet disabled:opacity-40"
        >
          <IconPlus size={22} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setValue(p)}
            className={cx(
              "h-10 rounded-full text-[14px] font-bold transition",
              value === p ? "grad-primary text-white" : "glass text-ink",
            )}
          >
            {n(p)}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-[13px] text-sub">약 {(value * 0.7 / 1000).toFixed(1)}km · 500걸음 단위로 바꿀 수 있어요</p>

      <div className="mt-6 pb-2">
        <Button onClick={save} loading={saving} disabled={value === goal}>
          {value === goal ? "지금 목표예요" : "목표 저장하기"}
        </Button>
      </div>
    </Sheet>
  );
}
