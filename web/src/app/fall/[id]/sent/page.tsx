"use client";

// 11_fall_sos_sent 도움 요청 전송 완료 (넘어진 본인 화면)
//  - 알림 받은 팸별 응답(전달됨 → 확인했어요 → 전화 거는 중/가고 있어요)을 실시간으로
//  - "나는 괜찮아요" -> 상황 종료(resolved)

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAlertRefresh, useLoad } from "@/lib/hooks";
import { errorMessage } from "@/lib/errors";
import { Avatar, Button, ConfirmSheet, ErrorState, Glass, Loading, Sparkles, useToast } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { RecipientChip } from "@/components/RecipientChip";
import { LocationCard } from "@/components/AlertBits";
import { reverseGeocode, watchLocation } from "@/lib/geo";

function Sent() {
  const { id } = useParams<{ id: string }>();
  const lateCancel = useSearchParams().get("late_cancel") === "1";
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(async () => {
    const [a, recipients] = await Promise.all([api.getAlertDetail(id), api.getAlertRecipients(id)]);
    return a ? { a, recipients } : null;
  }, [id]);
  useAlertRefresh(() => reload(true), 4000, id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  // 도움 요청 중에는 내 위치를 계속 팸에게 보냄 (15초 간격). 종료되면 멈춤
  const live = data?.a.status === "sent" && data.a.is_mine;
  const addressRef = useRef<string | null>(null);
  useEffect(() => {
    if (!live) return;
    addressRef.current = data?.a.address ?? null;
    return watchLocation(async (p) => {
      if (!addressRef.current) addressRef.current = await reverseGeocode(p.lat, p.lng);
      api
        .updateAlertLocation(id, { lat: p.lat, lng: p.lng, accuracy: p.accuracy, address: addressRef.current })
        .then(() => reload(true))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, id]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "알림을 찾을 수 없어요."} onRetry={() => reload()} />;

  const { a, recipients } = data;
  const resolved = a.status === "resolved";

  const resolve = async () => {
    setResolving(true);
    try {
      await api.resolveFall(a.id);
      setConfirmOpen(false);
      await reload(true);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setResolving(false);
    }
  };

  return (
    <main className="pt-safe relative flex min-h-dvh flex-col px-5">
      <Sparkles spots={[{ top: "90px", left: "16%" }, { top: "70px", left: "82%", size: 18 }, { top: "190px", left: "76%", size: 12 }]} />

      <section className="flex flex-col items-center pt-5 text-center">
        <span className="relative flex size-[112px] items-center justify-center rounded-full bg-white/35">
          <span className="flex size-[86px] items-center justify-center rounded-full bg-white/80 shadow-sm">
            <span className="grad-primary flex size-[62px] items-center justify-center rounded-full text-white">
              <IconCheck size={30} />
            </span>
          </span>
        </span>
        <h1 className="mt-3 text-[26px] font-bold">{resolved ? "상황이 종료됐어요" : "도움 요청을 보냈어요"}</h1>
        <p className="mt-1 text-[15px] text-ink-2">
          {resolved
            ? "팸에게 괜찮다고 알렸어요"
            : a.notified_count === 0
              ? "알림을 받을 팸이 없어요. 위급하면 119에 전화하세요"
              : `팸 ${a.notified_count}명에게 알렸어요`}
        </p>
      </section>

      {lateCancel && !resolved && (
        <p className="glass mt-5 rounded-[22px] p-4 text-[14px] text-ink-2">
          취소하기 전에 이미 알림이 전송됐어요. 괜찮다면 아래 <b>상황 종료</b>를 눌러 팸에게 알려 주세요.
        </p>
      )}

      <Glass className="mt-5 px-4 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[16px] font-bold">알림 받은 팸</h2>
          {!resolved && <span className="text-[13px] font-bold text-danger">실시간</span>}
        </div>
        {recipients.length === 0 ? (
          <p className="px-1 py-4 text-center text-[14px] text-sub">
            팸이나 친구가 없어 알림이 가지 않았어요.
            <br />
            팸을 만들면 다음부터 바로 알려 줄 수 있어요.
          </p>
        ) : (
          <ul>
            {recipients.map((r, i) => (
              <li key={r.user_id} className={`flex items-center gap-3 px-1 py-2 ${i ? "border-t border-white/80" : ""}`}>
                <Avatar name={r.nickname} id={r.user_id} size={34} />
                <span className="flex-1 text-[16px] font-bold">{r.nickname}</span>
                <RecipientChip status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Glass>

      <LocationCard
        className="mt-4"
        loc={a}
        live={!resolved}
        title={resolved ? "공유했던 위치" : "내 위치 실시간 공유 중"}
      />

      <div className="pb-safe mt-auto space-y-3 pt-5">
        {resolved ? (
          <Button href="/home">홈으로</Button>
        ) : (
          <>
            <a href="tel:119" className="grad-danger flex h-14 items-center justify-center rounded-full text-[17px] font-bold text-white">
              119에 전화하기
            </a>
            <Button variant="mint" onClick={() => setConfirmOpen(true)}>
              상황 종료 · 나는 괜찮아요
            </Button>
          </>
        )}
      </div>

      <ConfirmSheet
        open={confirmOpen}
        title="정말 괜찮으세요?"
        desc="상황을 종료하면 팸에게 괜찮다고 알려요."
        confirmLabel="네, 괜찮아요"
        loading={resolving}
        onConfirm={resolve}
        onClose={() => setConfirmOpen(false)}
      />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Sent />
    </Suspense>
  );
}
