# Pairy 웹 (B 파트: 홈 · 친구 · 팸 · 낙상/SOS 알림)

스마트폰에서 **NFC 태그 / QR / 링크**로 열어서 쓰는 모바일 웹입니다.
Next.js(App Router) + Supabase + Vercel, 글씨체는 Pretendard.

## 실행

```bash
cd web
npm install
cp .env.example .env.local   # Supabase 주소/키 입력 (비워 두면 데모 모드)
npm run dev                  # http://localhost:3000
```

- **데모 모드**: `.env.local`이 없거나 `NEXT_PUBLIC_DEMO=1`이면 Supabase 없이 가짜 데이터로 돌아갑니다.
  화면 위에 `DEMO` 표시가 뜨고, 데이터는 브라우저 localStorage에 저장돼요.
  `안전` 탭 맨 아래에서 **친구가 넘어진 상황 보기 / 데모 데이터 초기화**를 할 수 있어요.
- 스마트폰으로 확인: 같은 와이파이에서 `npm run dev -- -H 0.0.0.0` 후 `http://<PC IP>:3000`
  (NFC 쓰기·공유는 https에서만 동작하므로 실제 테스트는 Vercel 배포 주소로 하세요)

## Supabase 설정 (한 번만)

1. Supabase 대시보드 → **SQL Editor**에 `supabase/migrations/20261124000000_part_b_home_friends_fam_safety.sql` 전체를 붙여 넣고 실행
   (여러 번 실행해도 안전하게 작성돼 있어요. 이미 실행했어도 **이번 버전(걸음 목표 · 알림 위치)을 반영하려면 한 번 더 실행**하세요)
2. **Database → Extensions**에서 `pg_cron` 켜고 SQL Editor에서 한 번 실행
   ```sql
   select cron.schedule('pairy-flush-countdowns', '* * * * *', 'select public.flush_expired_countdowns()');
   ```
   → 낙상 카운트다운 중에 앱이 꺼져도 대기시간+30초 뒤 자동으로 알림이 전송됩니다.
3. **Database → Replication**에서 `emergency_alerts`, `daily_steps`가 `supabase_realtime`에 들어갔는지 확인 (SQL이 자동으로 추가함)
4. Vercel 환경변수에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 등록
   Vercel 프로젝트의 **Root Directory는 `web`** 으로 지정

## 화면 ↔ 파일 (시안 파일명 기준)

| 시안 | 주소 | 파일 |
|---|---|---|
| 01_home_1 홈 | `/home` | `src/app/home/page.tsx` |
| 05_friends_1 친구 | `/friends` | `src/app/friends/page.tsx` |
| 06_fam_create_1 팸 만들기 | `/fam/new` | `src/app/fam/new/page.tsx` |
| 07_fam_detail_1 팸 상세 | `/fam/[id]` | `src/app/fam/[id]/page.tsx` |
| 08_fam_share_1 팸 초대 시트 | `/fam/[id]?share=1` | `src/components/FamShareSheet.tsx` |
| (팸 탭) 내 팸 목록 | `/fam` | `src/app/fam/page.tsx` |
| (QR·NFC·링크) 팸 참여 | `/f/7K2Q` → `/fam/join?code=7K2Q` | `src/app/fam/join/page.tsx` |
| 10_fall_detect 낙상 감지 | `/fall?source=keyring` | `src/app/fall/page.tsx` |
| 11_fall_sos_sent 도움 요청 전송 | `/fall/[id]/sent` | `src/app/fall/[id]/sent/page.tsx` |
| 14_danger_alert 긴급 알림 | `/alerts/[id]` | `src/app/alerts/[id]/page.tsx` |
| 15_danger_settings 위험 감지 설정 | `/settings/safety` | `src/app/settings/safety/page.tsx` |
| (홈 걸음 카드) 걸음 수 · 목표 설정 | `/steps` | `src/app/steps/page.tsx` |
| (홈 종 아이콘) 긴급 알림 목록 · 기록 | `/alerts` | `src/app/alerts/page.tsx` |

공통 디자인(글래스 카드, 그라데이션 버튼, 이니셜 아바타, 배경 블롭)은 `src/app/globals.css`와 `src/components/ui.tsx`에 있어요.
> ⚠️ `body`에 배경색을 넣지 마세요. 시안 배경(`.pairy-bg`, z-index -1)을 덮어서 화면이 단색이 됩니다.
A 파트 화면과 연결되는 주소: 하단 탭 `NFC → /nfc`, `마이 → /my`, 홈 바로가기 `내 명함 → /card`.
A 파트 주소가 다르면 `src/components/BottomNav.tsx`와 홈 바로가기만 바꾸면 됩니다.
`/login`은 테스트용 임시 화면이에요.

## A 파트와 함께 쓰는 DB 칼럼

- `profiles.handle`(@haeun.dsn), `profiles.tags`(디자인, ENFP …), `profiles.friend_code`(친구 번호 6자리)
- `profiles.step_goal`: 하루 걸음 목표 (기본 5,000, 1,000~50,000). `set_step_goal()` RPC로 저장
- 전화번호는 다루지 않아요. 긴급 알림의 전화 버튼은 119로 걸려요
- 키링 연결 상태(홈의 "정상 · 키링 연결됨")는 기기 연결(12·13) 파트 값으로 `HomeData.device`를 채우면 됩니다

