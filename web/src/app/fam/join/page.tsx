"use client";

// 팸 참여: QR / NFC / 링크로 열림 -> /f/7K2Q 또는 /fam/join?code=PAIRY-7K2Q
// 코드가 없으면 직접 입력

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { FAM_GRADIENTS, normalizeFamCode } from "@/lib/format";
import { AvatarStack, Button, Glass, Sparkles, Spinner, TopBar } from "@/components/ui";
import type { FamPreview } from "@/lib/types";

function Join() {
  const router = useRouter();
  const initial = normalizeFamCode(useSearchParams().get("code") ?? "").slice(0, 4);
  const [code, setCode] = useState(initial);
  const [preview, setPreview] = useState<FamPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async (c: string) => {
    setChecking(true);
    setError(null);
    setPreview(null);
    try {
      const p = await api.previewFam(c);
      if (!p) setError("팸 코드가 올바르지 않아요.");
      setPreview(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    // 링크로 들어오면 바로 미리보기
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial.length === 4) check(initial);
  }, [initial, check]);

  const join = async () => {
    if (!preview) return;
    setJoining(true);
    setError(null);
    try {
      const famId = await api.joinFam(code);
      router.replace(`/fam/${famId}`);
    } catch (e) {
      setError(errorMessage(e));
      setJoining(false);
    }
  };

  const blocked = preview && !preview.already_member && (preview.expired || preview.member_count >= preview.max_members);

  return (
    <main className="relative flex min-h-dvh flex-col">
      <Sparkles spots={[{ top: "120px", left: "12%" }, { top: "180px", left: "84%", size: 18 }]} />
      <TopBar title="팸 참여하기" back="/fam" backStyle="circle" />
      <div className="flex-1 px-5 pt-4">
        {!preview && (
          <>
            <h1 className="text-[26px] font-bold">팸 코드를 입력해요</h1>
            <p className="mt-1 text-[15px] text-sub">친구에게 받은 PAIRY- 뒤 4자리</p>
            <div className="glass mt-6 flex h-16 items-center rounded-full px-6">
              <span className="text-[22px] font-bold text-mute">PAIRY-</span>
              <input
                value={code}
                onChange={(e) => {
                  setCode(normalizeFamCode(e.target.value).slice(0, 4));
                  setError(null);
                }}
                placeholder="7K2Q"
                autoCapitalize="characters"
                className="h-full w-full bg-transparent text-[22px] font-bold tracking-[0.2em] outline-none placeholder:text-mute/60"
              />
            </div>
          </>
        )}

        {checking && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {preview && (
          <Glass className="mt-6 flex flex-col items-center p-8 text-center">
            <span className="size-16 rounded-full" style={{ background: FAM_GRADIENTS[preview.color] }} />
            <h1 className="mt-4 text-[24px] font-bold">{preview.name}</h1>
            <p className="mt-1 text-[14px] text-sub">{preview.member_count}명이 함께해요</p>
            <div className="mt-4">
              <AvatarStack people={preview.members} size={40} max={5} />
            </div>
            <p className="mt-5 text-[14px] text-ink-2">
              {preview.already_member
                ? "이미 이 팸의 멤버예요"
                : preview.expired
                  ? "만료된 팸 코드예요. 팸장에게 새 코드를 받아 주세요."
                  : preview.member_count >= preview.max_members
                    ? "팸 인원이 가득 찼어요"
                    : "참여하면 넘어졌을 때 서로에게 알림이 가요"}
            </p>
          </Glass>
        )}

        {error && <p className="mt-3 text-center text-[14px] text-danger">{error}</p>}
      </div>

      <div className="pb-safe sticky bottom-0 space-y-2 px-5 pt-3">
        {!preview ? (
          <Button disabled={code.length !== 4} loading={checking} onClick={() => check(code)}>
            확인
          </Button>
        ) : preview.already_member ? (
          <Button href={`/fam/${preview.fam_id}`}>팸으로 가기</Button>
        ) : (
          <>
            <Button disabled={!!blocked} loading={joining} onClick={join}>
              팸에 합류하기
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              다른 코드 입력
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}
