"use client";

// 15_danger_settings 위험 감지 설정 (바꾼 뒤 '저장하기')

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, demoApi } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { errorMessage } from "@/lib/errors";
import { Button, ErrorState, Glass, Loading, Toggle, TopBar, cx, useToast } from "@/components/ui";
import { IconPulse } from "@/components/icons";
import type { SafetySettings, Sensitivity } from "@/lib/types";

const SENS: { value: Sensitivity; label: string; desc: string }[] = [
  { value: "low", label: "낮음", desc: "세게 넘어졌을 때만 감지해요 · 뛰거나 운동할 때 오작동이 적어요" },
  { value: "normal", label: "보통", desc: "일상에서 넘어지는 것을 감지해요 · 추천" },
  { value: "high", label: "높음", desc: "작은 충격에도 감지해요 · 혼자 다니거나 몸이 불편할 때" },
];
const WAITS = [5, 10, 30];

type Form = Omit<SafetySettings, "user_id">;
const pick = (s: SafetySettings): Form => ({
  fall_detection_enabled: s.fall_detection_enabled,
  notify_fams: s.notify_fams,
  notify_friends: s.notify_friends,
  fall_sensitivity: s.fall_sensitivity,
  wait_seconds: s.wait_seconds,
  geofence_enabled: s.geofence_enabled,
  inactivity_alert_enabled: s.inactivity_alert_enabled,
});

export default function SafetySettingsPage() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [settings, recipients] = await Promise.all([api.getSafety(), api.getRecipientCount()]);
    return { settings, recipients };
  });
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "설정을 불러오지 못했어요."} onRetry={() => reload()} />;
  return <SettingsForm initial={data.settings} recipients={data.recipients} onSaved={() => reload(true)} />;
}

