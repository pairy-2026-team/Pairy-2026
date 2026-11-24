import type { FamColor } from "@/lib/types";

/** "PAIRY-7K2Q", "pairy 7k2q", 예전 "PARIY-7K2Q", "7K2Q" -> "7K2Q" (DB normalize_fam_code 와 같은 규칙) */
export function normalizeFamCode(input: string) {
  return input
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/^PA(IR|RI)Y-?/, "") // 예전 표기 PARIY- 도 받기
    .replace(/[^A-Z0-9]/g, "");
}

export const famCodeLabel = (code: string) => `PAIRY-${code}`;

/** 짧은 초대 주소: /f/7K2Q */
export function famInviteUrl(code: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/f/${code}`;
}
export const prettyUrl = (url: string) => url.replace(/^https?:\/\//, "");

/** 이름 첫 글자 (아바타) */
export const initial = (name: string) => Array.from(name.trim())[0] ?? "?";

// 시안의 이니셜 아바타 그라데이션 (지 · 민 · 서 · 도 · 하 · 태 순서)
export const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#8B5CF6 0%,#E879C9 100%)",
  "linear-gradient(135deg,#2BB5A0 0%,#5B8DEF 100%)",
  "linear-gradient(135deg,#FF8A80 0%,#FFB38A 100%)",
  "linear-gradient(135deg,#7C83FD 0%,#A79BFF 100%)",
  "linear-gradient(135deg,#FF8A5B 0%,#FF6FA3 100%)",
  "linear-gradient(135deg,#4AA3F0 0%,#47C6B2 100%)",
];

/** 같은 사람은 항상 같은 색 */
export function avatarGradient(key: string) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export const FAM_GRADIENTS: Record<FamColor, string> = {
  purple: "linear-gradient(135deg,#7C5CF0 0%,#C25BD9 100%)",
  teal: "linear-gradient(135deg,#2BB5A0 0%,#5B8DEF 100%)",
  coral: "linear-gradient(135deg,#FF8A80 0%,#FFB38A 100%)",
  periwinkle: "linear-gradient(135deg,#8E8BFF 0%,#6F86F5 100%)",
};

export const n = (v: number) => v.toLocaleString("ko-KR");

export function friendSubtitle(f: { handle: string | null; tags: string[]; friend_code?: string }) {
  const tags = f.tags.slice(0, 2).map((t) => `#${t}`).join(" ");
  const handle = f.handle ? `@${f.handle}` : f.friend_code ? `번호 ${f.friend_code}` : "";
  return [handle, tags].filter(Boolean).join(" · ");
}
