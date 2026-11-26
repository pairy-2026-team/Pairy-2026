"use client";

// 00 회원가입 · 로그인이 같이 쓰는 틀 · 입력칸 · 에러 문구

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { IconBack } from "./icons";
import { Sparkles, cx } from "./ui";

export const authInput =
  "h-12 w-full rounded-full bg-white/90 px-5 text-[16px] outline-none ring-violet focus-within:ring-2 focus:ring-2";

/** Supabase Auth 에러 -> 한국어 */
export function authMessage(raw: string) {
  if (/already registered|already exists/i.test(raw)) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (/invalid login credentials/i.test(raw)) return "이메일 또는 비밀번호가 맞지 않아요.";
  if (/email not confirmed/i.test(raw)) return "메일함에서 인증 링크를 먼저 눌러 주세요.";
  if (/password/i.test(raw) && /(at least|short|weak)/i.test(raw)) return "비밀번호가 너무 짧거나 쉬워요. 6자 이상으로 정해 주세요.";
  if (/rate limit|too many/i.test(raw)) return "잠시 후 다시 시도해 주세요. (요청이 너무 많아요)";
  if (/invalid.*email/i.test(raw)) return "이메일 주소를 확인해 주세요.";
  if (/fetch|network/i.test(raw)) return "인터넷 연결을 확인해 주세요.";
  return raw;
}

export function AuthField({ label, hint, bad, children }: { label: string; hint?: string; bad?: boolean; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block px-1 text-[12px] font-bold tracking-wide text-ink-2">{label}</span>
      {children}
      {hint && <span className={cx("mt-1 block px-2 text-[12px]", bad ? "text-danger" : "text-sub")}>{hint}</span>}
    </div>
  );
}

/** back: 이동할 주소, onBack: 같은 화면 안에서 이전 단계로 */
export function AuthShell({ title, back, onBack, children }: { title: string; back?: string; onBack?: () => void; children: ReactNode }) {
  const router = useRouter();
  const goBack = onBack ?? (back ? () => router.push(back) : undefined);
  return (
    <main className="relative flex min-h-dvh flex-col px-5">
      <Sparkles spots={[{ top: "150px", left: "8%", size: 12 }, { top: "120px", left: "88%", size: 16 }]} />
      <header className="pt-safe relative flex h-16 items-center">
        {goBack && (
          <button aria-label="뒤로" onClick={goBack} className="glass relative z-10 flex size-11 items-center justify-center rounded-full">
            <IconBack size={22} />
          </button>
        )}
        <h1 className="pointer-events-none absolute inset-x-16 text-center text-[18px] font-bold">{title}</h1>
      </header>
      {children}
    </main>
  );
}
