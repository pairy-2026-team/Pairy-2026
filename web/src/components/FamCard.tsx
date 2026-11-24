"use client";

import { useRouter } from "next/navigation";
import { n } from "@/lib/format";
import type { FamSummary } from "@/lib/types";
import { AvatarStack, Glass } from "./ui";

export function FamCard({ fam, meId }: { fam: FamSummary; meId: string }) {
  const router = useRouter();
  // 나를 마지막에: 친구 얼굴이 먼저 보이게
  const people = [...fam.members.filter((m) => m.user_id !== meId), ...fam.members.filter((m) => m.user_id === meId)];
  return (
    <Glass href={`/fam/${fam.id}`} className="p-4">
      <div className="flex items-center justify-between">
        <AvatarStack people={people} size={38} max={4} />
        <button
          onClick={(e) => {
            e.preventDefault();
            router.push(`/fam/${fam.id}?share=1`);
          }}
          className="grad-primary h-9 rounded-full px-5 text-[14px] font-bold text-white"
        >
          공유
        </button>
      </div>
      <p className="mt-3 text-[18px] font-bold">{fam.name}</p>
      <p className="mt-1 text-[14px] text-sub">
        오늘 함께 {n(fam.today_steps)}걸음 · {fam.member_count}명
      </p>
    </Glass>
  );
}
