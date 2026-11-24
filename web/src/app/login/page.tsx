"use client";

// ⚠️ 임시 로그인 화면 (B 파트 테스트용).
// A 파트 로그인/회원가입이 완성되면 이 파일을 그쪽 화면으로 교체하세요.
// 로그인 후 ?next= 주소로 돌아가는 동작만 유지하면 됩니다.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui";
import { PairyLogo } from "@/components/icons";
import { getSupabase, IS_DEMO } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/home";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    const sb = getSupabase();
    const res =
      mode === "in"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { data: { nickname: nickname || undefined } } });
    setLoading(false);
    if (res.error) return setError(res.error.message);
    if (mode === "up" && !res.data.session) return setError("메일함에서 인증 링크를 눌러 주세요.");
    router.replace(next.startsWith("/") ? next : "/home");
    router.refresh();
  };

  if (IS_DEMO)
    return (
      <div className="px-6 pt-24 text-center">
        <p className="text-[15px] text-sub">데모 모드에서는 로그인 없이 쓸 수 있어요.</p>
        <Button className="mt-6" href={next}>
          계속하기
        </Button>
      </div>
    );

  return (
    <div className="px-6 pt-20">
      <PairyLogo size={56} />
      <h1 className="mt-4 text-[26px] leading-tight font-bold">
        페어리에 오신 걸
        <br />
        환영해요
      </h1>
      <div className="mt-8 space-y-3">
        {mode === "up" && (
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임"
            className="h-14 w-full glass rounded-full px-6 text-[16px] outline-none"
          />
        )}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          placeholder="이메일"
          className="h-14 w-full glass rounded-full px-6 text-[16px] outline-none"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          placeholder="비밀번호 (6자 이상)"
          className="h-14 w-full glass rounded-full px-6 text-[16px] outline-none"
        />
      </div>
      {error && <p className="mt-3 text-[14px] text-danger">{error}</p>}
      <Button className="mt-6" onClick={submit} loading={loading} disabled={!email || password.length < 6}>
        {mode === "in" ? "로그인" : "가입하기"}
      </Button>
      <button
        className="mt-4 w-full text-center text-[14px] text-sub"
        onClick={() => setMode(mode === "in" ? "up" : "in")}
      >
        {mode === "in" ? "처음이신가요? 가입하기" : "이미 계정이 있어요"}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
