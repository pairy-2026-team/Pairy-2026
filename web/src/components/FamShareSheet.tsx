"use client";

// 08_fam_share_1 팸 초대 보내기 (팸 상세 위에 뜨는 바텀시트)

import { useEffect, useState } from "react";
import { copyText, shareLink } from "@/lib/device";
import { useNow } from "@/lib/hooks";
import { famCodeLabel, famInviteUrl, prettyUrl } from "@/lib/format";
import { canWriteNfc, downloadBlob, inviteImage, qrDataUrl, writeNfcUrl } from "@/lib/share";
import type { Fam, MiniMember } from "@/lib/types";
import { AvatarStack, Button, cx, useToast } from "./ui";
import { IconCamera, IconChat, IconLink, IconNfc, IconSend } from "./icons";

export function FamShareSheet({
  open,
  onClose,
  fam,
  members,
  isNew,
  isOwner,
  onRegenerate,
}: {
  open: boolean;
  onClose: () => void;
  fam: Fam;
  members: MiniMember[];
  isNew?: boolean;
  isOwner: boolean;
  onRegenerate: () => Promise<void>;
}) {
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [nfcWaiting, setNfcWaiting] = useState(false);
  const [regen, setRegen] = useState(false);
  const now = useNow(60000);
  const url = famInviteUrl(fam.invite_code);
  const expired = new Date(fam.invite_expires_at).getTime() < now;
  const full = members.length >= fam.max_members;
  const blocked = expired || full;
  const text = `Pairy '${fam.name}' 팸에 초대할게요! 팸 코드 ${famCodeLabel(fam.invite_code)}`;

  useEffect(() => {
    if (!open) return;
    qrDataUrl(url).then(setQr).catch(() => setQr(null));
  }, [open, url]);

  if (!open) return null;

  const copy = async () => toast((await copyText(url)) ? "초대 링크를 복사했어요" : url);

  const kakao = async () => {
    // 카카오 SDK 키가 없으면 기본 공유창(카카오톡 선택)으로
    const r = await shareLink({ title: `${fam.name} 팸 초대`, text, url });
    if (r === "copied") toast("링크를 복사했어요. 카카오톡에 붙여 넣어 주세요");
  };

  const story = async () => {
    const blob = await inviteImage(fam.name, fam.invite_code, url);
    if (!blob) return toast("이미지를 만들지 못했어요");
    const file = new File([blob], `pairy-${fam.invite_code}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fam.name });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    downloadBlob(blob, file.name);
    toast("초대 이미지를 저장했어요. 스토리에 올려 보세요");
  };

  const sms = () => {
    window.location.href = `sms:?&body=${encodeURIComponent(`${text}\n${url}`)}`;
  };

  const nfc = async () => {
    if (!canWriteNfc()) return toast("NFC 쓰기는 안드로이드 크롬에서만 돼요. QR이나 링크를 써 주세요");
    setNfcWaiting(true);
    try {
      await writeNfcUrl(url);
      toast("NFC 태그에 초대 링크를 저장했어요");
    } catch {
      toast("NFC 태그에 쓰지 못했어요. 다시 대 주세요");
    } finally {
      setNfcWaiting(false);
    }
  };

  const actions = [
    { label: "카카오톡", icon: <IconChat size={24} />, onClick: kakao },
    { label: "스토리", icon: <IconCamera size={24} />, onClick: story },
    { label: "메시지", icon: <IconSend size={24} />, onClick: sms },
    { label: "NFC", icon: <IconNfc size={26} />, onClick: nfc },
  ];

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col" onClick={onClose}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#5b3fe0] via-[#7d55d6] to-[#a77ad8]" />

      {/* 위쪽 팸 카드 */}
      <div className="pt-safe relative flex flex-1 items-start justify-center px-14 pt-14">
        <div className="w-full rounded-[28px] border border-white/60 bg-white/25 p-6 text-ink backdrop-blur-md">
          {isNew && <p className="mb-1 text-[13px] font-bold text-white">🎉 팸이 만들어졌어요</p>}
          <p className="text-[21px] font-bold">{fam.name}</p>
          <p className="mt-1 text-[14px] text-ink-2">{members.length}명이 함께해요</p>
          <div className="mt-4">
            <AvatarStack people={members} size={36} max={5} />
          </div>
        </div>
      </div>

      <div
        className="pb-safe animate-slide-up relative rounded-t-[34px] bg-[#f6f3fc]/95 px-5 pt-3 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1.5 w-11 rounded-full bg-[#d6cff0]" />
        <h3 className="text-[20px] font-bold">팸 초대 보내기</h3>

        <div className="glass mt-4 flex h-14 items-center gap-3 rounded-full pr-2 pl-5">
          <IconLink size={20} className="shrink-0 text-ink-2" />
          <span className={cx("min-w-0 flex-1 truncate text-[16px] font-bold", blocked && "text-mute line-through")}>
            {prettyUrl(url)}
          </span>
          <button onClick={copy} disabled={blocked} className="grad-primary h-10 rounded-full px-5 text-[14px] font-bold text-white disabled:opacity-40">
            복사
          </button>
        </div>

        <div className="glass mt-4 flex items-center gap-4 rounded-[26px] p-4">
          <div className={cx("size-[112px] shrink-0 overflow-hidden rounded-2xl bg-white p-1.5", blocked && "opacity-25 blur-[1px]")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr ? <img src={qr} alt="팸 초대 QR" className="size-full" /> : <div className="size-full animate-pulse rounded-xl bg-lilac" />}
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-bold">QR로 바로 합류</p>
            <p className="mt-1 text-[13px] leading-relaxed text-sub">
              {expired
                ? "팸 코드가 만료됐어요."
                : full
                  ? "팸 인원이 가득 찼어요."
                  : "친구가 카메라로 스캔하면 우리 팸에 들어와요."}
            </p>
            <p className="mt-1 text-[13px] font-bold text-violet">{famCodeLabel(fam.invite_code)}</p>
          </div>
        </div>

        {expired && isOwner && (
          <Button
            variant="glass"
            size="md"
            className="mt-3 w-full"
            loading={regen}
            onClick={async () => {
              setRegen(true);
              await onRegenerate();
              setRegen(false);
            }}
          >
            새 팸 코드 만들기
          </Button>
        )}

        <div className="mt-6 grid grid-cols-4">
          {actions.map((a) => (
            <button key={a.label} onClick={a.onClick} disabled={blocked} className="flex flex-col items-center gap-2 disabled:opacity-40">
              <span className="grad-primary flex size-14 items-center justify-center rounded-full text-white shadow-[0_8px_18px_-8px_rgba(91,63,224,0.9)]">
                {a.icon}
              </span>
              <span className="text-[13px] font-bold">{a.label}</span>
            </button>
          ))}
        </div>
        {nfcWaiting && <p className="mt-3 text-center text-[13px] font-semibold text-violet">NFC 태그를 폰 뒷면에 대 주세요…</p>}

        <button onClick={onClose} className="mt-8 mb-2 w-full py-2 text-[15px] text-sub">
          닫기
        </button>
      </div>
    </div>
  );
}