## NFC 태그에 쓸 주소

| 용도 | URL |
|---|---|
| 팸 초대 | `https://<도메인>/f/<팸코드 4자리>` (초대 시트의 NFC 버튼으로 안드로이드에서 바로 태그에 쓰기 가능) |
| 친구 추가 | `https://<도메인>/friends/add?code=<친구번호>&source=nfc` |
| 낙상 화면 (시연) | `https://<도메인>/fall?source=keyring` |

## 상태 흐름

### 낙상 알림 `emergency_alerts.status`

```
countdown ──취소──────────────────▶ cancelled
    │
    ├─ 즉시 요청 / 타이머 0초 ──────▶ sent ──(본인 '괜찮아요' 또는 응답자 종료)──▶ resolved
    │                                 ▲
    └─ 앱이 꺼짐 (대기시간+30초, pg_cron) ┘  auto_sent = true
```

### 받는 사람별 응답 `alert_recipients.status` (sent 상태일 때만, 뒤로 돌아가지 않음)

```
delivered(전달됨) ─'내가 확인했어요'─▶ seen(확인했어요) ─'지금 갈게요'─▶ on_the_way(가고 있어요)
        └──────────── 전화하기 ────────────▶ calling(전화 거는 중)
```
`emergency_alerts.response_status`는 가장 앞선 응답의 요약이고, 11번 화면 "알림 받은 팸" 목록은 사람별 값을 실시간으로 보여줍니다.

### 예외 처리

| 상황 | 처리 |
|---|---|
| 0초 자동 전송과 '즉시 요청' 버튼이 동시에 | 화면은 `sendingRef`로 1번만 호출, DB `send_fall_alert`도 이미 sent면 그대로 반환 (멱등) |
| 취소를 눌렀는데 이미 전송됨 | `ALERT_ALREADY_SENT` → 전송 화면으로 보내고 '상황 종료'를 안내 |
| 전송했는데 그 사이 취소됨 | `ALERT_NOT_ACTIVE` → 취소 화면 |
| 전송 실패 (네트워크) | 2초·4초 뒤 자동 재시도, 이후 '다시 보내기' + 119 전화 버튼 |
| 알림 받을 팸이 0명 | 전송 화면에 안내 + 119 버튼 |
| 화면 새로고침 | 주소가 `/fall?id=...`로 바뀌어 같은 카운트다운을 이어감 |
| 낙상 감지가 꺼져 있음 | `FALL_DETECTION_DISABLED` → 설정 화면으로 안내 |
| 받는 사람이 앱의 다른 화면에 있음 | `AlertListener`가 Realtime + 8초 폴링으로 상단 긴급 배너 표시 |
| 팸 코드 만료 / 인원 초과 | 참여 버튼 비활성 + 안내, 팸장은 초대 시트에서 코드 재발급(7일) |
| 방장이 팸을 나감 | 가장 먼저 들어온 멤버에게 방장 위임, 혼자면 팸 삭제 |

## 구조

```
src/
  app/                  화면 (위 표 참고)
  components/           공통 UI, 탭바, 긴급 알림 배너, 타임라인
  lib/
    api/types.ts        화면이 쓰는 함수 목록 (인터페이스)
    api/supabase.ts     Supabase 구현
    api/demo.ts         데모 구현 (같은 규칙·같은 에러 코드)
    errors.ts           DB 에러 코드 → 한국어 문구
  proxy.ts              로그인 확인 (Next 16에서 middleware → proxy)
supabase/migrations/    DB 스키마 · RLS · RPC
```

테이블은 직접 INSERT/UPDATE를 막고(`revoke`) 상태가 바뀌는 동작은 모두 RPC 함수로만 합니다.
그래서 상태 전이 규칙이 DB 한곳에 있고, 클라이언트가 규칙을 우회할 수 없어요.

## 키링 연동 메모

- `safety_settings.fall_sensitivity`를 펌웨어 임계값에 맞출 때 예시:
  `low → IMPACT_G 2.5`, `normal → 2.0`, `high → 1.6`
- `wait_seconds`는 펌웨어 `CANCEL_MS`와 같은 값으로 맞추면 키링 LED와 화면 타이머가 일치합니다.
- `daily_steps`에 하루 걸음 수를 `upsert` 하면 홈 걸음 카드와 `/steps`에 **실시간**으로 바뀝니다
  (Realtime 구독 + 30초마다 다시 불러오기). 데모 모드에서는 1.6초마다 걸음이 조금씩 올라가요.

## 긴급 알림 위치 (`emergency_alerts`)

- 낙상 화면(`/fall`)이 열리면 폰 GPS를 한 번 받아 `update_alert_location()`으로 알림에 붙입니다.
  권한이 거부돼도 알림 전송은 그대로 진행돼요.
- 도움 요청을 보낸 뒤(`sent`)에는 15초마다 위치를 갱신하고, 취소·종료되면 DB가 더 받지 않아요.
- 주소는 OpenStreetMap(Nominatim) 역지오코딩으로 한 번만 구하고, 실패하면 좌표만 보여 줘요.
- 위치는 본인과 알림을 받은 사람만 볼 수 있어요 (`get_alert_detail`, `list_alert_history` RPC).
- `지도에서 보기`는 카카오맵 링크로 열립니다.
