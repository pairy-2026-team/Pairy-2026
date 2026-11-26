"use client";

// 00_signup 회원가입 (2단계)
//
//   1/2  이메일 · 비밀번호           (시안의 ID 칸 = 이메일. Supabase 로그인은 이메일 기준)
//   2/2  이름 · @아이디 · 관심 태그   -> 명함(04)에 바로 들어감
//
//   가입하기
//     supabase.auth.signUp  -> DB 트리거(handle_new_user, B 파트)가 profiles · safety_settings 자동 생성
//     ├ 바로 로그인됨     -> api.updateMyCard 로 아이디 · 태그 저장 -> ?next 또는 /home
//     └ 이메일 인증 필요  -> 입력값을 잠깐 보관(pending-profile) -> 인증 후 첫 로그인 때 저장
//
//   아이디가 이미 있으면(HANDLE_TAKEN): 가입은 된 상태라 명함 편집으로 보내서 다시 고르게 함

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/api";
import { getSupabase, IS_DEMO } from "@/lib/supabase/client";
import { toApiError } from "@/lib/errors";
import { safeNext } from "@/lib/format";
import { savePendingProfile } from "@/lib/pending-profile";
import { Button, Glass, cx, useToast } from "@/components/ui";
import { AuthField, AuthShell, authInput, authMessage } from "@/components/AuthShell";

const TAG_PRESETS = ["디자인", "사진", "러닝", "개발", "음악", "그림", "요리", "운동", "독서", "여행", "필름", "게임"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Signup() {
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"));
  const nextQ = sp.get("next") ? `?next=${encodeURIComponent(next)}` : "";

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [handle, setHandle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null); // 인증 메일을 보낸 주소

  const emailOk = EMAIL_RE.test(email.trim());
  const pwOk = password.length >= 6;
  const handleOk = handle === "" || /^[a-z0-9._]{2,30}$/.test(handle);
  const step2Ok = nickname.trim().length > 0 && nickname.trim().length <= 20 && handleOk;

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= 6 ? cur : [...cur, t]));

  const submit = async () => {
    if (!step2Ok || loading) return;
    setLoading(true);
    setError(null);
    const profile = { nickname: nickname.trim(), ...(handle ? { handle } : {}), tags };
    try {
      const res = await getSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { nickname: profile.nickname }, // handle_new_user 트리거가 이 이름으로 profiles 를 만듦
          emailRedirectTo: `${window.location.origin}/login${nextQ}`,
        },
      });
      if (res.error) {
        setError(authMessage(res.error.message));
        if (/already registered|already exists/i.test(res.error.message)) setStep(1);
        return;
      }
      // 이메일 인증이 켜져 있으면 세션이 없음 -> 프로필은 첫 로그인 때 저장
      if (!res.data.session) {
        savePendingProfile(profile);
        setSentTo(email.trim());
        return;
      }
      try {
        await api.updateMyCard(profile);
      } catch (e) {
        // 가입은 됐으니 명함 편집에서 다시 고르게
        toast(toApiError(e).message);
        router.replace("/card/edit");
        router.refresh();
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(authMessage(String((e as Error)?.message ?? e)));
    } finally {
      setLoading(false);
    }
  };

  if (IS_DEMO)
    return (
      <AuthShell title="회원가입" back={`/start${nextQ}`}>
        <Glass className="mt-10 text-center">
          <p className="text-[16px] font-bold">데모 모드예요</p>
          <p className="mt-1 text-[14px] text-sub">데모 모드에서는 가입 없이 하은 계정으로 둘러볼 수 있어요.</p>
        </Glass>
        <div className="mt-6">
          <Button href={next}>둘러보기</Button>
        </div>
      </AuthShell>
    );

  if (sentTo)
    return (
      <AuthShell title="회원가입" back={`/start${nextQ}`}>
        <Glass className="mt-10 text-center">
          <p className="text-[40px]">💌</p>
          <h2 className="mt-2 text-[20px] font-bold">메일함을 확인해 주세요</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-sub">
            <b className="text-ink">{sentTo}</b> 로 인증 링크를 보냈어요.
            <br />
            링크를 누른 뒤 로그인하면, 입력한 이름 · 아이디 · 태그가 그대로 들어가요.
          </p>
        </Glass>
        <div className="mt-6">
          <Button href={`/login${nextQ}`}>로그인하러 가기</Button>
        </div>
      </AuthShell>
    );

  return (
    <AuthShell title="회원가입" back={step === 1 ? `/start${nextQ}` : undefined} onBack={step === 2 ? () => setStep(1) : undefined}>
      <section className="flex items-start justify-between pt-2">
        <div>
          <h1 className="text-[30px] font-bold">{step === 1 ? "반가워요!" : "나를 소개해 주세요"}</h1>
          <p className="mt-1 text-[15px] text-ink-2">{step === 1 ? "Pairy에서 쓸 정보를 알려주세요" : "명함에 바로 들어가요. 나중에 바꿀 수 있어요"}</p>
        </div>
        <span className="glass mt-2 rounded-full px-4 py-1.5 text-[13px] font-bold text-violet">{step} / 2</span>
      </section>

      {step === 1 ? (
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
          <AuthField label="비밀번호" hint={password && !pwOk ? "6자 이상으로 정해 주세요" : undefined}>
            <div className={cx(authInput, "flex items-center pr-1.5")}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && emailOk && pwOk && setStep(2)}
                type="password"
                autoComplete="new-password"
                placeholder="6자 이상"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              <button
                onClick={() => setStep(2)}
                disabled={!emailOk || !pwOk}
                className="grad-primary h-9 shrink-0 rounded-full px-5 text-[14px] font-bold text-white disabled:opacity-40"
              >
                확인
              </button>
            </div>
          </AuthField>
        </Glass>
      ) : (
        <>
          <Glass className="mt-8 space-y-3 rounded-[28px] p-4">
            <AuthField label="이름">
              <input value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} placeholder="이하은" className={authInput} autoFocus />
            </AuthField>
            <AuthField label="아이디 (선택)" hint={handleOk ? "명함에 @아이디로 보여요" : "영어 소문자 · 숫자 · . _ 로 2~30자"} bad={!handleOk}>
              <div className={cx(authInput, "flex items-center gap-1")}>
                <span className="text-sub">@</span>
                <input
                  value={handle}
                  maxLength={30}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/^@/, ""))}
                  placeholder="haeun.dsn"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              </div>
            </AuthField>
          </Glass>

          <h2 className="mt-6 px-1 text-[15px] font-bold">
            관심 태그 <span className="font-medium text-sub">{tags.length}/6</span>
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {TAG_PRESETS.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  aria-pressed={on}
                  className={cx(
                    "rounded-full px-4 py-2 text-[14px] font-bold transition",
                    on ? "grad-primary text-white" : "glass text-ink-2",
                  )}
                >
                  #{t}
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && <p className="mt-4 text-center text-[14px] text-danger">{error}</p>}

      <div className="pb-safe mt-auto pt-8 pb-6">
        {step === 2 && (
          <Button onClick={submit} loading={loading} disabled={!step2Ok}>
            가입하기
          </Button>
        )}
        <Link href={`/login${nextQ}`} className="mt-4 block text-center text-[14px] font-bold text-violet">
          이미 계정이 있나요? 로그인
        </Link>
      </div>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <Signup />
    </Suspense>
  );
}
