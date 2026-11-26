"use client";

// 16_Receipt 오늘의 갓생 영수증
//  - 재료: api.getReceipt() (DB my_receipt: 오늘 걸음 · 목표 · 오늘 맞대기 · 새 친구 · 키링)
//  - 계산: lib/receipt.ts buildReceipt() (보폭 72cm, 1보 0.04kcal, 보너스 규칙)
//  - 걸음이 실시간으로 바뀌면(키링 -> daily_steps) 영수증도 다시 계산

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { shareLink } from "@/lib/device";
import { downloadBlob } from "@/lib/share";
import { buildReceipt, barcodeBars, type ReceiptLine } from "@/lib/receipt";
import { receiptImage } from "@/lib/receipt-image";
import { useLiveSteps } from "@/components/Steps";
import { Button, ErrorState, Loading, Sparkles, TopBar, cx, useToast } from "@/components/ui";
import type { ReceiptData } from "@/lib/types";

export default function ReceiptPage() {
  const { data, error, loading, reload } = useLoad(() => api.getReceipt());
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "영수증을 불러오지 못했어요."} onRetry={() => reload()} />;
  return <ReceiptView data={data} />;
}

function ReceiptView({ data }: { data: ReceiptData }) {
  const toast = useToast();
  const { steps } = useLiveSteps({ steps: data.steps });
  const r = useMemo(() => buildReceipt({ ...data, steps }), [data, steps]);
  const [busy, setBusy] = useState<null | "save" | "share">(null);

  const save = async () => {
    setBusy("save");
    const blob = await receiptImage(r);
    setBusy(null);
    if (!blob) return toast("이미지를 만들지 못했어요");
    downloadBlob(blob, `pairy-receipt-${r.receiptNo}.png`);
    toast("영수증 이미지를 저장했어요");
  };

  const share = async () => {
    setBusy("share");
    try {
      const text = `오늘 ${r.steps.toLocaleString("ko-KR")}보 걷고 갓생 ${r.total.toLocaleString("ko-KR")}P 적립! ${r.achieved ? "목표 달성 🎉" : ""}`;
      const blob = await receiptImage(r);
      const file = blob ? new File([blob], "pairy-receipt.png", { type: "image/png" }) : null;
      // 이미지째 공유가 되는 폰(안드로이드 · iOS)은 이미지로, 아니면 링크로
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text }).catch(() => {});
      } else {
        const res = await shareLink({ title: "오늘의 갓생 영수증", text, url: window.location.origin });
        if (res === "copied") toast("자랑 문구와 링크를 복사했어요");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="relative px-5 pb-6">
      <Sparkles spots={[{ top: "110px", left: "92%", size: 16 }, { top: "420px", left: "3%", size: 12 }]} />
      <TopBar back="/my" backStyle="circle" title="오늘의 영수증" className="-mx-5" />

      {/* 영수증 출력구 */}
      <div className="glass mx-1 h-6 rounded-full p-1.5">
        <div className="h-full rounded-full bg-gradient-to-r from-[#5b3fe0]/50 via-[#b9a6ff]/60 to-[#bfeee0]/70" />
      </div>

      <article className="receipt-paper relative mx-4 -mt-3 px-5 pt-8 pb-10 text-[#2a2350] shadow-[0_18px_30px_-18px_rgba(42,35,80,0.5)]">
        <header className="text-center">
          <h1 className="text-[30px] font-extrabold tracking-tight">갓생 영수증</h1>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#8a8499]">GODSAENG MART</p>
          <p className="mt-1.5 text-[12px] text-[#8a8499]">
            키링 #{r.keyringId} · 누적 매칭 {r.meetTotal}회
          </p>
          <p className="text-[12px] text-[#8a8499]">
            {r.printedAt} · No.{r.receiptNo}
          </p>
        </header>

        <Dash />
        <p className="mb-2 text-[11px] text-[#8a8499]">구 매 내 역</p>
        <Lines lines={r.usage} />

        <Dash />
        <p className="mb-2 text-[11px] text-[#8a8499]">목 표 {r.goal.toLocaleString("ko-KR")}보</p>
        <div className="flex gap-[3px]" aria-label={`달성률 ${r.rate}%`}>
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className={cx("h-3 flex-1", i < Math.round((Math.min(r.rate, 100) / 100) * 24) ? "bg-[#2a2350]" : "bg-[#e4e0ea]")} />
          ))}
        </div>
        <div className="mt-2">
          <Lines lines={[{ label: "달성률", value: `${r.rate}%` }]} />
        </div>

        <Dash />
        <Lines lines={r.points} />

        <div className="mt-3 border-y-[3px] border-double border-[#2a2350] pt-0.5" />
        <div className="relative mt-4 flex items-end justify-between">
          <span className="pb-1 text-[14px] font-extrabold">합계</span>
          <span
            className={cx(
              "absolute left-[22%] -top-1 -rotate-12 rounded-md border-[3px] px-2.5 py-0.5 text-center leading-tight",
              r.achieved ? "border-[#c2408f] text-[#c2408f]" : "border-[#8a8499] text-[#8a8499]",
            )}
          >
            <span className="block text-[18px] font-extrabold">{r.achieved ? "결제완료" : "적립중"}</span>
            <span className="block text-[9px] font-bold">GOAL {r.rate}%</span>
          </span>
          <span className="text-[34px] leading-none font-extrabold tabular-nums">{r.total.toLocaleString("ko-KR")}P</span>
        </div>

        <Dash />
        <p className="text-center text-[14px] font-extrabold">{r.achieved ? "✦ 오늘 갓생 완료 ✦" : "✦ 오늘도 갓생 적립 중 ✦"}</p>
        <Dash />

        <Barcode text={r.barcode} />
        <p className="mt-1.5 text-center text-[12px] tracking-[0.15em]">{r.barcode}</p>

        <Dash />
        <p className="text-center text-[11px] leading-relaxed text-[#8a8499]">
          이미 걸은 걸음은 교환 · 환불되지 않습니다.
          <br />
          영수증은 오늘 자정까지 유효합니다.
        </p>
      </article>

      <div className="mt-6 flex gap-3">
        <Button className="flex-1" onClick={save} loading={busy === "save"} disabled={busy !== null}>
          이미지로 저장
        </Button>
        <Button variant="white" className="flex-1" onClick={share} loading={busy === "share"} disabled={busy !== null}>
          친구에게 자랑
        </Button>
      </div>
      <p className="mt-3 text-center text-[12px] text-sub">걸을 때마다 최신 기록으로 새로 출력돼요</p>
    </main>
  );
}

