import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/format";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const DEMO = process.env.NEXT_PUBLIC_DEMO === "1" || !URL_ || !KEY;

// 로그인 없이 열 수 있는 경로: 랜딩(/) + 아래로 시작하는 주소
const PUBLIC = ["/login", "/auth", "/start", "/signup", "/monitor"]; // /monitor: 키링 시리얼 모니터(서버 안 씀)
// 이미 로그인했으면 볼 필요 없는 화면 -> 홈(또는 ?next)으로
const AUTH_ONLY_GUEST = ["/start", "/signup", "/login"];
const isPublic = (path: string) => path === "/" || PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));

/** Supabase 세션 쿠키를 갱신하고, 로그인 안 했으면 /start(시작 화면)로 보낸다 */
export async function proxy(request: NextRequest) {
  if (DEMO) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(URL_, KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    // A 파트 00_start: 처음 온 사람도 가입할 수 있게 시작 화면으로 (로그인 버튼도 있음)
    url.pathname = "/start";
    // NFC/QR로 들어온 주소(초대 코드 등)를 로그인 후 그대로 이어가기
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (user && AUTH_ONLY_GUEST.includes(path)) {
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
