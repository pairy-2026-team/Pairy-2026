import type { RecipientStatus } from "@/lib/types";
import { cx } from "./ui";

export const RECIPIENT_LABEL: Record<RecipientStatus, string> = {
  delivered: "전달됨",
  seen: "확인했어요",
  calling: "전화 거는 중",
  on_the_way: "가고 있어요",
};

export function RecipientChip({ status }: { status: RecipientStatus }) {
  return (
    <span
      className={cx(
        "inline-flex h-8 items-center rounded-full px-4 text-[13px] font-bold",
        status === "delivered" && "border border-white bg-white/80 text-ink",
        status === "seen" && "bg-mint text-mint-ink",
        (status === "calling" || status === "on_the_way") && "bg-lilac text-violet",
      )}
    >
      {RECIPIENT_LABEL[status]}
    </span>
  );
}
