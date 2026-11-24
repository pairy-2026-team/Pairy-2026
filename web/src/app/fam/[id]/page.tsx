"use client";

// 07_fam_detail_1 팸 상세 (+ ?share=1 이면 08_fam_share_1 시트)

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/api";
import { useAlertRefresh, useLoad } from "@/lib/hooks";
import { errorMessage } from "@/lib/errors";
import { copyText } from "@/lib/device";
import { famCodeLabel, n } from "@/lib/format";
import {
  Avatar,
  AvatarStack,
  Button,
  ConfirmSheet,
  ErrorState,
  Glass,
  Loading,
  Sheet,
  TopBar,
  useToast,
} from "@/components/ui";
import { IconCopy, IconPlus, IconSend } from "@/components/icons";
import { AlertBadge } from "@/components/AlertListener";
import { FamShareSheet } from "@/components/FamShareSheet";
import type { FamMember } from "@/lib/types";

function shortDate(iso: string) {
  const d = new Date(iso);
  const m = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric" }).format(d).replace(/\D/g, "");
  const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", day: "numeric" }).format(d).replace(/\D/g, "");
  return `${m}.${day}`;
}

function FamDetail() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { data, setData, error, loading, reload } = useLoad(async () => {
    const [d, me] = await Promise.all([api.getFam(id), api.getMe()]);
    return { ...d, me };
  }, [id]);
  useAlertRefresh(() => reload(true), 20000);
  const shareOpen = sp.get("share") === "1";
  const isNew = sp.get("new") === "1";
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [target, setTarget] = useState<FamMember | null>(null);
  const [kickOpen, setKickOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const setShare = (open: boolean) => router.replace(open ? `/fam/${id}?share=1` : `/fam/${id}`, { scroll: false });

  if (loading && !data) return <Loading />;
  if (error || !data)
    return (
      <>
        <TopBar back="/fam" title="팸" />
        <ErrorState message={error ?? "팸을 찾을 수 없어요."} onRetry={() => reload()} />
      </>
    );

  const { fam, members, stats, me } = data;
  const isOwner = fam.owner_id === me.id;
  const nextOwner = members.find((m) => m.user_id !== me.id);

  const leave = async () => {
    setBusy(true);
    try {
      await api.leaveFam(fam.id);
      toast(`${fam.name}에서 나왔어요`);
      router.replace("/fam");
    } catch (e) {
      toast(errorMessage(e));
      setBusy(false);
    }
  };

  const kick = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.kickFamMember(fam.id, target.user_id);
      toast(`${target.nickname}님을 내보냈어요`);
      setKickOpen(false);
      setTarget(null);
      await reload(true);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="px-5">
      <TopBar
        back="/fam"
        title="팸"
        className="-mx-5"
        right={
          <button aria-label="팸 초대 공유" onClick={() => setShare(true)} className="flex size-10 items-center justify-center text-ink">
            <IconSend size={24} />
          </button>
        }
      />

      <Glass className="p-4">
        <h1 className="text-[23px] font-bold">{fam.name}</h1>
        <p className="mt-1 text-[14px] text-sub">
          {members.length}명 · 만든 날 {shortDate(fam.created_at)}
        </p>
        <div className="mt-4">
          <AvatarStack people={members} size={42} max={6} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="glass rounded-[22px] p-4">
            <p className="text-[13px] text-ink-2">오늘 함께</p>
            <p className="mt-2 text-[25px] leading-none font-bold tabular-nums">{n(stats.today_steps)}</p>
            <p className="mt-2 text-[13px] text-sub">걸음</p>
          </div>
          <div className="glass rounded-[22px] p-4">
            <p className="text-[13px] text-ink-2">키링 맞댄 횟수</p>
            <p className="mt-2 text-[25px] leading-none font-bold tabular-nums">{n(stats.meet_total)}</p>
            <p className="mt-2 text-[13px] text-sub">번</p>
          </div>
        </div>
      </Glass>

      <div className="mt-4 mb-2 flex items-center justify-between">
        <h2 className="text-[18px] font-bold">멤버</h2>
        <span className="text-[15px] font-bold text-violet">{members.length}명</span>
      </div>
      <div className="grid grid-cols-4 gap-y-3">
        {members.map((m) => {
          const danger = stats.alert_user_ids.includes(m.user_id);
          const mine = m.user_id === me.id;
          return (
            <button
              key={m.user_id}
              onClick={() => isOwner && !mine && setTarget(m)}
              className="flex flex-col items-center gap-1.5"
              aria-label={`${m.nickname}${danger ? " (긴급)" : ""}`}
            >
              <Avatar
                name={m.nickname}
                id={m.user_id}
                size={60}
                ring={danger ? "#ff9f43" : "#2cc495"}
                badge={danger ? <AlertBadge /> : undefined}
              />
              <span className="text-[14px] font-bold">
                {m.nickname}
                {m.role === "owner" && <span className="ml-0.5 text-[11px]">👑</span>}
              </span>
            </button>
          );
        })}
        <button onClick={() => setShare(true)} className="flex flex-col items-center gap-1.5">
          <span className="flex size-[60px] items-center justify-center rounded-full border-2 border-dashed border-violet/70 bg-white/40 text-violet">
            <IconPlus size={28} />
          </span>
          <span className="text-[14px] font-bold text-violet">초대</span>
        </button>
      </div>

      <div className="glass mt-4 flex items-center rounded-[22px] py-2.5 pr-3 pl-5">
        <div className="flex-1">
          <p className="text-[13px] text-ink-2">팸 코드</p>
          <p className="text-[19px] font-bold tracking-wide">{famCodeLabel(fam.invite_code)}</p>
        </div>
        <button
          aria-label="팸 코드 복사"
          onClick={async () => toast((await copyText(famCodeLabel(fam.invite_code))) ? "팸 코드를 복사했어요" : famCodeLabel(fam.invite_code))}
          className="glass flex size-12 items-center justify-center rounded-2xl text-ink"
        >
          <IconCopy />
        </button>
      </div>

      <Button className="mt-3" onClick={() => setShare(true)}>
        팸 초대 공유하기
      </Button>

      <button onClick={() => setLeaveOpen(true)} className="mt-5 w-full py-2 text-[13px] text-sub underline">
        팸 나가기
      </button>

      <FamShareSheet
        open={shareOpen}
        onClose={() => setShare(false)}
        fam={fam}
        members={members}
        isNew={isNew}
        isOwner={isOwner}
        onRegenerate={async () => {
          try {
            const f = await api.regenerateFamCode(fam.id);
            setData((d) => (d ? { ...d, fam: f } : d));
            toast("새 팸 코드를 만들었어요");
          } catch (e) {
            toast(errorMessage(e));
          }
        }}
      />

      <Sheet open={!!target && !kickOpen} onClose={() => setTarget(null)}>
        {target && (
          <div className="pb-2">
            <div className="flex items-center gap-3">
              <Avatar name={target.nickname} id={target.user_id} size={54} />
              <p className="text-[20px] font-bold">{target.nickname}</p>
            </div>
            <Button variant="ghost" className="mt-5 text-danger" onClick={() => setKickOpen(true)}>
              팸에서 내보내기
            </Button>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={kickOpen}
        title={`${target?.nickname}님을 내보낼까요?`}
        desc="내보내면 이 팸의 긴급 알림을 더 이상 주고받지 않아요."
        confirmLabel="내보내기"
        danger
        loading={busy}
        onConfirm={kick}
        onClose={() => {
          setKickOpen(false);
          setTarget(null);
        }}
      />

      <ConfirmSheet
        open={leaveOpen}
        title={`${fam.name}에서 나갈까요?`}
        desc={
          isOwner
            ? nextOwner
              ? `팸장은 ${nextOwner.nickname}님에게 넘어가요. 나가면 팸 멤버의 긴급 알림을 받지 않아요.`
              : "혼자 있는 팸이라 나가면 팸이 삭제돼요."
            : "나가면 팸 멤버의 긴급 알림을 받지 않아요."
        }
        confirmLabel="나가기"
        danger
        loading={busy}
        onConfirm={leave}
        onClose={() => setLeaveOpen(false)}
      />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <FamDetail />
    </Suspense>
  );
}
