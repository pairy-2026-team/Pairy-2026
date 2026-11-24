"use client";

// 낙상 알림에 붙일 위치 (폰 GPS)
//  - 위치 권한은 낙상 화면이 처음 열릴 때만 물어봄
//  - 권한 거부 / 시간 초과면 null -> 알림 전송은 막지 않음
//  - 주소는 OpenStreetMap 역지오코딩(키 불필요)으로 한 번만 구하고, 실패하면 좌표만 저장

export type GeoPoint = { lat: number; lng: number; accuracy: number | null };

export function getLocation(timeoutMs = 6000): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
    );
  });
}

/** 위치가 바뀔 때마다 호출 (최소 minIntervalMs 간격). 반환값으로 중지 */
export function watchLocation(onPoint: (p: GeoPoint) => void, minIntervalMs = 15000) {
  if (typeof navigator === "undefined" || !navigator.geolocation) return () => {};
  let last = 0;
  const id = navigator.geolocation.watchPosition(
    (p) => {
      const now = Date.now();
      if (now - last < minIntervalMs) return;
      last = now;
      onPoint({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null });
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 10000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

type NominatimAddress = Partial<
  Record<
    | "province"
    | "state"
    | "city"
    | "county"
    | "borough"
    | "city_district"
    | "town"
    | "village"
    | "suburb"
    | "quarter"
    | "road"
    | "house_number"
    | "amenity"
    | "building",
    string
  >
>;

/** 좌표 -> "서울 마포구 월드컵로 212". 실패하면 null */
export async function reverseGeocode(lat: number, lng: number, timeoutMs = 4000): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=ko&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { address?: NominatimAddress; display_name?: string };
    const a = j.address ?? {};
    const city = (a.city ?? a.province ?? a.state ?? "").replace(/특별시|광역시|특별자치시/, "");
    const gu = a.borough ?? a.city_district ?? a.county ?? a.town ?? "";
    const road = a.road ? `${a.road}${a.house_number ? ` ${a.house_number}` : ""}` : (a.suburb ?? a.quarter ?? a.village ?? "");
    const text = [city, gu, road].filter(Boolean).join(" ").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** 지도 앱에서 열기 (카카오맵 웹 링크: 앱이 있으면 앱으로 열림) */
export function mapUrl(lat: number, lng: number, label = "넘어진 위치") {
  return `https://map.kakao.com/link/map/${encodeURIComponent(label)},${lat},${lng}`;
}

export const coordText = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
