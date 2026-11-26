"use client";

// 04_my_card_1 내 명함 보기
//
//  공유: 친구가 내 명함을 받는 주소 = /card/<친구 번호>  (03 명함 수신 화면)
//    NFC  -> /nfc 에서 키링 태그에 이 주소를 씀
//    QR   -> 아래 QR 버튼
//    링크 -> 아래 링크 버튼
//  편집: 오른쪽 위 '편집' -> /card/edit

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { copyText, shareLink } from "@/lib/device";
import { qrDataUrl } from "@/lib/share";
import { cardUrl } from "@/lib/format";
import { Button, ErrorState, Loading, Sheet, TopBar, useToast } from "@/components/ui";
import { CardView } from "@/components/CardView";
import { IconLink, IconNfc } from "@/components/icons";
import type { Card } from "@/lib/types";

export default function MyCardPage() {
  const { data, error, loading, reload } = useLoad(() => api.getMyCard());
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "명함을 불러오지 못했어요."} onRetry={() => reload()} />;
  return <MyCard me={data} />;
}

function MyCard({ me }: { me: Card }) {
  const toast = useToast();
  const [qrOpen, setQrOpen] = useState(false);
  const empty = !me.bio && !me.affiliation && !me.instagram && !me.behance && !me.portfolio_url;

  const share = async () => {
    const r = await shareLink({ title: `${me.nickname}의 Pairy 명함`, text: "Pairy에서 친구해요!", url: cardUrl(me.friend_code, "link") });
    if (r === "copied") toast("명함 링크를 복사했어요");
    else if (r === "failed") toast("링크를 복사하지 못했어요");
  };

  return (
    <main className="relative px-5 pb-6">
      <TopBar
        title="내 명함"
        className="-mx-5"
        right={
          <Link href="/card/edit" className="px-2 text-[16px] font-bold text-violet">
            편집
          </Link>
        }
      />

      <CardView
        card={me}
        footer={
          <button
            className="mt-4 text-[13px] text-sub"
            onClick={async () => toast((await copyText(me.friend_code)) ? "친구 번호를 복사했어요" : "복사하지 못했어요")}
          >
            친구 번호 <b className="tracking-[0.12em] text-violet">{me.friend_code}</b> · 눌러서 복사
          </button>
        }
      />

      {empty && (
        <Link href="/card/edit" className="mt-3 block text-center text-[14px] font-bold text-violet">
          소개 · 인스타 · 포트폴리오를 채워 볼까요? →
        </Link>
      )}

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

      <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} url={cardUrl(me.friend_code, "qr")} name={me.nickname} />
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
      <p className="mt-1 text-center text-[14px] text-sub">친구가 카메라로 찍으면 내 명함이 열려요</p>
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
