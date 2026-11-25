"use client";

// 04_my_card_1 내 명함 보기
//
//  지금 DB(profiles)에 있는 값만 보여 줌: 닉네임 · @handle · 태그 · 친구 번호
//  시안의 소개 문구 · 학교/전공 · 인스타 · Behance · 포트폴리오 칸은 아직 DB 칼럼이 없음
//    -> profiles 에 칼럼 추가 + api.updateProfile() 을 만들면 여기와 '편집' 화면을 채울 수 있음
//
//  공유: 친구가 내 명함을 받는 주소 = /friends/add?code=<친구 번호>
//    NFC  -> /nfc 에서 키링 태그에 이 주소를 씀
//    QR   -> 아래 QR 버튼
//    링크 -> 아래 링크 버튼

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { copyText, shareLink } from "@/lib/device";
import { qrDataUrl } from "@/lib/share";
import { friendAddUrl } from "@/lib/format";
import { Avatar, Button, ErrorState, Glass, Loading, Sheet, Sparkles, TopBar, useToast } from "@/components/ui";
import { IconLink, IconNfc } from "@/components/icons";
import type { Profile } from "@/lib/types";

export default function MyCardPage() {
  const { data, error, loading, reload } = useLoad(() => api.getMe());
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "명함을 불러오지 못했어요."} onRetry={() => reload()} />;
  return <MyCard me={data} />;
}

function MyCard({ me }: { me: Profile }) {
  const toast = useToast();
  const [qrOpen, setQrOpen] = useState(false);
  const url = friendAddUrl(me.friend_code);

  const share = async () => {
    const r = await shareLink({ title: `${me.nickname}의 Pairy 명함`, text: "Pairy에서 친구해요!", url });
    if (r === "copied") toast("명함 링크를 복사했어요");
    else if (r === "failed") toast("링크를 복사하지 못했어요");
  };

  return (
    <main className="relative px-5 pb-6">
      <TopBar title="내 명함" className="-mx-5" />

      <Glass className="ring-grad relative flex flex-col items-center px-5 pt-7 pb-5">
        <Sparkles spots={[{ top: "18px", left: "8%", size: 14 }, { top: "28px", left: "86%", size: 18 }]} />
        <Avatar name={me.nickname} id={me.id} size={96} ring="linear-gradient(135deg,#8B5CF6,#5ED3C3)" />
        <h1 className="mt-4 text-[28px] font-bold">{me.nickname}</h1>
        {me.handle && <p className="mt-0.5 text-[15px] text-sub">@{me.handle}</p>}

        {me.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {me.tags.map((t) => (
              <span key={t} className="rounded-full bg-white/80 px-4 py-1.5 text-[14px] font-bold text-ink-2">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 w-full rounded-[20px] bg-white/70 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-bold">친구 번호</span>
            <button
              className="text-[15px] font-bold tracking-[0.15em] text-violet"
              onClick={async () => toast((await copyText(me.friend_code)) ? "친구 번호를 복사했어요" : "복사하지 못했어요")}
            >
              {me.friend_code}
            </button>
          </div>
          <p className="mt-1 text-[12.5px] text-sub">친구가 이 번호를 입력하거나 키링을 맞대면 친구가 돼요</p>
        </div>
      </Glass>

      <div className="mt-5 flex gap-3">
        <Button href="/nfc" className="flex-1">
          <IconNfc size={22} /> NFC로 공유
        </Button>
        <button
          aria-label="QR 코드로 공유"
          onClick={() => setQrOpen(true)}
          className="glass flex size-14 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-violet"
        >
          QR
        </button>
        <button
          aria-label="링크로 공유"
          onClick={share}
          className="glass flex size-14 shrink-0 items-center justify-center rounded-full text-violet"
        >
          <IconLink />
        </button>
      </div>

      <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} url={url} name={me.nickname} />
    </main>
  );
}

function QrSheet({ open, onClose, url, name }: { open: boolean; onClose: () => void; url: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (open) qrDataUrl(url).then(setSrc).catch(() => setSrc(null));
  }, [open, url]);
  return (
    <Sheet open={open} onClose={onClose}>
      <h3 className="text-center text-[20px] font-bold">{name}의 명함 QR</h3>
      <p className="mt-1 text-center text-[14px] text-sub">친구가 카메라로 찍으면 바로 친구가 돼요</p>
      <div className="mx-auto mt-5 flex size-[240px] items-center justify-center rounded-[24px] bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="명함 QR 코드" className="size-full" /> : <Loading />}
      </div>
      <div className="mt-6 pb-2">
        <Button variant="glass" onClick={onClose}>
          닫기
        </Button>
      </div>
    </Sheet>
  );
}
