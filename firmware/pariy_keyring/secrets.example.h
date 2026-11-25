// =============================================================
//  이 파일을 복사해서 같은 폴더에 secrets.h 로 저장한 뒤 값을 채우세요.
//  secrets.h 는 .gitignore 에 있어서 깃허브에 올라가지 않습니다.
//  secrets.h 가 없으면 키링은 "오프라인 모드"(키링 와이파이 화면만)로 동작합니다.
// =============================================================
#pragma once

// 키링이 인터넷에 나갈 와이파이 (휴대폰 핫스팟 추천, 2.4GHz만 됨)
#define WIFI_SSID "내핫스팟이름"
#define WIFI_PASS "핫스팟비밀번호"

// Supabase 대시보드 > Project Settings > API (웹 .env.local 과 같은 값)
#define SUPABASE_URL      "https://xxxxxxxx.supabase.co"
#define SUPABASE_ANON_KEY "eyJhbGciOi..."

// 웹 /device 화면에서 "새 키링 등록"을 누르면 나오는 값
// (비밀키는 그때 한 번만 보여 줘요. 잃어버리면 /device 에서 재발급)
#define DEVICE_ID     "00000000-0000-0000-0000-000000000000"
#define DEVICE_SECRET "0123456789abcdef0123456789abcdef"
