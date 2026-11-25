"use client";

// 12_device_scan + 13_device_connected  기기 연결 · 내 기기
//
//  키링 연결 흐름 (블루투스 대신 "기기 ID + 비밀키" 방식)
//    1) [새 키링 등록] -> 서버가 기기 ID와 비밀키를 만들어 줌 (비밀키는 이때 한 번만 보임)
//    2) 펌웨어 secrets.h 에 붙여 넣고 업로드
//    3) 키링이 켜지면 10초마다 서버에 보고 -> 이 화면이 "연결됨"으로 바뀜 (5초마다 확인)
//
//  연결 상태는 devices.last_seen_at 으로 판단 (45초 안에 보고했으면 연결됨)
//  낙상 감지 · 위험 알림 토글은 safety_settings 를 바꾸고, 키링은 다음 보고 때 받아 감

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLoad, useNow } from "@/lib/hooks";
import { errorMessage } from "@/lib/errors";
import { copyText } from "@/lib/device";
import { timeAgo } from "@/lib/date";
import {
  Button,
  ConfirmSheet,
  ErrorState,
  Glass,
  IconBubble,
  Loading,
  Sheet,
  Sparkles,
  Toggle,
  TopBar,
  cx,
  useToast,
} from "@/components/ui";
import { IconBell, IconCopy, IconPulse, IconShield, IconUsers } from "@/components/icons";
import { deviceStatus, type Device, type DeviceSecret, type SafetySettings } from "@/lib/types";

export default function DevicePage() {
  const { data, setData, error, loading, reload } = useLoad(async () => {
    const [devices, safety] = await Promise.all([api.listDevices(), api.getSafety()]);
    return { devices, safety };
  });

  // 키링이 보고하면 연결 상태가 바뀌므로 5초마다 조용히 다시 불러옴
  useEffect(() => {
    const t = setInterval(() => reload(true), 5000);
    return () => clearInterval(t);
  }, [reload]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "기기 정보를 불러오지 못했어요."} onRetry={() => reload()} />;
  return (
    <Devices
      devices={data.devices}
      safety={data.safety}
      onSafety={(safety) => setData({ ...data, safety })}
      reload={() => reload(true)}
    />
  );
}

