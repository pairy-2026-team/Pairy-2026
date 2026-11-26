# 키링 → 서버 연결 (A 파트)

키링(ESP32-C3)이 핫스팟에 접속해서 걸음 수 · 낙상 · 친구 맞대기를 Supabase로 보내고,
웹은 B 파트가 만든 실시간 구독으로 그 값을 바로 보여 줍니다.

```
키링 ──(핫스팟 와이파이, https)──▶ Supabase 함수 device_* ──▶ daily_steps / emergency_alerts / friendships
                                                              │
웹 (홈 · 낙상 화면 · 팸) ◀──────── 실시간 구독(B 파트) ────────┘
```

## 처음 한 번 설정

1. **SQL 실행**: Supabase 대시보드 → SQL Editor에 아래 순서로 붙여 넣고 실행
   1. `supabase/migrations/20261124000000_part_b_home_friends_fam_safety.sql` (B 파트, 이미 했으면 생략)
   2. `supabase/migrations/20261125000000_part_a_devices_keyring.sql` (A 파트: 기기 · 키링)
   3. `supabase/migrations/20261126000000_part_a_card_receipt.sql` (A 파트: 명함 칸 · 영수증)
2. **웹에서 키링 등록**: `/device` → **새 키링 등록** → 나온 두 줄(`DEVICE_ID`, `DEVICE_SECRET`) 복사
   비밀키는 이때 한 번만 보여요. 잃어버리면 같은 화면의 **비밀키 다시 받기**