function Dash() {
  return <div className="my-4 border-t-2 border-dashed border-[#c9c4d4]" />;
}

function Lines({ lines }: { lines: ReceiptLine[] }) {
  return (
    <ul className="space-y-2">
      {lines.map((l) => (
        <li key={l.label}>
          <div className="flex items-baseline gap-2 text-[14px]">
            <span className="shrink-0">{l.label}</span>
            <span className="mb-1 flex-1 border-b-2 border-dotted border-[#c9c4d4]" />
            <span className="shrink-0 font-semibold tabular-nums">{l.value}</span>
          </div>
          {l.note && <p className="pl-2 text-[11px] text-[#8a8499]">{l.note}</p>}
        </li>
      ))}
    </ul>
  );
}

function Barcode({ text }: { text: string }) {
  // 막대마다 시작 위치를 먼저 계산 (그리는 도중에 변수를 바꾸지 않게)
  const bars = barcodeBars(text);
  const starts = bars.reduce<number[]>((acc, _bar, i) => [...acc, i === 0 ? 0 : acc[i - 1] + bars[i - 1][0] + bars[i - 1][1]], []);
  const total = starts[starts.length - 1] + bars[bars.length - 1][0] + bars[bars.length - 1][1];
  return (
    <svg viewBox={`0 0 ${total} 40`} preserveAspectRatio="none" className="h-14 w-full" aria-label={`바코드 ${text}`}>
      {bars.map(([b], i) => (
        <rect key={i} x={starts[i]} y={0} width={b} height={40} fill="#2a2350" />
      ))}
    </svg>
  );
}
