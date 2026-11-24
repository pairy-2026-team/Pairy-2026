const KST = "Asia/Seoul";

/** KST 기준 YYYY-MM-DD */
export function kstDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KST }).format(d);
}

/** 오늘 포함 최근 n일 (오래된 날짜부터) */
export function lastNDays(n: number) {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(kstDate(new Date(Date.now() - i * 86400000)));
  return out;
}

export function weekdayLabel(ymd: string) {
  // KST 정오 = UTC 03시, 같은 날짜
  return ["일", "월", "화", "수", "목", "금", "토"][new Date(`${ymd}T12:00:00+09:00`).getUTCDay()];
}

export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "방금";
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function clock(iso: string | null | undefined) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export function dateLabel(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric" }).format(new Date(iso));
}
