"use client";

// 06_fam_create_1 팸 만들기: 이름 · 컬러 · 함께할 친구 고르기

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { errorMessage } from "@/lib/errors";
import { FAM_GRADIENTS, friendSubtitle } from "@/lib/format";
import { Avatar, Button, Glass, Loading, Sparkles, TopBar, cx } from "@/components/ui";
import { IconCheck, IconChevron } from "@/components/icons";
import type { FamColor, FamSummary } from "@/lib/types";

const COLORS = Object.keys(FAM_GRADIENTS) as FamColor[];
const COLOR_LABEL: Record<FamColor, string> = { purple: "보라", teal: "청록", coral: "코랄", periwinkle: "라벤더" };
const NAME_MAX = 20;

export default function FamCreatePage() {
  const router = useRouter();
  const { data, loading: listLoading } = useLoad(async () => {
    const [friends, fams] = await Promise.all([api.listFriends(), api.listMyFams()]);
    return { friends: friends.filter((f) => f.status === "accepted"), fams };
  });
  const [name, setName] = useState("");
  const [color, setColor] = useState<FamColor>("purple");
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const famOf = useMemo(() => {
    const m = new Map<string, FamSummary>();
    data?.fams.forEach((f) => f.members.forEach((x) => !m.has(x.user_id) && m.set(x.user_id, f)));
    return m;
  }, [data]);

  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= NAME_MAX;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const fam = await api.createFam({ name: trimmed, color, memberIds: picked });
      // 만들자마자 초대 공유 시트를 열어 줌
      router.replace(`/fam/${fam.id}?share=1&new=1`);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh flex-col">
      <Sparkles spots={[{ top: "70px", left: "88%", size: 16 }, { top: "470px", left: "6%", size: 12 }]} />
      <TopBar title="팸 만들기" back="/home" />

      <div className="flex-1 px-5">
        <label className="block">
          <span className="mb-2 block text-[15px] font-bold">팸 이름 설정하기</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            placeholder="예) 주말 러닝팸"
            className="glass h-14 w-full rounded-full px-6 text-[17px] font-medium outline-none placeholder:text-mute focus:border-violet/50"
          />
        </label>

        <p className="mt-5 mb-2 text-[15px] font-bold">팸 컬러</p>
        <div className="flex gap-3">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={COLOR_LABEL[c]}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cx(
                "flex size-12 items-center justify-center rounded-full text-white transition",
                color === c && "ring-[3px] ring-violet ring-offset-2 ring-offset-white/60",
              )}
              style={{ background: FAM_GRADIENTS[c] }}
            >
              {color === c && <IconCheck size={20} />}
            </button>
          ))}
        </div>

        <div className="mt-5 mb-2 flex items-end justify-between">
          <p className="text-[15px] font-bold">함께할 친구</p>
          <p className="text-[13px] font-semibold text-violet">{picked.length > 0 ? `${picked.length}명 선택` : "나중에 초대해도 돼요"}</p>
        </div>

        {listLoading && !data ? (
          <Loading />
        ) : data && data.friends.length === 0 ? (
          <Glass className="text-center text-[14px] text-sub">
            아직 친구가 없어요. 팸을 만든 뒤 팸 코드로 초대할 수 있어요.
          </Glass>
        ) : (
          <ul className="space-y-3 pb-4">
            {data?.friends.map((f) => {
              const on = picked.includes(f.friend_id);
              const fam = famOf.get(f.friend_id);
              return (
                <li key={f.friendship_id}>
                  <button
                    onClick={() => toggle(f.friend_id)}
                    aria-pressed={on}
                    className={cx(
                      "glass relative flex w-full items-center gap-4 rounded-[24px] px-4 py-3.5 text-left transition",
                      on && "border-violet/70 bg-white/85",
                    )}
                  >
                    <Avatar name={f.nickname} id={f.friend_id} size={50} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-bold">{f.nickname}</p>
                      <p className="mt-0.5 truncate text-[13px] text-sub">{friendSubtitle(f)}</p>
                    </div>
                    {fam && (
                      <span className="absolute top-2.5 right-4 max-w-[45%] truncate rounded-full bg-white/90 px-3 py-0.5 text-[12px] font-bold text-violet">
                        {fam.name}
                      </span>
                    )}
                    {on ? (
                      <span className="grad-primary mt-4 flex size-6 items-center justify-center rounded-full text-white">
                        <IconCheck size={14} />
                      </span>
                    ) : (
                      <IconChevron className="mt-4 text-ink-2" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p className="pb-2 text-center text-[14px] text-danger">{error}</p>}
      </div>

      <div className="pb-safe sticky bottom-0 px-5 pt-3">
        <Button onClick={submit} disabled={!valid} loading={loading}>
          팸 만들기
        </Button>
      </div>
    </main>
  );
}
