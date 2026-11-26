"use client";

// 02_nfc_tag_3 NFC 태그 (명함 교환)
//
//  웹(Web NFC)은 폰끼리 직접 주고받기가 안 돼서, 이렇게 씀:
//    1) 내 키링에 붙은 NFC 스티커에 "내 명함 주소"를 써 둔다      -> [내 키링 태그에 쓰기]
//    2) 친구가 자기 폰을 내 키링에 대면 그 주소가 열림
//       -> /card/<내 친구 번호>?source=nfc -> 03 명함 수신 화면에서 '친구로 추가'
//       (예전 형식 /friends/add?code= 로 쓴 태그도 읽힘)
//    3) 반대로 내가 친구 키링을 읽을 수도 있음                      -> [친구 키링 읽기]
//
//  Web NFC 는 안드로이드 크롬 + https 에서만 동작. 아이폰은 기본 카메라/NFC 앱이 태그 주소를 열어 줌.
//  안 되는 환경에서는 QR · 친구 번호로 안내.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { vibrate } from "@/lib/device";
import { cardUrl, codeFromCardUrl } from "@/lib/format";
import { canWriteNfc, writeNfcUrl } from "@/lib/share";
import { Avatar, Button, ErrorState, Glass, Loading, Sparkles, TopBar, cx, useToast } from "@/components/ui";
import { IconNfc } from "@/components/icons";
import type { Profile } from "@/lib/types";

type Mode = "idle" | "reading" | "writing";

type NdefRecord = { recordType: string; data?: DataView; encoding?: string };
type NdefReaderT = {
  scan: (opts?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((e: { message: { records: NdefRecord[] } }) => void) | null;
  onreadingerror: (() => void) | null;
};

export default function NfcPage() {
  const { data, error, loading, reload } = useLoad(() => api.getMe());
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "불러오지 못했어요."} onRetry={() => reload()} />;
  return <NfcTag me={data} />;
}

function NfcTag({ me }: { me: Profile }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("idle");
  const [supported, setSupported] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // 서버 렌더링 때는 window 가 없으므로 화면이 뜬 뒤에 확인
  useEffect(() => {
    const t = setTimeout(() => setSupported(canWriteNfc()), 0);
    return () => {
      clearTimeout(t);
      abortRef.current?.abort();
    };
  }, []);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMode("idle");
  };

  // 친구 키링(태그) 읽기
  const read = async () => {
    if (!supported) return toast("NFC 읽기는 안드로이드 크롬에서만 돼요. QR이나 친구 번호를 써 주세요");
    stop();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setMode("reading");
    try {
      const Reader = (window as unknown as { NDEFReader: new () => NdefReaderT }).NDEFReader;
      const reader = new Reader();
      await reader.scan({ signal: ctrl.signal });
      reader.onreading = (e) => {
        const rec = e.message.records.find((r) => r.recordType === "url" && r.data);
        const url = rec?.data ? new TextDecoder(rec.encoding ?? "utf-8").decode(rec.data) : "";
        const code = codeFromCardUrl(url);
        if (!code) return toast("Pairy 명함 태그가 아니에요");
        if (code === me.friend_code) return toast("내 키링이에요. 친구 키링에 대 주세요");
        vibrate(80);
        stop();
        router.push(`/card/${code}?source=nfc`);
      };
      reader.onreadingerror = () => toast("태그를 읽지 못했어요. 다시 대 주세요");
    } catch (e) {
      setMode("idle");
      if ((e as Error).name !== "AbortError") toast("NFC를 켤 수 없어요. 설정에서 NFC를 켜 주세요");
    }
  };

  // 내 키링(태그)에 내 명함 주소 쓰기
  const write = async () => {
    if (!supported) return toast("NFC 쓰기는 안드로이드 크롬에서만 돼요");
    stop();
    setMode("writing");
    try {
      await writeNfcUrl(cardUrl(me.friend_code, "nfc"));
      vibrate([60, 60, 60]);
      toast("키링 태그에 내 명함을 저장했어요");
    } catch {
      toast("태그에 쓰지 못했어요. 다시 대 주세요");
    } finally {
      setMode("idle");
    }
  };

  const active = mode !== "idle";

  return (
    <main className="relative flex min-h-[calc(100dvh-7rem)] flex-col px-5">
      <TopBar back="/home" title="NFC 태그" className="-mx-5" />

      {/* 명함 교환 / 팸 초대 */}
      <div className="glass mx-auto flex w-full max-w-[300px] rounded-full p-1">
        <span className="grad-primary flex-1 rounded-full py-2.5 text-center text-[15px] font-bold text-white">명함 교환</span>
        <button onClick={() => router.push("/fam")} className="flex-1 rounded-full py-2.5 text-[15px] font-bold text-ink-2">
          팸 초대
        </button>
      </div>

      <div className="relative mx-auto mt-6 flex size-[290px] items-center justify-center">
        <Sparkles spots={[{ top: "8px", left: "6%" }, { top: "0px", left: "90%", size: 12 }, { top: "250px", left: "94%" }]} />
        <span className="absolute inset-0 rounded-full border border-white/70 bg-white/10" />
        <span className="absolute inset-[38px] rounded-full border border-white/70 bg-white/15" />
        <span className={cx("absolute inset-[74px] rounded-full bg-white/40", active && "animate-pulse-ring")} />
        <span className="grad-primary relative flex size-[104px] items-center justify-center rounded-full text-white shadow-[0_14px_30px_-10px_rgba(91,63,224,0.7)]">
          <IconNfc size={40} />
        </span>
      </div>

      <div className="mt-4 text-center">
        <h1 className="text-[24px] leading-snug font-bold">
          {mode === "writing" ? (
            <>
              내 키링을 폰 뒷면에
              <br />
              가까이 대 주세요
            </>
          ) : (
            <>
              친구 키링을 폰 뒷면에
              <br />
              가까이 대 주세요
            </>
          )}
        </h1>
        <p className="mt-2 text-[14px] text-sub">
          {!supported
            ? "이 브라우저는 NFC를 지원하지 않아요 · 안드로이드 크롬에서 열어 주세요"
            : mode === "writing"
              ? "태그에 내 명함 주소를 저장하는 중이에요"
              : mode === "reading"
                ? "읽는 중이에요… NFC가 켜져 있는지 확인해 주세요"
                : "NFC가 켜져 있는지 확인해 주세요."}
        </p>
      </div>

      <Glass className="mt-6 flex items-center gap-3 rounded-[24px] p-4">
        <Avatar name={me.nickname} id={me.id} size={46} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-sub">보낼 명함</p>
          <p className="truncate text-[16px] font-bold">
            {me.nickname}
            {me.handle ? ` · @${me.handle}` : ""}
          </p>
        </div>
        <span className="text-[13px] font-bold tracking-[0.12em] text-violet">{me.friend_code}</span>
      </Glass>

      <div className="pb-safe mt-auto space-y-3 pt-6 pb-4">
        {active ? (
          <Button variant="glass" onClick={stop}>
            취소
          </Button>
        ) : (
          <>
            <Button onClick={read}>친구 키링 읽기</Button>
            <Button variant="glass" onClick={write}>
              내 키링 태그에 내 명함 쓰기
            </Button>
          </>
        )}
        {!supported && (
          <Button variant="ghost" href="/card">
            QR · 링크로 공유하기
          </Button>
        )}
      </div>
    </main>
  );
}
