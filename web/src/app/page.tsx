// 09_landing_desktop_1 랜딩 (로그인 없이 볼 수 있음, proxy 공개 경로)
//  - 공통 레이아웃이 화면 폭을 430px(폰)로 묶어서, 랜딩은 fixed 로 전체 화면을 덮어 넓게 보여 줌
//  - 시작하기 -> /start (이미 로그인했으면 proxy 가 /home 으로 보냄)
//  - 폰 폭에서도 한 줄로 쌓여서 보이게 반응형

import Link from "next/link";
import type { ReactNode } from "react";
import { IconCamera, IconNfc, IconShield, IconUsers } from "@/components/icons";

const FEATURES = [
  { icon: <IconNfc size={22} />, title: "NFC 명함 교환", desc: "키링을 폰에 살짝 대면 내 명함과 포트폴리오가 바로 전달돼요." },
  { icon: <IconUsers size={22} />, title: "팸 만들기", desc: "친구 번호를 입력하면 같은 팸으로 묶이고 초대 링크로 공유해요." },
  { icon: <IconCamera size={22} />, title: "포토 포트폴리오", desc: "사진과 작업물을 모아 나만의 프로필 페이지로 친구와 나눠요." },
  { icon: <IconShield size={22} />, title: "안전 알림", desc: "낙상이 감지되면 10초 뒤 팸에게 알림이 가요. 괜찮다면 바로 취소!" },
];

const STEPS = [
  { title: "키링 연결하기", desc: "키링 전원을 켜고 앱의 '내 기기'에서 등록해요." },
  { title: "NFC 태그하기", desc: "친구 키링을 폰 뒷면에 대면 명함이 서로 교환돼요." },
  { title: "우리 팸 만들기", desc: "번호를 입력하면 같은 팸으로 묶이고, 링크로 공유해요." },
];

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="grad-primary flex size-8 items-center justify-center rounded-full">
        <span className="size-3 rounded-full bg-white" />
      </span>
      <span className="text-[22px] font-bold tracking-tight">Pairy</span>
    </span>
  );
}

