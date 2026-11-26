"use client";

// 04 내 명함 편집
//  - 바뀐 칸만 api.updateMyCard 로 보냄 (DB update_my_profile: null = 그대로, "" = 비우기)
//  - 글자 수 제한은 DB와 같게: 이름 20 · 아이디 2~30 · 소속 30 · 소개 60 · 태그 6개×12자 · 링크 40/200

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { errorMessage } from "@/lib/errors";
import { Button, ErrorState, Glass, Loading, TopBar, cx, useToast } from "@/components/ui";
import type { Card, CardInput } from "@/lib/types";

type Form = {
  nickname: string;
  handle: string;
  affiliation: string;
  bio: string;
  tags: string[];
  instagram: string;
  behance: string;
  portfolio_url: string;
};
const toForm = (c: Card): Form => ({
  nickname: c.nickname,
  handle: c.handle ?? "",
  affiliation: c.affiliation ?? "",
  bio: c.bio ?? "",
  tags: c.tags,
  instagram: c.instagram ?? "",
  behance: c.behance ?? "",
  portfolio_url: c.portfolio_url ?? "",
});

export default function CardEditPage() {
  const { data, error, loading, reload } = useLoad(() => api.getMyCard());
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "명함을 불러오지 못했어요."} onRetry={() => reload()} />;
  return <Editor initial={toForm(data)} />;
}

function Editor({ initial }: { initial: Form }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<Form>(initial);
  const [tagDraft, setTagDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const handleOk = form.handle === "" || /^@?[a-z0-9._]{2,30}$/i.test(form.handle.trim());
  const valid = form.nickname.trim().length > 0 && handleOk;

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").trim().slice(0, 12);
    setTagDraft("");
    if (!t || form.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    if (form.tags.length >= 6) return toast("태그는 6개까지 넣을 수 있어요");
    set({ tags: [...form.tags, t] });
  };

  const save = async () => {
    if (!valid || saving) return;
    // 입력 중인 태그가 있으면 같이 넣음
    const tags = tagDraft.trim() ? [...form.tags, tagDraft.trim().replace(/^#/, "")].slice(0, 6) : form.tags;
    const next = { ...form, tags };
    const changed: CardInput = {};
    (Object.keys(next) as (keyof Form)[]).forEach((k) => {
      if (JSON.stringify(next[k]) !== JSON.stringify(initial[k])) Object.assign(changed, { [k]: next[k] });
    });
    if (Object.keys(changed).length === 0) return router.push("/card");
    setSaving(true);
    setError(null);
    try {
      await api.updateMyCard(changed);
      toast("명함을 저장했어요");
      router.push("/card");
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <main className="relative px-5 pb-8">
      <TopBar back="/card" backStyle="circle" title="명함 편집" className="-mx-5" />

      <Glass className="space-y-4 rounded-[26px]">
        <Field label="이름" count={`${form.nickname.length}/20`}>
          <input value={form.nickname} maxLength={20} onChange={(e) => set({ nickname: e.target.value })} className={inputCls} placeholder="이하은" />
        </Field>
        <Field label="아이디" hint={handleOk ? "영어 소문자 · 숫자 · . _ 로 2~30자" : "영어 소문자 · 숫자 · . _ 만 쓸 수 있어요"} bad={!handleOk}>
          <div className={cx(inputCls, "flex items-center gap-1")}>
            <span className="text-sub">@</span>
            <input
              value={form.handle.replace(/^@/, "")}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => set({ handle: e.target.value.toLowerCase() })}
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="haeun.dsn"
            />
          </div>
        </Field>
        <Field label="소속" count={`${form.affiliation.length}/30`}>
          <input value={form.affiliation} maxLength={30} onChange={(e) => set({ affiliation: e.target.value })} className={inputCls} placeholder="서울 · 디자인 전공" />
        </Field>
        <Field label="한 줄 소개" count={`${form.bio.length}/60`}>
          <textarea
            value={form.bio}
            maxLength={60}
            rows={2}
            onChange={(e) => set({ bio: e.target.value })}
            className={cx(inputCls, "h-auto resize-none rounded-[20px] py-3 leading-snug")}
            placeholder="사진 찍고, 달리고, 가끔 그림 그려요."
          />
        </Field>
        <Field label="태그" count={`${form.tags.length}/6`} hint="입력하고 엔터 또는 쉼표">
          <div className={cx(inputCls, "flex h-auto min-h-12 flex-wrap items-center gap-1.5 py-2")}>
            {form.tags.map((t) => (
              <button
                key={t}
                onClick={() => set({ tags: form.tags.filter((x) => x !== t) })}
                className="rounded-full bg-lilac px-3 py-1 text-[13px] font-bold text-violet"
                aria-label={`${t} 태그 지우기`}
              >
                #{t} ✕
              </button>
            ))}
            {form.tags.length < 6 && (
              <input
                value={tagDraft}
                maxLength={13}
                onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value.slice(0, -1)) : setTagDraft(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addTag(tagDraft);
                  } else if (e.key === "Backspace" && !tagDraft && form.tags.length) {
                    set({ tags: form.tags.slice(0, -1) });
                  }
                }}
                onBlur={() => tagDraft && addTag(tagDraft)}
                className="min-w-[80px] flex-1 bg-transparent py-1 outline-none"
                placeholder={form.tags.length ? "" : "디자인, ENFP"}
              />
            )}
          </div>
        </Field>
      </Glass>

      <h2 className="mt-6 mb-2 px-1 text-[15px] font-bold text-ink-2">링크</h2>
      <Glass className="space-y-4 rounded-[26px]">
        <Field label="Instagram">
          <div className={cx(inputCls, "flex items-center gap-1")}>
            <span className="text-sub">@</span>
            <input
              value={form.instagram.replace(/^@/, "")}
              maxLength={40}
              autoCapitalize="none"
              onChange={(e) => set({ instagram: e.target.value })}
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="haeun.dsn"
            />
          </div>
        </Field>
        <Field label="Behance">
          <input value={form.behance} maxLength={40} autoCapitalize="none" onChange={(e) => set({ behance: e.target.value })} className={inputCls} placeholder="haeun" />
        </Field>
        <Field label="포트폴리오 주소">
          <input
            value={form.portfolio_url}
            maxLength={200}
            inputMode="url"
            autoCapitalize="none"
            onChange={(e) => set({ portfolio_url: e.target.value })}
            className={inputCls}
            placeholder="https://"
          />
        </Field>
      </Glass>

      {error && <p className="mt-4 text-center text-[14px] text-danger">{error}</p>}
      <div className="mt-6">
        <Button onClick={save} loading={saving} disabled={!valid}>
          저장하기
        </Button>
      </div>
    </main>
  );
}

const inputCls = "h-12 w-full rounded-full bg-white/85 px-5 text-[16px] outline-none ring-violet/60 focus-within:ring-2 focus:ring-2";

function Field({ label, count, hint, bad, children }: { label: string; count?: string; hint?: string; bad?: boolean; children: ReactNode }) {
  return (
    // <label> 로 감싸면 라벨을 눌렀을 때 안의 첫 버튼(태그 지우기)이 눌려서 div 로 둠
    <div className="block">
      <span className="mb-1.5 flex items-center justify-between px-1 text-[13px] font-bold text-ink-2">
        {label}
        {count && <span className="font-medium text-sub">{count}</span>}
      </span>
      {children}
      {hint && <span className={cx("mt-1 block px-1 text-[12px]", bad ? "text-danger" : "text-sub")}>{hint}</span>}
    </div>
  );
}
