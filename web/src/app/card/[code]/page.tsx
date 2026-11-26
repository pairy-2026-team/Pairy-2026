"use client";

// 03_card_received_1 명함 수신 (새 친구를 만났어요)
//
//  주소: /card/<친구 번호>?source=nfc|qr|link
//    NFC 태그 · QR · 링크로 열림 -> 상대 명함을 먼저 보여 주고 '친구로 추가'
//    - 내 번호면 내 명함(/card)으로
//    - 이미 친구면 '이미 친구예요'
//    - 친구로 추가 후 '팸에 초대하기' -> /fam/new?with=<상대 id> (팸 만들기에서 미리 선택됨)

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { toApiError } from "@/lib/errors";
import { vibrate } from "@/lib/device";
import { Button, ErrorState, Loading, Sparkles, useToast } from "@/components/ui";
import { CardView } from "@/components/CardView";
import type { Card, FriendSource } from "@/lib/types";

const SOURCE_TEXT: Record<string, string> = { nfc: "NFC로 명함을 받았어요", qr: "QR로 명함을 받았어요", link: "링크로 명함을 받았어요" };

function Received() {
  const router = useRouter();
  const { code: raw } = useParams<{ code: string }>();
  const code = (raw ?? "").toUpperCase();
  const sourceParam = useSearchParams().get("source") ?? "";
  const source: FriendSource = sourceParam === "nfc" ? "nfc" : "code";

  const { data, error, loading, reload } = useLoad(async () => {
    const [card, me, friends] = await Promise.all([api.getCard(code), api.getMe(), api.listFriends()]);
    const friend = card ? friends.find((f) => f.friend_id === card.id) : undefined;
    // 상대가 나에게 보낸 요청(pending, 받은 쪽)은 '친구로 추가'를 누르면 바로 수락되므로 아직 친구 아님으로 봄
    const friendStatus = !friend ? null : friend.status === "pending" && !friend.is_outgoing ? null : friend.status;
    return { card, isMe: me.friend_code === code, friendStatus };
  }, [code]);

  // 내 명함 주소를 열었으면 내 명함 화면으로
  useEffect(() => {
    if (data?.isMe) router.replace("/card");
  }, [data?.isMe, router]);

  if (!/^[A-Z0-9]{6}$/.test(code)) return <ErrorState message="명함 주소가 올바르지 않아요." />;
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "명함을 불러오지 못했어요."} onRetry={() => reload()} />;
  if (!data.card) return <ErrorState message="이 번호의 명함을 찾을 수 없어요." />;
  if (data.isMe) return <Loading />;
  return <View card={data.card} source={source} sourceText={SOURCE_TEXT[sourceParam] ?? "명함을 받았어요"} initialStatus={data.friendStatus} />;
}

function View({
  card,
  source,
  sourceText,
  initialStatus,
}: {
  card: Card;
  source: FriendSource;
  sourceText: string;
  initialStatus: "pending" | "accepted" | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [adding, setAdding] = useState(false);

  const add = async (thenInvite = false) => {
    setAdding(true);
    try {
      const r = await api.sendFriendRequest(card.friend_code, source);
      setStatus(r.status);
      vibrate(60);
      toast(r.status === "accepted" ? `${card.nickname}님과 친구가 됐어요` : "친구 요청을 보냈어요");
      // 팸 초대는 친구만 고를 수 있으므로 바로 친구가 됐을 때만 이동 (NFC로 만나면 바로 친구)
      if (thenInvite && r.status === "accepted") router.push(`/fam/new?with=${card.id}`);
    } catch (e) {
      const err = toApiError(e);
      if (err.code === "REQUEST_ALREADY_SENT") setStatus("pending");
      toast(err.message);
    } finally {
      setAdding(false);
    }
  };

  const title = status === "accepted" ? (initialStatus === "accepted" ? "이미 친구예요" : "새 친구가 됐어요") : "새 친구를 만났어요";

  return (
    <main className="relative flex min-h-dvh flex-col px-5 pb-6">
      <Sparkles spots={[{ top: "64px", left: "10%" }, { top: "80px", left: "86%", size: 18 }, { top: "150px", left: "22%", size: 10 }]} />
      <header className="pt-safe pt-14 pb-6 text-center">
        <h1 className="text-[27px] font-bold">{title}</h1>
        <p className="mt-1.5 text-[14px] text-sub">{sourceText} · 방금 전</p>
      </header>

      <CardView card={card} />

      <div className="pb-safe mt-auto space-y-3 pt-6">
        {status === "accepted" ? (
          <>
            <Button href={`/fam/new?with=${card.id}`}>팸에 초대하기</Button>
            <Button variant="mint" href="/friends">
              친구 목록 보기
            </Button>
          </>
        ) : status === "pending" ? (
          <>
            <Button disabled>친구 요청을 보냈어요</Button>
            <p className="text-center text-[13px] text-sub">상대가 수락하면 친구가 돼요</p>
          </>
        ) : (
          <>
            <Button onClick={() => add()} loading={adding}>
              친구로 추가
            </Button>
            <Button variant="mint" onClick={() => add(true)} disabled={adding}>
              팸에 초대하기
            </Button>
          </>
        )}
        <Link href="/home" className="block py-2 text-center text-[15px] text-sub">
          나중에
        </Link>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Received />
    </Suspense>
  );
}