function Devices({
  devices,
  safety,
  onSafety,
  reload,
}: {
  devices: Device[];
  safety: SafetySettings;
  onSafety: (s: SafetySettings) => void;
  reload: () => void;
}) {
  const toast = useToast();
  const [issued, setIssued] = useState<DeviceSecret | null>(null);
  const [registering, setRegistering] = useState(false);
  const [confirm, setConfirm] = useState<null | "remove" | "reset">(null);
  const [busy, setBusy] = useState(false);
  const main = devices[0];

  const register = async () => {
    setRegistering(true);
    try {
      setIssued(await api.registerDevice(devices.length ? `Pairy 키링 ${devices.length + 1}` : undefined));
      reload();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setRegistering(false);
    }
  };

  const doConfirm = async () => {
    if (!main || !confirm) return;
    setBusy(true);
    try {
      if (confirm === "reset") setIssued(await api.resetDeviceSecret(main.id));
      else {
        await api.removeDevice(main.id);
        toast("키링 연결을 해제했어요");
      }
      setConfirm(null);
      reload();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (patch: Partial<SafetySettings>) => {
    const prev = safety;
    onSafety({ ...safety, ...patch }); // 먼저 바꿔 보여 주고
    try {
      onSafety(await api.saveSafety(patch));
    } catch (e) {
      onSafety(prev); // 실패하면 되돌림
      toast(errorMessage(e));
    }
  };

  return (
    <main className="relative px-5 pb-6">
      <TopBar back="/my" backStyle="circle" title={main ? "내 기기" : "기기 연결"} className="-mx-5" />

      {main ? (
        <>
          <KeyringCard device={main} />
          <Stats device={main} />

          <Glass className="mt-3 divide-y divide-black/5 rounded-[24px] px-4 py-1">
            <Row icon={<IconPulse size={20} />} title="낙상 감지" desc="충격 · 무움직임 감지">
              <Toggle
                label="낙상 감지"
                checked={safety.fall_detection_enabled}
                onChange={(v) => toggle({ fall_detection_enabled: v })}
              />
            </Row>
            <Row icon={<IconBell size={20} />} title="위험 알림" desc="팸에게 자동 전송">
              <Toggle label="위험 알림" checked={safety.notify_fams} onChange={(v) => toggle({ notify_fams: v })} />
            </Row>
            <Row icon={<IconShield size={20} />} title="민감도 · 대기 시간" desc="위험 감지 설정에서 바꾸기">
              <Button size="sm" variant="white" href="/settings/safety">
                설정
              </Button>
            </Row>
          </Glass>

          {devices.length > 1 && (
            <p className="mt-3 text-center text-[13px] text-sub">
              등록된 키링 {devices.length}개 · 가장 최근에 연결된 키링을 보여 줘요
            </p>
          )}

          <div className="mt-5 space-y-3">
            <Button variant="glass" onClick={() => setConfirm("reset")}>
              비밀키 다시 받기
            </Button>
            <Button variant="glass" className="text-danger" onClick={() => setConfirm("remove")}>
              기기 연결 해제
            </Button>
            <Button variant="ghost" size="md" className="w-full" onClick={register} loading={registering}>
              키링 하나 더 등록하기
            </Button>
          </div>
        </>
      ) : (
        <Empty onRegister={register} loading={registering} />
      )}

      <IssuedSheet issued={issued} devices={devices} onClose={() => setIssued(null)} />
      <ConfirmSheet
        open={confirm !== null}
        title={confirm === "remove" ? "키링 연결을 해제할까요?" : "비밀키를 다시 받을까요?"}
        desc={
          confirm === "remove"
            ? "해제하면 이 키링의 걸음 수 · 낙상 알림이 더 이상 서버로 오지 않아요. 다시 쓰려면 새로 등록해야 해요."
            : "지금 키링에 들어 있는 비밀키는 바로 쓸 수 없게 돼요. 새 비밀키를 secrets.h 에 넣고 다시 업로드해 주세요."
        }
        confirmLabel={confirm === "remove" ? "해제하기" : "다시 받기"}
        danger={confirm === "remove"}
        loading={busy}
        onConfirm={doConfirm}
        onClose={() => setConfirm(null)}
      />
    </main>
  );
}

/** 키링 모양 (시안 13번의 키링 그림을 CSS로) */
function KeyringArt({ size = 1 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center" style={{ transform: `scale(${size})` }}>
      <span className="size-12 rounded-full border-[6px] border-[#b9a6ff]/80" />
      <span className="grad-primary -mt-2 flex h-[88px] w-[64px] flex-col items-center justify-center gap-1.5 rounded-[22px] shadow-[0_12px_24px_-10px_rgba(91,63,224,0.7)]">
        <span className="size-2.5 rounded-full bg-white/90" />
        <span className="text-[26px] leading-none">🧚</span>
      </span>
    </div>
  );
}

function KeyringCard({ device }: { device: Device }) {
  const now = useNow(5000);
  const st = now ? deviceStatus(device, now) : "unknown";
  return (
    <Glass className="relative flex flex-col items-center px-5 pt-6 pb-5">
      <Sparkles spots={[{ top: "26px", left: "10%" }, { top: "18px", left: "88%", size: 14 }, { top: "150px", left: "86%", size: 10 }]} />
      <KeyringArt />
      <h1 className="mt-4 text-[22px] font-bold">{device.name}</h1>
      <span
        className={cx(
          "mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold",
          st === "connected" ? "bg-mint text-mint-ink" : "bg-[#fff0dc] text-[#b86a12]",
        )}
      >
        <span className={cx("size-2 rounded-full", st === "connected" ? "bg-mint-ink" : "bg-amber")} />
        {st === "connected"
          ? `연결됨 · ${timeAgo(device.last_seen_at, now)} 동기화`
          : device.last_seen_at
            ? `연결 끊김 · ${timeAgo(device.last_seen_at, now)} 마지막 연결`
            : "아직 연결된 적 없어요 · 키링을 켜 주세요"}
      </span>
    </Glass>
  );
}

function Stats({ device }: { device: Device }) {
  const tiles = [
    { icon: <IconPulse size={18} />, value: device.battery != null ? `${device.battery}%` : "—", label: "배터리" },
    { icon: <IconUsers size={18} />, value: `${device.meet_count}번`, label: "키링 맞대기" },
    { icon: <IconShield size={18} />, value: device.last_seen_at ? "정상" : "대기", label: "센서" },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-2.5">
      {tiles.map((t) => (
        <Glass key={t.label} className="rounded-[22px] p-3.5">
          <IconBubble size={34}>{t.icon}</IconBubble>
          <p className="mt-3 text-[20px] font-bold">{t.value}</p>
          <p className="text-[12px] text-sub">{t.label}</p>
        </Glass>
      ))}
    </div>
  );
}

function Row({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lilac text-violet">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold">{title}</p>
        <p className="text-[13px] text-sub">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function Empty({ onRegister, loading }: { onRegister: () => void; loading: boolean }) {
  const steps = [
    ["새 키링 등록", "아래 버튼을 누르면 기기 ID와 비밀키가 나와요"],
    ["펌웨어에 붙여 넣기", "firmware/pariy_keyring/secrets.h 에 넣고 업로드해요"],
    ["키링 켜기", "핫스팟에 연결되면 이 화면이 '연결됨'으로 바뀌어요"],
  ];
  return (
    <>
      <section className="pt-2">
        <h1 className="text-[27px] font-bold">키링을 연결해 볼까요</h1>
        <p className="mt-1 text-[15px] text-sub">연결하면 걸음 수와 낙상 알림이 앱으로 바로 와요</p>
      </section>
      <div className="relative mx-auto my-8 flex size-[220px] items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-white/70 bg-white/10" />
        <span className="animate-pulse-ring absolute inset-[40px] rounded-full bg-white/40" />
        <KeyringArt />
      </div>
      <Glass className="space-y-4 rounded-[24px] p-5">
        {steps.map(([t, d], i) => (
          <div key={t} className="flex gap-3">
            <span className="grad-primary flex size-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white">
              {i + 1}
            </span>
            <div>
              <p className="text-[15px] font-bold">{t}</p>
              <p className="text-[13px] text-sub">{d}</p>
            </div>
          </div>
        ))}
      </Glass>
      <div className="mt-6">
        <Button onClick={onRegister} loading={loading}>
          새 키링 등록
        </Button>
      </div>
    </>
  );
}

/** 발급된 비밀키를 보여 주는 시트. 닫으면 다시 볼 수 없음 */
function IssuedSheet({ issued, devices, onClose }: { issued: DeviceSecret | null; devices: Device[]; onClose: () => void }) {
  const toast = useToast();
  const now = useNow(3000);
  const device = devices.find((d) => d.id === issued?.device_id);
  const connected = now > 0 && deviceStatus(device, now) === "connected";
  const snippet = issued
    ? `#define DEVICE_ID     "${issued.device_id}"\n#define DEVICE_SECRET "${issued.secret}"`
    : "";

  const copy = async (text: string, what: string) => toast((await copyText(text)) ? `${what} 복사했어요` : "복사하지 못했어요");

  return (
    <Sheet open={issued !== null} onClose={onClose}>
      <h3 className="text-[20px] font-bold">키링 비밀키가 나왔어요</h3>
      <p className="mt-1 text-[14px] leading-relaxed text-sub">
        <b className="text-danger">이 창을 닫으면 비밀키를 다시 볼 수 없어요.</b> 아래 두 줄을 펌웨어의 secrets.h 에 붙여
        넣고 업로드해 주세요. (와이파이 · Supabase 주소/키는 단톡방 값)
      </p>
      <pre className="mt-4 rounded-[18px] bg-ink/90 p-4 text-[12px] leading-relaxed break-all whitespace-pre-wrap text-white select-all">
        {snippet}
      </pre>
      <div className="mt-3 flex gap-2">
        <Button size="md" variant="white" className="flex-1" onClick={() => copy(snippet, "두 줄을")}>
          <IconCopy size={18} /> 두 줄 복사
        </Button>
        <Button size="md" variant="glass" className="flex-1" onClick={() => issued && copy(issued.secret, "비밀키를")}>
          비밀키만
        </Button>
      </div>
      <div
        className={cx(
          "mt-4 flex items-center gap-2 rounded-[18px] px-4 py-3 text-[14px] font-bold",
          connected ? "bg-mint text-mint-ink" : "bg-white/70 text-sub",
        )}
      >
        <span className={cx("size-2 rounded-full", connected ? "bg-mint-ink" : "animate-pulse bg-amber")} />
        {connected ? "키링이 연결됐어요!" : "키링을 기다리는 중… 업로드하고 전원을 켜 주세요"}
      </div>
      <div className="mt-5 pb-2">
        <Button onClick={onClose}>{connected ? "완료" : "다 붙여 넣었어요"}</Button>
      </div>
    </Sheet>
  );
}