3. **펌웨어 설정**: `firmware/pariy_keyring/secrets.example.h`를 같은 폴더에 `secrets.h`로 복사하고 채우기
   - `WIFI_SSID` / `WIFI_PASS`: 휴대폰 핫스팟 (**2.4GHz**만 됨. 아이폰은 "호환성 최대화" 켜기)
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY`: 웹 `.env.local`과 같은 값 (단톡방)
   - `DEVICE_ID` / `DEVICE_SECRET`: 2번에서 복사한 값
   - `secrets.h`는 `.gitignore`에 있어서 깃허브에 안 올라가요. **절대 커밋하지 마세요**
4. **업로드**: Arduino IDE에서 `firmware/pariy_keyring` 열고 업로드 → 시리얼 모니터(115200)에 `서버=서버 연결됨`
5. 웹 `/device`가 **연결됨**으로 바뀌면 끝

`secrets.h`가 없으면 키링은 예전처럼 **오프라인 모드**(키링 와이파이 `192.168.4.1` 화면만)로 동작해요.
→ 시연 직전에 서버가 안 되면 `secrets.h`만 빼고 다시 올리면 됩니다.

## 왜 이렇게 만들었나: 기기 인증

키링은 사람처럼 로그인을 못 해서 **공개 키(anon key)** 로만 요청을 보냅니다.
anon key는 웹 코드에도 들어가는 "공개" 값이라, 이걸로 테이블을 직접 쓰게 열어 두면 누구나 남의 걸음 수 · 낙상 알림을 조작할 수 있어요.

그래서:

| 무엇 | 어떻게 |
|---|---|
| 키링마다 비밀키 | `register_device()`가 128비트 랜덤 비밀키 발급, 원문은 한 번만 보여 줌 |
| DB에는 해시만 | `devices.secret_hash = sha256(비밀키)`. DB가 털려도 비밀키는 모름 |
| 테이블 직접 쓰기 금지 | anon은 `devices` · `daily_steps` · `emergency_alerts`에 직접 못 씀 |
| 함수로만 | 키링은 `device_report` / `device_fall` / `device_meet`만 호출 가능. 함수가 비밀키 확인 후 **그 키링 주인의 데이터만** 바꿈 |
| 비밀키 노출 시 | `/device` → 비밀키 다시 받기 → 예전 키는 즉시 무효 |
| 해시 칼럼 숨김 | 로그인한 본인도 `secret_hash`는 못 읽음 (칼럼 단위 권한) |

## 키링이 부르는 함수

| 함수 | 언제 | 하는 일 |
|---|---|---|
| `device_report` | 10초마다 (낙상 경고/응급 중엔 2초) | 늘어난 걸음 수를 오늘 걸음에 더함 + 설정 · 최근 알림 상태를 돌려줌 |
| `device_fall` | 낙상 상태가 바뀌는 순간 | `detected` / `cancel` / `emergency` / `resolve` → `emergency_alerts` 상태 전이 |
| `device_meet` | 홀 센서에 자석이 닿는 순간 | 8초 안에 다른 사람 키링도 맞대기를 보고하면 서로 친구(이미 친구면 `meet_count + 1`) |

### 걸음 수: "늘어난 만큼"만 보냄
- 키링은 날짜를 몰라서 "오늘 총 걸음" 대신 **지난 보고 이후 늘어난 걸음(delta)** 을 보냄 → 서버가 KST 오늘 날짜에 더함
- 응답을 못 받아 같은 보고를 다시 보내도 두 번 더해지지 않게 `boot_id`(전원 켤 때마다 바뀜) + `seq`(보고 순번)로 중복 확인
- 한 번에 2,000걸음 넘게 오면 이상한 값으로 보고 버림 (키링은 2,000씩 나눠 보냄)

### 낙상: 웹 흐름(10_fall_detect)과 같은 상태

```
키링                         서버 emergency_alerts.status
NORMAL ─낙상 확정─▶ ALERT     detected  → countdown (대기 시간 = 웹 설정 wait_seconds)
ALERT ─버튼─▶ NORMAL          cancel    → cancelled
ALERT ─시간 초과─▶ EMERGENCY  emergency → sent (팸에게 알림)
EMERGENCY ─버튼 2초─▶ NORMAL  resolve   → resolved ("괜찮아요")
```

폰과 키링 양쪽에서 누를 수 있어서, 서로 맞춰 줍니다.

| 상황 | 결과 |
|---|---|
| 폰에서 "괜찮아요, 취소" | 키링이 2초 안에 report 응답으로 `cancelled`를 받고 경고 멈춤 |
| 폰에서 "지금 바로 도움 요청" | 키링도 응급 상태(LED 계속 켜짐) |
| 웹 타이머와 키링 타이머가 둘 다 0초 | `sent`는 한 번만 (DB가 멱등) |
| 폰에서 이미 취소했는데 키링이 늦게 `emergency` | 서버는 `cancelled` 그대로 돌려주고 키링이 정상으로 |
| `detected`가 인터넷 문제로 못 감 → 나중에 `emergency`만 도착 | 서버가 알림을 만들고 바로 `sent` |
| 키링이 응급 직전에 꺼짐 | B 파트 `flush_expired_countdowns()`(pg_cron)가 대기시간+30초 뒤 자동 전송 |
| 응급 전송 실패 | 3초마다 최대 5분 재시도 (버튼으로 "괜찮아요" 누르면 멈춤) |
| 웹에서 낙상 감지를 끔 | 키링도 다음 보고 때 받아서 감지 안 함 |

웹 위험 감지 설정의 **민감도**는 키링 충격 기준으로 바뀝니다: 낮음 2.5g · 보통 2.0g · 높음 1.6g

### 친구 맞대기: 시간으로 짝짓기
홀 센서는 "자석이 닿았다"만 알고 누구 키링인지는 모릅니다.
그래서 두 키링이 **8초 안에** 각각 맞대기를 보고하면 서로 맞댄 것으로 봅니다.
- ⚠️ 같은 순간 다른 곳에서 맞댄 사람과 잘못 이어질 수 있어요 (해커톤 규모에서는 괜찮음)
- 키링이 하나뿐이면 짝은 안 생기고 `devices.meet_count`만 올라가요 (영수증 화면에서 활용 가능)

## 펌웨어 구조

- 센서 · 버튼 · LED는 `loop()`, 인터넷은 별도 작업 `netTask` (FreeRTOS)
  → https 요청이 1~2초 걸리거나 와이파이가 끊겨도 **낙상 감지가 멈추지 않음**
- `loop()` → `netTask`: 큐(`netQueue`)에 이벤트를 넣음
- `netTask` → `loop()`: `remoteCmd`(폰에서 취소/요청/종료)와 설정값만 씀. 상태 변경은 항상 `loop()`에서
- `alertGen`: 낙상 경고마다 번호를 붙여서, 예전 낙상에 대한 서버 응답이 새 경고를 끄지 않게 함
- 키링 와이파이(AP)와 핫스팟 접속(STA)을 동시에 씀. 핫스팟에 붙는 순간 AP 채널이 바뀌어 `192.168.4.1` 화면이 잠깐 끊길 수 있어요

## 알려진 한계 (해커톤용으로 단순화한 것)

- `client.setInsecure()`: https 인증서 확인을 생략함. 실제 제품은 루트 인증서를 넣어야 함
- 배터리 센서가 없어서 배터리는 `—`로 보임 (`device_report`의 `p_battery`로 보낼 수 있게 자리는 있음)
- 기존 펌웨어는 상태 이름 `FALLING`이 Arduino의 인터럽트 상수와 겹쳐서 컴파일이 안 됐음 → `ST_` 접두사로 고침

## 테스트한 것

- SQL: 로컬 Postgres 16에 B → A 순서로 두 번씩 적용 (재실행 안전), 키링(anon) · 웹 사용자(authenticated) 역할로 아래 시나리오 확인
  - 틀린 비밀키 거부, 내부 함수 · 테이블 직접 접근 거부, 비밀키 재발급 후 예전 키 거부, 남의 키링 삭제 거부
  - 걸음 delta 누적 · 중복 보고 무시 · 재부팅 후 이어서 · 이상한 값 무시
  - 낙상 4가지 흐름 (폰 취소, 시간 초과 전송, detected 없이 emergency, 폰에서 즉시 요청) + 낙상 감지 꺼짐
  - 맞대기 짝짓기 (새 친구 생성, 이미 친구면 횟수 +1, 같은 사람 키링끼리는 짝 안 됨)
- 펌웨어: ESP32 코어 2.0.9 · 3.3.13에서 `secrets.h` 있음/없음 모두 컴파일 (경고 없음)
- **아직 못 한 것: 실제 보드 + 실제 Supabase 프로젝트로 끝까지 보내 보기.** 보드에 올려서 시리얼 모니터 로그로 꼭 확인해 주세요
