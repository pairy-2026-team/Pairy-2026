"use client";

// 00 로그인 (A 파트. B 파트 임시 로그인 화면을 교체)
//  - 로그인 후 ?next= 주소로 돌아감 (NFC/QR 로 들어온 초대 · 명함 주소를 이어서 열기)
//  - 회원가입에서 이메일 인증 때문에 저장 못 한 이름 · 아이디 · 태그가 있으면 여기서 저장 (pending-profile)

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getSupabase, IS_DEMO } from "@/lib/supabase/client";
import { toApiError } from "@/lib/errors";
import { safeNext } from "@/lib/format";
import { applyPendingProfile } from "@/lib/pending-profile";
import { Button, Glass, cx, useToast } from "@/components/ui";
import { AuthField, AuthShell, authInput, authMessage } from "@/components/AuthShell";

function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"));
  const nextQ = sp.get("next") ? `?next=${encodeURIComponent(next)}` : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 6;

  const submit = async () => {
    if (!ok || loading) return;
    setLoading(true);
    setError(null);
    const res = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (res.error) {
      setLoading(false);
      return setError(authMessage(res.error.message));
    }
    const failed = await applyPendingProfile();
    if (failed) {
      toast(toApiError(failed).message);
      router.replace("/card/edit");
    } else {
      router.replace(next);
    }
    router.refresh();
  };

  if (IS_DEMO)
    return (
      <AuthShell title="로그인" back={`/start${nextQ}`}>
        <Glass className="mt-10 text-center">
          <p className="text-[16px] font-bold">데모 모드예요</p>
          <p className="mt-1 text-[14px] text-sub">데모 모드에서는 로그인 없이 쓸 수 있어요.</p>
        </Glass>
        <div className="mt-6">
          <Button href={next}>계속하기</Button>
        </div>
      </AuthShell>
    );

  return (
    <AuthShell title="로그인" back={`/start${nextQ}`}>
      <section className="pt-2">
        <h1 className="text-[30px] font-bold">다시 만나서 반가워요!</h1>
        <p className="mt-1 text-[15px] text-ink-2">가입한 이메일로 로그인해 주세요</p>
      </section>

      <Glass className="mt-16 space-y-3 rounded-[28px] p-4">
        <AuthField label="이메일">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="haeun@pairy.app"
            className={authInput}
          />
        </AuthField>
        <AuthField label="비밀번호">
          <div className={cx(authInput, "flex items-center pr-1.5")}>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
            <button
              onClick={submit}
              disabled={!ok || loading}
              className="grad-primary h-9 shrink-0 rounded-full px-5 text-[14px] font-bold text-white disabled:opacity-40"
            >
              {loading ? "…" : "로그인"}
            </button>
          </div>
        </AuthField>
      </Glass>

      {error && <p className="mt-4 text-center text-[14px] text-danger">{error}</p>}

      <div className="pb-safe mt-auto pt-8 pb-6">
        <Link href={`/signup${nextQ}`} className="block text-center text-[14px] font-bold text-violet">
          처음이신가요? 회원가입
        </Link>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
