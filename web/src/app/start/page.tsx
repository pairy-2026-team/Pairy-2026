"use client";

// 00_start 시작 화면
//  - 로그인 안 한 사람이 앱 주소를 열면 proxy 가 여기로 보냄 (?next= 로 원래 가려던 주소를 들고 옴)
//  - 시작하기 -> /signup, 로그인 -> /login  (둘 다 ?next 를 이어 줌)

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button, Sparkles } from "@/components/ui";
import { IconNfc, IconPulse, IconUsers } from "@/components/icons";
import { safeNext } from "@/lib/format";

function Chip({ icon, label, className, color }: { icon: React.ReactNode; label: string; className: string; color: string }) {
  return (
    <span className={`glass absolute flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-[14px] font-bold ${className}`}>
      <span className="flex size-8 items-center justify-center rounded-full text-white" style={{ background: color }}>
        {icon}
      </span>
      {label}
    </span>
  );
}

/** 페어리 키링 로고 (날개 + 링) */
function KeyringHero() {
  return (
    <div className="relative mx-auto size-[260px]">
      <span className="absolute inset-0 rounded-full bg-white/20" />
      <span className="absolute inset-[32px] rounded-full bg-white/30" />
      <span className="absolute inset-[56px] flex items-center justify-center rounded-full bg-white/85 shadow-[0_12px_40px_-12px_rgba(91,63,224,0.45)]">
        <span className="relative flex items-center justify-center">
          <span className="absolute -top-7 -left-7 h-12 w-9 -rotate-[24deg] rounded-[50%] bg-gradient-to-b from-white to-[#e4dcff] ring-1 ring-violet/10" />
          <span className="absolute -top-7 -right-7 h-12 w-9 rotate-[24deg] rounded-[50%] bg-gradient-to-b from-white to-[#e4dcff] ring-1 ring-violet/10" />
          <span className="grad-primary relative flex size-12 items-center justify-center rounded-full">
            <span className="size-4 rounded-full bg-white" />
          </span>
        </span>
      </span>
    </div>
  );
}

function Start() {
  const next = safeNext(useSearchParams().get("next"), "");
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <main className="relative flex min-h-dvh flex-col px-5">
      <Sparkles
        spots={[
          { top: "60px", left: "14%" },
          { top: "52px", left: "84%", size: 12 },
          { top: "430px", left: "86%", size: 18 },
          { top: "466px", left: "9%", size: 10 },
        ]}
      />
      <div className="relative mt-16">
        <KeyringHero />
        <Chip icon={<IconPulse size={16} />} label="낙상 감지" className="top-[-6px] left-0" color="linear-gradient(135deg,#FF8A80,#E8445E)" />
        <Chip icon={<IconNfc size={16} />} label="NFC 명함" className="top-[38px] right-0" color="linear-gradient(135deg,#5B3FE0,#9B3AD6)" />
        <Chip icon={<IconUsers size={16} />} label="우리 팸" className="bottom-[-8px] left-0" color="linear-gradient(135deg,#2BB5A0,#5B8DEF)" />
      </div>

      <section className="mt-14 text-center">
        <h1 className="text-[44px] font-extrabold tracking-tight">Pairy</h1>
        <p className="mt-1 text-[17px] font-bold text-violet">키링 하나로 이어지는 우리</p>
        <p className="mt-1 text-[14px] text-ink-2">걸음도 명함도 안전도, 팸과 함께 반짝이게</p>
      </section>

      <div className="pb-safe mt-auto space-y-3 pt-10 pb-6">
        <Button href={`/signup${q}`}>시작하기</Button>
        <Button variant="mint" href={`/login${q}`}>
          이미 계정이 있어요 · 로그인
        </Button>
        <p className="pt-2 text-center text-[12px] text-sub">시작하면 이용약관과 개인정보처리방침에 동의하게 돼요</p>
      </div>
    </main>
  );
}

export default function StartPage() {
  return (
    <Suspense>
      <Start />
    </Suspense>
  );
}
