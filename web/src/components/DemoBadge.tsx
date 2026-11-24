"use client";

import { IS_DEMO } from "@/lib/supabase/client";

/** 데모 모드일 때만 오른쪽 아래에 작게 표시 */
export function DemoBadge() {
  if (!IS_DEMO) return null;
  return (
    <div className="pointer-events-none fixed top-1 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink/40 px-2 py-0.5 text-[10px] font-semibold text-white">
      DEMO
    </div>
  );
}
