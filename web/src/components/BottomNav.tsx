"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconCard, IconHome, IconNfc, IconUser, IconUsers } from "./icons";
import { cx } from "./ui";

// /nfc, /my 는 A 파트 화면 (NFC 태그 · 마이/기기)
type Tab = { href: string; label: string; icon: ReactNode; match: (p: string) => boolean };
const LEFT: Tab[] = [
  { href: "/home", label: "홈", icon: <IconHome size={22} />, match: (p) => p.startsWith("/home") || p.startsWith("/steps") },
  { href: "/friends", label: "친구", icon: <IconUsers size={22} />, match: (p) => p.startsWith("/friends") },
];
const RIGHT: Tab[] = [
  {
    href: "/fam",
    label: "팸",
    icon: <IconCard size={22} />,
    match: (p) => p.startsWith("/fam") || p.startsWith("/alerts"),
  },
  {
    href: "/my",
    label: "마이",
    icon: <IconUser size={22} />,
    match: (p) => p.startsWith("/my") || p.startsWith("/settings") || p.startsWith("/device"),
  },
];

// 집중해야 하는 화면에서는 탭바를 숨김
const HIDE = ["/fall", "/login", "/fam/new", "/fam/join", "/friends/add", "/start", "/signup", "/card/", "/receipt", "/monitor"];

export function BottomNav() {
  const path = usePathname() ?? "";
  if (path === "/" || HIDE.some((h) => path.startsWith(h))) return null; // "/" = A 파트 랜딩
  const nfcOn = path.startsWith("/nfc");

  const item = (t: Tab) => {
    const on = t.match(path);
    return (
      <Link key={t.href} href={t.href} className="flex flex-1 flex-col items-center gap-1 pt-2">
        <span
          className={cx(
            "flex size-11 items-center justify-center rounded-full transition",
            on ? "grad-primary text-white shadow-[0_6px_16px_-6px_rgba(91,63,224,0.8)]" : "text-ink-2",
          )}
        >
          {t.icon}
        </span>
        <span className={cx("text-[12px] font-semibold", on ? "text-violet" : "text-ink-2")}>{t.label}</span>
      </Link>
    );
  };

  return (
    <>
      <div className="h-28" />
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] px-4">
        <div className="glass relative flex h-[74px] items-start rounded-[30px] px-2">
          {LEFT.map(item)}
          <Link href="/nfc" className="relative flex flex-1 flex-col items-center">
            <span className="grad-primary absolute -top-8 flex size-[62px] items-center justify-center rounded-full text-white shadow-[0_10px_24px_-8px_rgba(91,63,224,0.9)] ring-4 ring-white">
              <IconNfc size={28} />
            </span>
            <span className={cx("mt-[46px] text-[12px] font-bold", nfcOn ? "text-violet" : "text-violet/80")}>NFC</span>
          </Link>
          {RIGHT.map(item)}
        </div>
      </nav>
    </>
  );
}