function GlassBox({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-[28px] ${className}`}>{children}</div>;
}

/** 오른쪽 폰 화면 미리보기 (홈 시안 축소판) */
function PhoneMock() {
  const fam = [
    ["지", "linear-gradient(135deg,#8B5CF6,#E879C9)"],
    ["민", "linear-gradient(135deg,#2BB5A0,#5B8DEF)"],
    ["서", "linear-gradient(135deg,#FF8A80,#FFB38A)"],
    ["도", "linear-gradient(135deg,#7C83FD,#A79BFF)"],
  ];
  return (
    <div className="relative mx-auto w-[300px] lg:mx-0">
      <div className="glass rounded-[44px] p-5 pb-8">
        <p className="text-[18px] font-bold">안녕, 하은!</p>
        <div className="mx-auto mt-5 flex size-[130px] items-center justify-center rounded-full bg-[conic-gradient(#8B5CF6_0_70%,#F472B6_70%_85%,#e9e4f5_85%)] p-[9px]">
          <span className="flex size-full items-center justify-center rounded-full bg-white/95 text-[26px] font-bold">3,482</span>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {["NFC 태그", "팸 만들기"].map((t) => (
            <div key={t} className="rounded-[20px] bg-white/70 p-3">
              <span className="grad-primary block size-8 rounded-full" />
              <p className="mt-3 text-[13px] font-bold">{t}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-[20px] bg-white/70 p-3">
          <p className="text-[12px] font-bold text-sub">우리 팸</p>
          <div className="mt-2 flex items-center">
            {fam.map(([n, bg], i) => (
              <span key={n} className="flex size-8 items-center justify-center rounded-full text-[13px] font-bold text-white ring-2 ring-white" style={{ background: bg, marginLeft: i ? -8 : 0 }}>
                {n}
              </span>
            ))}
            <span className="ml-auto text-[12px] font-bold text-violet">공유</span>
          </div>
        </div>
      </div>
      <div className="glass absolute -top-2 -right-6 flex rotate-[4deg] items-center gap-2 rounded-[20px] px-3 py-2 sm:-right-14">
        <span className="flex size-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FF8A80,#FFB38A)] text-[14px] font-bold text-white">서</span>
        <span className="text-[12px] leading-tight font-bold">
          서연님이 합류했어요
          <br />
          <span className="font-medium text-sub">디자인 스터디</span>
        </span>
      </div>
      <div className="glass absolute bottom-24 -left-6 flex -rotate-[5deg] items-center gap-2 rounded-[20px] px-3 py-2 sm:-left-20">
        <span className="flex size-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#2BB5A0,#5B8DEF)] text-[14px] font-bold text-white">민</span>
        <span className="text-[12px] leading-tight font-bold">
          민재님 명함 도착
          <br />
          <span className="font-medium text-sub">방금 전 · NFC</span>
        </span>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto">
      <div className="pairy-bg" />
      <div className="mx-auto max-w-[1120px] px-5 pb-12 sm:px-8">
        <nav className="glass sticky top-4 z-10 mt-4 flex items-center rounded-full py-2.5 pr-2.5 pl-5">
          <Logo />
          <div className="ml-auto hidden items-center gap-10 text-[15px] font-bold text-ink-2 md:flex">
            <a href="#features">기능</a>
            <a href="#fam">팸</a>
            <a href="#how">사용 방법</a>
          </div>
          <Link href="/start" className="grad-primary ml-auto rounded-full px-7 py-2.5 text-[15px] font-bold text-white md:ml-10">
            시작하기
          </Link>
        </nav>

        <section className="grid items-center gap-14 pt-14 lg:grid-cols-[1fr_auto] lg:pt-20">
          <div>
            <span className="glass inline-block rounded-full px-4 py-1.5 text-[13px] font-bold">NFC로 연결되는 키링</span>
            <h1 className="mt-6 text-[40px] leading-[1.2] font-extrabold tracking-tight sm:text-[56px]">
              작은 키링 하나로,
              <br />
              반짝, 친구가 돼요
            </h1>
            <p className="mt-6 text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
              키링을 맞대면 명함이 교환되고,
              <br />
              번호만 입력하면 우리 팸이 만들어져요.
              <br />
              넘어지면 팸이 제일 먼저 알아요.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/start" className="grad-primary rounded-full px-10 py-4 text-[16px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(91,63,224,0.7)]">
                웹으로 시작하기
              </Link>
              <a href="#how" className="glass rounded-full px-10 py-4 text-[16px] font-bold">
                키링 알아보기
              </a>
            </div>
          </div>
          <PhoneMock />
        </section>

        <section id="features" className="scroll-mt-24 pt-24 text-center">
          <h2 className="text-[30px] font-extrabold sm:text-[36px]">Pairy로 할 수 있는 것</h2>
          <p className="mt-2 text-[15px] text-ink-2">친구와 연결되고, 서로를 지켜줘요</p>
          <div className="mt-10 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <GlassBox key={f.title} className="p-6">
                <span className="grad-primary flex size-12 items-center justify-center rounded-full text-white">{f.icon}</span>
                <h3 className="mt-6 text-[18px] font-bold">{f.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{f.desc}</p>
              </GlassBox>
            ))}
          </div>
        </section>

        <section id="how" className="scroll-mt-24 pt-20 text-center">
          <h2 className="text-[30px] font-extrabold sm:text-[36px]">이렇게 써요</h2>
          <div className="mt-8 grid gap-4 text-left md:grid-cols-3">
            {STEPS.map((s, i) => (
              <GlassBox key={s.title} className="p-6">
                <div className="flex items-center gap-3">
                  <span className="grad-primary flex size-10 items-center justify-center rounded-full text-[16px] font-bold text-white">{i + 1}</span>
                  <h3 className="text-[18px] font-bold">{s.title}</h3>
                </div>
                <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{s.desc}</p>
              </GlassBox>
            ))}
          </div>
        </section>

        <section id="fam" className="grad-primary relative mt-20 scroll-mt-24 overflow-hidden rounded-[36px] px-6 py-14 text-center text-white">
          <h2 className="text-[28px] font-extrabold sm:text-[34px]">지금 우리 팸 만들어 볼까요?</h2>
          <p className="mt-2 text-[15px] text-white/85">번호만 입력하면 바로 시작돼요.</p>
          <Link href="/start" className="mt-6 inline-block rounded-full bg-white px-12 py-3.5 text-[16px] font-bold text-violet">
            웹으로 시작하기
          </Link>
        </section>

        <footer className="pt-10 text-[13px] text-sub">Pairy 키링 · 피지컬 AI 프로젝트</footer>
      </div>
    </div>
  );
}
