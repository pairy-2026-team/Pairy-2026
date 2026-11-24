"use client";

// 05_friends_1 친구 목록 · 검색 · 필터

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useLoad, useNow } from "@/lib/hooks";
import { errorMessage } from "@/lib/errors";
import { copyText } from "@/lib/device";
import { friendSubtitle } from "@/lib/format";
import {
  Avatar,
  Button,
  ConfirmSheet,
  Empty,
  ErrorState,
  FilterChip,
  Glass,
  Loading,
  Sheet,
  cx,
  useToast,
} from "@/components/ui";
import { IconChevron, IconSearch } from "@/components/icons";
import type { FamSummary, Friend, Profile } from "@/lib/types";

const RECENT_DAYS = 7;

export default function FriendsPage() {
  const toast = useToast();
  const { data, setData, error, loading, reload } = useLoad(async () => {
    const [friends, fams, me] = await Promise.all([api.listFriends(), api.listMyFams(), api.getMe()]);
    return { friends, fams, me };
  });
  const now = useNow(60000);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all"); // all | fam | recent | #태그
  const [addOpen, setAddOpen] = useState(false);
  const [menu, setMenu] = useState<Friend | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Friend | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 친구 목록에 없는 사람 검색
  const [others, setOthers] = useState<Profile[]>([]);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const t = setTimeout(async () => {
      try {
        setOthers(await api.searchProfiles(query));
      } catch {
        setOthers([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const friends = useMemo(() => data?.friends ?? [], [data]);
  const fams = useMemo(() => data?.fams ?? [], [data]);
  const accepted = useMemo(() => friends.filter((f) => f.status === "accepted"), [friends]);
  const incoming = friends.filter((f) => f.status === "pending" && !f.is_outgoing);
  const outgoing = friends.filter((f) => f.status === "pending" && f.is_outgoing);

  // 친구 → 같이 있는 팸 이름 (배지)
  const famOf = useMemo(() => {
    const m = new Map<string, FamSummary>();
    fams.forEach((f) => f.members.forEach((x) => !m.has(x.user_id) && m.set(x.user_id, f)));
    return m;
  }, [fams]);

  // 자주 나오는 태그 2개를 필터로
  const topTags = useMemo(() => {
    const count = new Map<string, number>();
    accepted.forEach((f) => f.tags.filter((t) => !/^[EI][NS][TF][JP]$/.test(t)).forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)));
    return [...count.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
  }, [accepted]);

  const visible = useMemo(() => {
    const query = q.trim().replace(/^[@#]/, "").toLowerCase();
    let list = accepted;
    if (filter === "fam") list = list.filter((f) => famOf.has(f.friend_id));
    if (filter === "recent")
      list = list
        .filter((f) => now - new Date(f.accepted_at ?? f.created_at).getTime() < RECENT_DAYS * 86400000)
        .sort((a, b) => (b.accepted_at ?? "").localeCompare(a.accepted_at ?? ""));
    if (filter.startsWith("#")) list = list.filter((f) => f.tags.includes(filter.slice(1)));
    if (query)
      list = list.filter(
        (f) =>
          f.nickname.toLowerCase().includes(query) ||
          (f.handle ?? "").toLowerCase().includes(query) ||
          f.tags.some((t) => t.toLowerCase().includes(query)) ||
          f.friend_code === query.toUpperCase(),
      );
    if (filter === "recent") return list;
    // 즐겨찾기 → 맞대기 많이 한 순
    return [...list].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || b.meet_count - a.meet_count);
  }, [accepted, filter, q, famOf, now]);

  const knownIds = new Set(friends.map((f) => f.friend_id));
  const strangers = q.trim().length >= 2 ? others.filter((p) => !knownIds.has(p.id)) : [];

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast(done);
      await reload(true);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleFav = async (f: Friend) => {
    setData((d) =>
      d
        ? { ...d, friends: d.friends.map((x) => (x.friendship_id === f.friendship_id ? { ...x, is_favorite: !x.is_favorite } : x)) }
        : d,
    );
    try {
      await api.toggleFavorite(f.friendship_id);
    } catch (e) {
      toast(errorMessage(e));
      reload(true);
    }
  };

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "불러오지 못했어요."} onRetry={() => reload()} />;

  return (
    <main className="px-5">
      <header className="pt-safe flex items-center justify-between pt-5 pb-4">
        <h1 className="text-[26px] font-bold">
          친구 <span className="text-[17px] font-bold text-violet">{accepted.length}명</span>
        </h1>
        <button
          onClick={() => setAddOpen(true)}
          className="grad-primary h-11 rounded-full px-5 text-[15px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(91,63,224,0.9)]"
        >
          + 친구 추가
        </button>
      </header>

      {/* 검색 */}
      <label className="glass flex h-[52px] items-center gap-3 rounded-full px-5">
        <IconSearch size={22} className="shrink-0 text-ink-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름, 태그, 번호로 찾기"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-sub"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="지우기" className="text-sub">
            ✕
          </button>
        )}
      </label>

      {/* 필터 */}
      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          전체
        </FilterChip>
        <FilterChip active={filter === "fam"} onClick={() => setFilter("fam")}>
          팸
        </FilterChip>
        <FilterChip active={filter === "recent"} onClick={() => setFilter("recent")}>
          최근
        </FilterChip>
        {topTags.map((t) => (
          <FilterChip key={t} active={filter === `#${t}`} onClick={() => setFilter(`#${t}`)}>
            {t}
          </FilterChip>
        ))}
      </div>

      {/* 받은 요청 */}
      {incoming.length > 0 && filter === "all" && !q && (
        <Glass className="mt-4 p-4">
          <p className="mb-2 text-[14px] font-bold text-violet">친구 요청 {incoming.length}</p>
          {incoming.map((f) => (
            <div key={f.friendship_id} className="flex items-center gap-3 py-1.5">
              <Avatar name={f.nickname} id={f.friend_id} size={42} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold">{f.nickname}</p>
                <p className="truncate text-[12px] text-sub">{friendSubtitle(f)}</p>
              </div>
              <Button
                size="sm"
                variant="glass"
                disabled={busy === f.friendship_id}
                onClick={() => run(f.friendship_id, () => api.respondFriendRequest(f.friendship_id, false), "요청을 거절했어요")}
              >
                거절
              </Button>
              <Button
                size="sm"
                loading={busy === f.friendship_id}
                onClick={() =>
                  run(f.friendship_id, () => api.respondFriendRequest(f.friendship_id, true), `${f.nickname}님과 친구가 됐어요`)
                }
              >
                수락
              </Button>
            </div>
          ))}
        </Glass>
      )}

      <ul className="mt-4 space-y-2.5">
        {visible.map((f) => {
          const fam = famOf.get(f.friend_id);
          return (
            <li key={f.friendship_id}>
              <button onClick={() => setMenu(f)} className="glass relative flex w-full items-center gap-3.5 rounded-[24px] px-4 py-3 text-left transition active:scale-[0.99]">
                <Avatar name={f.nickname} id={f.friend_id} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-[17px] font-bold">
                    {f.nickname}
                    {f.is_favorite && <span className="text-[14px] text-amber">★</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-sub">{friendSubtitle(f)}</p>
                </div>
                {fam && (
                  <span className="absolute top-3 right-4 max-w-[45%] truncate rounded-full bg-white/90 px-3 py-1 text-[12px] font-bold text-violet">
                    {fam.name}
                  </span>
                )}
                <IconChevron className="mt-5 text-ink-2" />
              </button>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 &&
        (q ? (
          <p className="py-10 text-center text-[14px] text-sub">‘{q}’에 맞는 친구가 없어요</p>
        ) : (
          <div className="mt-4">
            <Empty
              title={filter === "all" ? "아직 친구가 없어요" : "여기에 해당하는 친구가 없어요"}
              desc={filter === "all" ? "친구 키링을 폰 뒷면에 대거나 번호로 추가해 보세요" : undefined}
              action={
                filter === "all" && (
                  <Button size="md" onClick={() => setAddOpen(true)}>
                    친구 추가하기
                  </Button>
                )
              }
            />
          </div>
        ))}

      {outgoing.length > 0 && filter === "all" && !q && (
        <p className="mt-4 text-center text-[13px] text-sub">
          수락을 기다리는 요청 {outgoing.length}개 · {outgoing.map((o) => o.nickname).join(", ")}
        </p>
      )}

      {strangers.length > 0 && (
        <section className="mt-6">
          <p className="mb-2 text-[14px] font-bold text-ink-2">다른 Pairy 친구 찾기</p>
          <ul className="space-y-2">
            {strangers.map((p) => (
              <li key={p.id} className="glass flex items-center gap-3 rounded-[22px] px-4 py-3">
                <Avatar name={p.nickname} id={p.id} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold">{p.nickname}</p>
                  <p className="truncate text-[12px] text-sub">{friendSubtitle(p)}</p>
                </div>
                <Button
                  size="sm"
                  loading={busy === p.id}
                  onClick={() =>
                    run(p.id, async () => {
                      const r = await api.sendFriendRequest(p.friend_code, "search");
                      toast(r.status === "accepted" ? `${p.nickname}님과 친구가 됐어요` : "친구 요청을 보냈어요");
                    })
                  }
                >
                  요청
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AddFriendSheet open={addOpen} myCode={data.me.friend_code} onClose={() => setAddOpen(false)} onAdded={() => reload(true)} />

      {/* 친구 메뉴 */}
      <Sheet open={!!menu} onClose={() => setMenu(null)}>
        {menu && (
          <div className="pb-2">
            <div className="flex items-center gap-4">
              <Avatar name={menu.nickname} id={menu.friend_id} size={60} />
              <div className="min-w-0">
                <p className="text-[21px] font-bold">{menu.nickname}</p>
                <p className="truncate text-[14px] text-sub">{friendSubtitle(menu)}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="glass rounded-[20px] p-4">
                <p className="text-[12px] text-sub">키링 맞댄 횟수</p>
                <p className="mt-1 text-[22px] font-bold">
                  {menu.meet_count}
                  <span className="ml-1 text-[13px] font-medium text-sub">번</span>
                </p>
              </div>
              <div className="glass rounded-[20px] p-4">
                <p className="text-[12px] text-sub">같은 팸</p>
                <p className="mt-1 truncate text-[16px] font-bold">{famOf.get(menu.friend_id)?.name ?? "없음"}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Button
                variant="glass"
                onClick={() => {
                  toggleFav(menu);
                  setMenu(null);
                }}
              >
                {menu.is_favorite ? "즐겨찾기 해제" : "★ 즐겨찾기"}
              </Button>
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => {
                  setConfirmRemove(menu);
                  setMenu(null);
                }}
              >
                친구 삭제
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={!!confirmRemove}
        title={`${confirmRemove?.nickname}님을 삭제할까요?`}
        desc="같은 팸에 있다면 팸 알림은 계속 받아요."
        confirmLabel="삭제"
        danger
        loading={!!confirmRemove && busy === confirmRemove.friendship_id}
        onConfirm={() =>
          confirmRemove &&
          run(confirmRemove.friendship_id, () => api.removeFriend(confirmRemove.friendship_id), "친구를 삭제했어요").then(() =>
            setConfirmRemove(null),
          )
        }
        onClose={() => setConfirmRemove(null)}
      />
    </main>
  );
}

function AddFriendSheet({
  open,
  myCode,
  onClose,
  onAdded,
}: {
  open: boolean;
  myCode: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.sendFriendRequest(code, "code");
      toast(r.status === "accepted" ? "친구가 됐어요!" : "친구 요청을 보냈어요");
      setCode("");
      onAdded();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <h3 className="text-[20px] font-bold">친구 추가</h3>
      <p className="mt-1 text-[14px] text-sub">친구 번호 6자리를 입력하세요</p>
      <input
        value={code}
        onChange={(e) => {
          setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
          setError(null);
        }}
        autoCapitalize="characters"
        placeholder="ABC123"
        className={cx(
          "glass mt-4 h-16 w-full rounded-[22px] text-center text-[26px] font-bold tracking-[0.3em] outline-none",
          "focus:border-violet",
        )}
      />
      {error && <p className="mt-2 text-[14px] text-danger">{error}</p>}
      <Button className="mt-4" disabled={code.length !== 6} loading={loading} onClick={submit}>
        친구 요청 보내기
      </Button>
      <button
        onClick={async () => toast((await copyText(myCode)) ? "내 번호를 복사했어요" : myCode)}
        className="glass mt-3 w-full rounded-full py-3 text-[14px] text-ink-2"
      >
        내 번호 <b className="tracking-wider text-violet">{myCode}</b> · 복사
      </button>
      <p className="mt-3 mb-3 text-center text-[13px] text-sub">키링을 폰 뒷면에 대면 번호 없이 바로 친구가 돼요</p>
    </Sheet>
  );
}