function SettingsForm({
  initial,
  recipients,
  onSaved,
}: {
  initial: SafetySettings;
  recipients: number;
  onSaved: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState<Form>(pick(initial));
  const [form, setForm] = useState<Form>(pick(initial));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const sensIdx = SENS.findIndex((s) => s.value === form.fall_sensitivity);

  const save = async () => {
    setSaving(true);
    try {
      const s = await api.saveSafety(form);
      setSaved(pick(s));
      setForm(pick(s));
      toast("저장했어요");
      onSaved();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100dvh-7rem)] flex-col px-5">
      <TopBar back="/my" backStyle="circle" title="위험 감지 설정" className="-mx-5" />

      {/* 한눈에 보는 지금 설정 */}
      <Glass className="mb-4 flex items-center gap-3 rounded-[24px] px-4 py-3.5">
        <span
          className={cx(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-white",
            form.fall_detection_enabled ? "grad-primary" : "bg-mute",
          )}
        >
          <IconPulse size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold">낙상 감지</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-sub">
            {form.fall_detection_enabled
              ? `넘어지면 ${form.wait_seconds}초 기다린 뒤 ${recipientText(form, recipients)}`
              : "꺼져 있어요 · 넘어져도 아무에게도 알리지 않아요"}
          </p>
        </div>
        <Toggle
          label="낙상 감지"
          checked={form.fall_detection_enabled}
          onChange={(v) => set({ fall_detection_enabled: v })}
        />
      </Glass>

      <div className={cx("transition", !form.fall_detection_enabled && "pointer-events-none opacity-45")}>
      <Glass className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold">낙상 감지 민감도</h2>
          <span className="text-[15px] font-bold text-violet">{SENS[sensIdx].label}</span>
        </div>
        <div className="relative mt-6 h-8">
          <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-white" />
          <div className="grad-primary absolute top-1/2 left-0 h-[5px] -translate-y-1/2 rounded-full" style={{ width: `${sensIdx * 50}%` }} />
          <span
            className="absolute top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md transition-[left]"
            style={{ left: `${sensIdx * 50}%` }}
          >
            <span className="grad-primary size-5 rounded-full" />
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={sensIdx}
            aria-label="낙상 감지 민감도"
            aria-valuetext={SENS[sensIdx].label}
            onChange={(e) => set({ fall_sensitivity: SENS[Number(e.target.value)].value })}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="mt-2 flex justify-between text-[13px]">
          {SENS.map((s, i) => (
            <button
              key={s.value}
              onClick={() => set({ fall_sensitivity: s.value })}
              className={cx(i === sensIdx ? "font-bold text-violet" : "text-sub")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-3 rounded-[14px] bg-white/55 px-3 py-2 text-[13px] leading-snug text-ink-2">{SENS[sensIdx].desc}</p>
      </Glass>

      <Glass className="mt-4 p-5">
        <h2 className="text-[17px] font-bold">응답 대기 시간</h2>
        <p className="mt-1 text-[13px] text-sub">넘어진 뒤 이 시간 안에 &lsquo;괜찮아요&rsquo;를 누르지 않으면 알림이 가요</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {WAITS.map((w) => (
            <button
              key={w}
              onClick={() => set({ wait_seconds: w })}
              className={cx(
                "h-11 rounded-full text-[16px] font-bold transition",
                form.wait_seconds === w ? "grad-primary text-white shadow-[0_6px_16px_-8px_rgba(91,63,224,0.9)]" : "glass text-ink",
              )}
            >
              {w}초
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="mt-4 px-5 py-2">
        <div className="flex items-center justify-between pt-3 pb-1">
          <h2 className="text-[17px] font-bold">알림 받을 사람</h2>
          <span className="text-[13px] font-bold text-violet">지금 {recipients}명</span>
        </div>
        <Row title="우리 팸" desc="같은 팸 멤버 모두에게 위치와 함께 알려요">
          <Toggle label="팸에게 알림" checked={form.notify_fams} onChange={(v) => set({ notify_fams: v })} />
        </Row>
        <Row title="친구" desc="팸이 아닌 친구에게도 알려요">
          <Toggle label="친구에게 알림" checked={form.notify_friends} onChange={(v) => set({ notify_friends: v })} />
        </Row>
        {!form.notify_fams && !form.notify_friends && (
          <p className="pb-3 text-[13px] font-semibold text-danger">아무도 선택하지 않으면 넘어져도 알림이 가지 않아요</p>
        )}
      </Glass>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
        <button onClick={() => router.push("/fall?source=test")} className="text-[14px] font-semibold text-sub underline underline-offset-4">
          낙상 감지 테스트해 보기
        </button>
        {api.mode === "demo" && (
          <div className="flex gap-4 text-[13px] text-sub">
            <button onClick={async () => router.push(`/alerts/${await demoApi.simulateIncoming()}`)} className="underline">
              데모: 팸 멤버가 넘어진 상황
            </button>
            <button
              onClick={() => {
                demoApi.reset();
                toast("데모 데이터를 초기화했어요");
                onSaved();
              }}
              className="underline"
            >
              데모 초기화
            </button>
          </div>
        )}
      </div>

      <Glass className="px-5 py-2">
        <Row title="안전 구역 이탈 알림" desc="집·학교 밖으로 나가면 알려요">
          <Toggle label="안전 구역 이탈 알림" checked={form.geofence_enabled} onChange={(v) => set({ geofence_enabled: v })} />
        </Row>
        <Row title="장시간 무움직임 알림" desc="2시간 이상 움직임이 없을 때">
          <Toggle
            label="장시간 무움직임 알림"
            checked={form.inactivity_alert_enabled}
            onChange={(v) => set({ inactivity_alert_enabled: v })}
          />
        </Row>
      </Glass>

      <Button className="mt-4" onClick={save} loading={saving} disabled={!dirty}>
        {dirty ? "저장하기" : "저장됨"}
      </Button>
    </main>
  );
}

function recipientText(f: Form, saved: number) {
  const who = [f.notify_fams && "팸", f.notify_friends && "친구"].filter(Boolean).join("·");
  if (!who) return "알릴 사람이 없어요";
  return `${who} ${saved}명에게 알려요`;
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-white/80 py-3.5 first:border-t-0">
      <div className="flex-1">
        <p className="text-[16px] font-bold">{title}</p>
        <p className="mt-0.5 text-[13px] text-sub">{desc}</p>
      </div>
      {children}
    </div>
  );
}
