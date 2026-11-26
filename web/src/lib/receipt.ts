// =============================================================
//  16 오늘의 갓생 영수증: 숫자 계산 (화면 · 이미지 저장에서 같이 씀)
//  서버(my_receipt)는 재료만 주고, 계산 규칙은 여기 한곳에 둠 -> 규칙을 바꾸기 쉬움
// =============================================================
import type { ReceiptData } from "@/lib/types";

export const STRIDE_M = 0.72; // 보폭 72cm
export const KCAL_PER_STEP = 0.04; // 1보당 0.04kcal
export const STEPS_PER_MIN = 110; // 보통 걸음 속도
export const MEET_BONUS = 100; // 키링 맞대기 1번당
export const NEW_FRIEND_BONUS = 300; // 새 친구 1명당
export const GOAL_BONUS = 1000; // 목표 달성

export type ReceiptLine = { label: string; value: string; note?: string };

export type Receipt = {
  keyringId: string; // A3F291C0 (키링 id 앞 8자리)
  meetTotal: number;
  printedAt: string; // 2026.11.23 21:40
  receiptNo: string; // 20261123-91C0-12
  steps: number;
  goal: number;
  rate: number; // 달성률 %
  achieved: boolean;
  usage: ReceiptLine[]; // 구매 내역
  points: ReceiptLine[]; // 포인트 내역
  total: number;
  barcode: string; // A3F291C009120
};

const n = (v: number) => v.toLocaleString("ko-KR");

function kstParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour").replace("24", "00"), mm: get("minute") };
}

export function buildReceipt(data: ReceiptData, now = new Date()): Receipt {
  const steps = Math.max(0, data.steps);
  const goal = Math.max(1, data.goal);
  const rate = Math.floor((steps * 100) / goal); // (steps / goal) * 100 은 9120/8000 에서 113.99… 가 돼서 정수로 먼저 곱함
  const achieved = steps >= goal;

  const km = (steps * STRIDE_M) / 1000;
  const kcal = Math.round(steps * KCAL_PER_STEP);
  const minutes = Math.round(steps / STEPS_PER_MIN);

  const meetPoints = data.meets_today * MEET_BONUS;
  const friendPoints = data.new_friends * NEW_FRIEND_BONUS;
  const goalPoints = achieved ? GOAL_BONUS : 0;
  const total = steps + meetPoints + friendPoints + goalPoints;

  const keyringId = data.device_id ? data.device_id.replace(/-/g, "").slice(0, 8).toUpperCase() : "NOKEYRNG";
  const t = kstParts(now);

  const points: ReceiptLine[] = [{ label: "걸음 포인트", value: `${n(steps)}P` }];
  if (meetPoints) points.push({ label: "친구 맞대기 보너스", value: `+${n(meetPoints)}P`, note: `${data.meets_today}번 × ${MEET_BONUS}P` });
  if (friendPoints) points.push({ label: "새 친구 보너스", value: `+${n(friendPoints)}P`, note: `${data.new_friends}명 × ${NEW_FRIEND_BONUS}P` });
  points.push({ label: "목표 달성 보너스", value: achieved ? `+${n(goalPoints)}P` : "0P", note: achieved ? undefined : `${n(goal - steps)}보 남았어요` });

  return {
    keyringId,
    meetTotal: data.meet_total,
    printedAt: `${t.y}.${t.m}.${t.d} ${t.hh}:${t.mm}`,
    receiptNo: `${t.y}${t.m}${t.d}-${keyringId.slice(-4)}-${data.meet_total}`,
    steps,
    goal,
    rate,
    achieved,
    usage: [
      { label: "오늘 걸음", value: `${n(steps)}보` },
      { label: "이동 거리", value: `${km.toFixed(2)}km`, note: `보폭 ${Math.round(STRIDE_M * 100)}cm 기준 추정` },
      { label: "소모 칼로리", value: `${n(kcal)}kcal`, note: `1보당 ${KCAL_PER_STEP}kcal 추정` },
      { label: "활동 시간", value: `약 ${n(minutes)}분` },
    ],
    points,
    total,
    barcode: `${keyringId}${String(steps).padStart(5, "0")}`,
  };
}

/** 바코드 막대 (글자마다 정해진 무늬라 같은 영수증은 항상 같은 모양). [굵기, 빈칸] 목록 */
export function barcodeBars(text: string): [number, number][] {
  const bars: [number, number][] = [[2, 1], [1, 1]];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    for (let i = 0; i < 3; i++) bars.push([1 + ((c >> (i * 2)) & 1) + ((c >> (i + 3)) & 1), 1 + ((c >> (i + 1)) & 1)]);
  }
  bars.push([1, 1], [2, 0]);
  return bars;
}
