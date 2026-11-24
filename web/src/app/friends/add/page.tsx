"use client";

// NFC 태그 / 키링 맞대기 / QR 로 열리는 친구 추가 주소
//   /friends/add?code=ABC123&source=nfc
// (A 파트의 NFC 명함 교환 화면에서 받은 번호를 이 주소로 넘겨도 됨)

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Button, Glass, Sparkles, Spinner } from "@/components/ui";
import type { FriendSource } from "@/lib/types";

type Phase = { t: "loading" } | { t: "done"; status: "pending" | "accepted" } | { t: "error"; msg: string };

function AddFriend() {
  const sp = useSearchParams();
  const code = (sp.get("code") ?? "").toUpperCase();
  const rawSource = sp.get("source");
  const source: FriendSource = rawSource === "nfc" || rawSource === "keyring" ? rawSource : "code";
  const validCode = /^[A-Z0-9]{6}$/.test(code);
  const [phase, setPhase] = useState<Phase>(validCode ? { t: "loading" } : { t: "error", msg: "친구 번호가 올바르지 않아요." });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !validCode) return; // 개발 모드 StrictMode에서 두 번 요청 방지
    ran.current = true;
    api
      .sendFriendRequest(code, source)
      .then((r) => setPhase({ t: "done", status: r.status }))
      .catch((e) => setPhase({ t: "error", msg: errorMessage(e) }));
  }, [code, source, validCode]);

  return (
    <main className="relative flex min-h-dvh flex-col px-5 pt-28 pb-10 text-center">
      <Sparkles spots={[{ top: "60px", left: "12%" }, { top: "90px", left: "84%", size: 18 }]} />
      <Glass className="flex flex-col items-center px-6 py-10">
        {phase.t === "loading" && (
          <>
            <Spinner className="size-10" />
            <p className="mt-4 text-[16px] text-sub">친구를 연결하고 있어요…</p>
          </>
        )}
        {phase.t === "done" && (
          <>
            <h1 className="text-[24px] font-bold">
              {phase.status === "accepted" ? "새 친구를 만났어요" : "친구 요청을 보냈어요"}
            </h1>
            <p className="mt-2 text-[15px] text-sub">
              {phase.status === "accepted" ? "이제 친구 목록에서 볼 수 있어요" : "상대가 수락하면 친구가 돼요"}
            </p>
          </>
        )}
        {phase.t === "error" && (
          <>
            <h1 className="text-[22px] font-bold">친구를 추가하지 못했어요</h1>
            <p className="mt-2 text-[15px] text-sub">{phase.msg}</p>
          </>
        )}
      </Glass>
      <div className="mt-auto">{phase.t !== "loading" && <Button href="/friends">친구 목록 보기</Button>}</div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AddFriend />
    </Suspense>
  );
}
