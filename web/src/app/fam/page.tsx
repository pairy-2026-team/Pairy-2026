"use client";

// 팸 탭: 내 팸 목록 (홈의 '모두 보기')

import Link from "next/link";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { Button, ErrorState, Glass, Loading } from "@/components/ui";
import { FamCard } from "@/components/FamCard";

export default function FamListPage() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [fams, me] = await Promise.all([api.listMyFams(), api.getMe()]);
    return { fams, me };
  });

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "불러오지 못했어요."} onRetry={() => reload()} />;

  return (
    <main className="px-5">
      <header className="pt-safe flex items-center justify-between pt-6 pb-5">
        <h1 className="text-[28px] font-bold">
          우리 팸 <span className="text-[17px] text-violet">{data.fams.length}</span>
        </h1>
        <Link href="/fam/join" className="glass h-11 rounded-full px-5 text-[15px] leading-[44px] font-bold text-violet">
          코드로 참여
        </Link>
      </header>

      <div className="space-y-3">
        {data.fams.map((f) => (
          <FamCard key={f.id} fam={f} meId={data.me.id} />
        ))}
        {data.fams.length === 0 && (
          <Glass className="text-center">
            <p className="text-[16px] font-bold">아직 팸이 없어요</p>
            <p className="mt-1 text-[14px] text-sub">친구를 골라 팸을 만들거나, 받은 팸 코드로 참여해 보세요</p>
          </Glass>
        )}
      </div>

      <Button href="/fam/new" className="mt-5">
        팸 만들기
      </Button>
    </main>
  );
}
