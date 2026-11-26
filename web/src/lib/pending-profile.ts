"use client";

// 회원가입 2단계에서 입력한 이름 · 아이디 · 태그를
// "이메일 인증 -> 나중에 로그인" 인 경우에도 잃어버리지 않게 잠깐 보관했다가 첫 로그인 때 저장

import { api } from "@/lib/api";
import type { CardInput } from "@/lib/types";

const KEY = "pairy-pending-profile";

export function savePendingProfile(input: CardInput) {
  try {
    localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    /* 저장 못 해도 가입은 진행 */
  }
}

/** 보관해 둔 프로필이 있으면 저장하고 지움. 실패 이유(아이디 중복 등)를 돌려줌 */
export async function applyPendingProfile(): Promise<unknown | null> {
  let input: CardInput | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    input = raw ? (JSON.parse(raw) as CardInput) : null;
  } catch {
    input = null;
  }
  if (!input) return null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
  try {
    await api.updateMyCard(input);
    return null;
  } catch (e) {
    return e;
  }
}
