// =============================================================
//  Pariy 키링 - 3단계: 서버(Supabase) 연결 버전
//  보드: ESP32-C3 SuperMini
//
//  기능
//   - 걸음 수 세기 (MPU-6050)
//   - 낙상 감지: 떨어짐 -> 충격 -> 2초간 움직임 없음
//   - 10초 골든타임: LED가 빠르게 깜빡이는 동안 BOOT 버튼을 누르면 취소
//   - 10초 안에 취소 안 하면 "응급" 상태 (LED 계속 켜짐)
//   - 응급 상태에서 BOOT 버튼 2초 길게 누르면 "괜찮아요" (상황 종료)
//   - 친구 키링 맞대기: 자석이 홀 센서에 닿으면 "친구 연결" 카운트
//   - 스마트폰 화면: 키링이 만든 와이파이에 접속해서 상태 확인
//       와이파이 이름: Pariy-Keyring   비밀번호: pariy1234
//       인터넷 주소창에 192.168.4.1 입력
//
//  ★ 서버 연결 (secrets.h 가 있을 때만)
//   - 핫스팟 와이파이에 접속해서 Supabase 로 보냄 -> 웹 화면에 실시간으로 뜸
//       걸음 수         10초마다 늘어난 만큼          (device_report)
//       낙상            감지/취소/응급/종료 순간마다   (device_fall)
//       친구 맞대기     자석이 닿는 순간               (device_meet)
//   - 서버가 돌려주는 값으로 키링도 맞춤
//       폰에서 "괜찮아요, 취소" -> 키링 경고도 멈춤
//       폰에서 "지금 바로 도움 요청" -> 키링도 응급 상태
//       웹 위험 감지 설정의 민감도 · 대기 시간 · 낙상 감지 켜기/끄기
//   - 키링은 로그인을 못 하므로 공개 키(anon key) + 기기 비밀키로 보냄.
//     서버 함수가 비밀키를 확인한 뒤에만 그 키링 주인의 데이터를 바꿈.
//
//  구조: 센서/버튼/LED는 loop()에서, 인터넷 전송은 별도 작업(netTask)에서.
//        인터넷이 느리거나 끊겨도 낙상 감지는 멈추지 않음.
//
//  부품: 보드 + MPU-6050 + KY-024만 있으면 동작합니다.
//        LED와 버튼은 보드에 붙어 있는 것을 씁니다.
// =============================================================

#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>

// secrets.h 가 있으면 서버 연결, 없으면 오프라인 모드 (secrets.example.h 참고)
#if __has_include("secrets.h")
#include "secrets.h"
#define PAIRY_ONLINE 1
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#else
#define PAIRY_ONLINE 0
#endif

#define FIRMWARE_VERSION "pairy-keyring-3"

// ----- 핀 번호 (배선과 반드시 같아야 함) -----
const int PIN_SDA  = 6;  // MPU-6050 SDA
const int PIN_SCL  = 7;  // MPU-6050 SCL
const int PIN_HALL = 4;  // KY-024 DO
const int PIN_LED  = 8;  // 보드 파란 LED (LOW = 켜짐)
const int PIN_BTN  = 9;  // 보드 BOOT 버튼 (누르면 LOW)

// ----- 와이파이 (키링이 직접 와이파이를 만듦) -----
const char *AP_SSID = "Pariy-Keyring";
const char *AP_PASS = "pariy1234";  // 8글자 이상이어야 함

// ----- 낙상 감지 기준 (시연하면서 조절 가능) -----
const float FREEFALL_G        = 0.5;   // 이보다 작으면 "떨어지는 중"
const int   FREEFALL_SAMPLES  = 3;     // 연속 몇 번(10ms 간격) 작아야 인정
const unsigned long IMPACT_WINDOW_MS = 1000;  // 떨어진 뒤 충격까지 기다리는 시간
const unsigned long SETTLE_MS = 500;   // 충격 직후 튕기는 시간은 무시
const unsigned long STILL_MS  = 2000;  // 이 시간 동안 가만히 있으면 쓰러진 것으로 판단
const float MOVE_G            = 0.35;  // 1g에서 이만큼 벗어나면 "움직였다"

// 아래 셋은 서버의 위험 감지 설정(safety_settings)을 받으면 바뀜
volatile float impactG = 2.0;              // 이보다 크면 "쾅 부딪힘" (민감도: 낮음 2.5 / 보통 2.0 / 높음 1.6)
volatile unsigned long cancelMs = 10000;   // 골든타임 (대기 시간 5~60초)
volatile bool fallEnabled = true;          // 낙상 감지 켜기/끄기

// ----- 걸음 수 기준 -----
const float STEP_HIGH_G = 1.25;
const float STEP_LOW_G  = 1.05;
const unsigned long STEP_GAP_MS = 300;

const uint8_t MPU_ADDR = 0x68;

// ----- 상태 -----
// ⚠️ 이름 앞에 ST_ 를 붙임: FALLING 은 Arduino.h 에 이미 있는 이름(인터럽트 모드)이라 그대로 쓰면 컴파일 에러
enum State { ST_NORMAL, ST_FALLING, ST_CHECK_STILL, ST_ALERT, ST_EMERGENCY };
volatile State state = ST_NORMAL;

bool mpuOk = false;
float lastMag = 1.0;
unsigned long steps = 0;              // 화면에 보이는 걸음 (초기화 버튼으로 0)
volatile uint32_t totalSteps = 0;     // 서버로 보낼 걸음 (초기화하지 않음)
unsigned long lastStepTime = 0;
bool stepHigh = false;

int lowCount = 0;
unsigned long fallTime = 0;
unsigned long impactTime = 0;
unsigned long alertTime = 0;
volatile uint32_t alertGen = 0;       // 낙상 경고가 시작될 때마다 +1 (예전 알림의 응답과 헷갈리지 않게)

int hallIdle = HIGH;          // 자석이 없을 때 값 (켜질 때 자동 측정)
int hallLastRaw = HIGH;
unsigned long hallChangeTime = 0;
bool magnetOn = false;
unsigned long friendCount = 0;
unsigned long friendShowUntil = 0;

unsigned long lastSample = 0;
unsigned long lastPrint = 0;

WebServer server(80);

// ===== 서버 연결: 키링 -> 서버로 보낼 일 (loop 가 넣고 netTask 가 꺼내 보냄) =====
enum NetEvent : uint8_t { EV_DETECTED, EV_CANCEL, EV_EMERGENCY, EV_RESOLVE, EV_MEET };
struct NetMsg {
  NetEvent ev;
  bool test;      // 시연용 테스트 낙상이면 true
  uint32_t gen;   // 어느 낙상 경고에 대한 일인지
};

// ===== 서버 -> 키링 (netTask 가 쓰고 loop 가 처리) =====
enum RemoteCmd : uint8_t { RC_NONE, RC_CANCEL, RC_EMERGENCY, RC_RESOLVE };
volatile uint8_t remoteCmd = RC_NONE;
volatile uint32_t remoteGen = 0;

// 화면 표시용 서버 상태
enum NetState : uint8_t { NET_OFFLINE, NET_WIFI_WAIT, NET_OK, NET_ERROR, NET_AUTH_FAIL };
volatile NetState netState = NET_OFFLINE;
volatile unsigned long netLastOkMs = 0;
volatile long serverStepsToday = -1;
char lastFriendName[40] = "";

#if PAIRY_ONLINE
QueueHandle_t netQueue = nullptr;
#endif

void netSend(NetEvent ev, bool test = false) {
#if PAIRY_ONLINE
  if (!netQueue) return;
  NetMsg m = {ev, test, alertGen};
  if (xQueueSend(netQueue, &m, 0) != pdTRUE) Serial.println("(서버 전송 대기열이 가득 참)");
#endif
}

// ===== 기본 함수 =====
void ledOn(bool on) { digitalWrite(PIN_LED, on ? LOW : HIGH); }

const char *stateName() {
  switch (state) {
    case ST_NORMAL:      return "정상";
    case ST_FALLING:     return "떨어짐 감지";
    case ST_CHECK_STILL: return "충격 감지, 움직임 확인 중";
    case ST_ALERT:       return "낙상 경고 (버튼으로 취소)";
    case ST_EMERGENCY:   return "응급 상황 (팸에게 알림)";
  }
  return "";
}

bool mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

bool mpuInit() {
  if (!mpuWrite(0x6B, 0x00)) return false;  // 잠자기 해제
  delay(50);
  mpuWrite(0x1C, 0x10);  // 가속도 ±8g
  mpuWrite(0x1A, 0x03);  // 잡음 줄이는 필터
  return true;
}

bool readMag(float &mag) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)MPU_ADDR, 6) != 6) return false;
  uint8_t b[6];
  for (int i = 0; i < 6; i++) b[i] = Wire.read();
  float ax = (int16_t)((b[0] << 8) | b[1]) / 4096.0f;
  float ay = (int16_t)((b[2] << 8) | b[3]) / 4096.0f;
  float az = (int16_t)((b[4] << 8) | b[5]) / 4096.0f;
  mag = sqrt(ax * ax + ay * ay + az * az);
  return true;
}

// ===== 상태 바꾸기 =====
// notify = true 면 서버에도 알림. 서버가 먼저 바꾼 것(폰에서 취소 등)을 따라갈 때는 false
void startAlert(const char *why, bool test = false) {
  state = ST_ALERT;
  alertTime = millis();
  alertGen++;
  Serial.print(">>> 낙상 경고 시작: ");
  Serial.println(why);
  Serial.print(">>> ");
  Serial.print(cancelMs / 1000);
  Serial.println("초 안에 BOOT 버튼을 누르면 취소됩니다");
  netSend(EV_DETECTED, test);
}

void backToNormal(const char *how, bool notify) {
  NetEvent ev = (state == ST_EMERGENCY) ? EV_RESOLVE : EV_CANCEL;
  bool wasAlert = (state == ST_ALERT || state == ST_EMERGENCY);
  state = ST_NORMAL;
  lowCount = 0;
  Serial.print(">>> 경고 해제: ");
  Serial.println(how);
  if (notify && wasAlert) netSend(ev);
}

void goEmergency(bool notify) {
  state = ST_EMERGENCY;
  Serial.println("!!! 응급 상황: 취소되지 않아 팸에게 도움을 요청합니다 !!!");
  if (notify) netSend(EV_EMERGENCY);
}

// 서버가 알려 준 변화(폰에서 취소/요청/종료)를 키링 상태에 반영
void applyRemote() {
  uint8_t cmd = remoteCmd;
  if (cmd == RC_NONE) return;
  remoteCmd = RC_NONE;
  if (remoteGen != alertGen) return;  // 예전 낙상에 대한 응답이면 무시
  if (cmd == RC_CANCEL && state == ST_ALERT) backToNormal("폰에서 취소", false);
  else if (cmd == RC_EMERGENCY && state == ST_ALERT) goEmergency(false);
  else if (cmd == RC_RESOLVE && state == ST_EMERGENCY) backToNormal("폰에서 상황 종료", false);
}

// ===== 걸음 수 =====
void updateSteps(float mag, unsigned long now) {
  if (state != ST_NORMAL) return;
  if (!stepHigh && mag > STEP_HIGH_G && now - lastStepTime > STEP_GAP_MS) {
    steps++;
    totalSteps++;
    lastStepTime = now;
    stepHigh = true;
  }
  if (mag < STEP_LOW_G) stepHigh = false;
}

// ===== 낙상 감지 =====
void updateFall(float mag, unsigned long now) {
  switch (state) {
    case ST_NORMAL:
      if (!fallEnabled) { lowCount = 0; break; }  // 설정에서 꺼 두면 감지 안 함
      lowCount = (mag < FREEFALL_G) ? lowCount + 1 : 0;
      if (lowCount >= FREEFALL_SAMPLES) {
        state = ST_FALLING;
        fallTime = now;
        Serial.println("... 떨어지는 중");
      }
      break;

    case ST_FALLING:
      if (mag > impactG) {
        state = ST_CHECK_STILL;
        impactTime = now;
        Serial.println("... 충격 감지, 2초간 움직임 확인");
      } else if (now - fallTime > IMPACT_WINDOW_MS) {
        state = ST_NORMAL;  // 충격이 없었으면 무시
        lowCount = 0;
      }
      break;

    case ST_CHECK_STILL: {
      unsigned long t = now - impactTime;
      if (t < SETTLE_MS) break;  // 튕기는 시간은 무시
      if (fabs(mag - 1.0f) > MOVE_G) {
        Serial.println("... 다시 움직여서 낙상 아님");
        state = ST_NORMAL;
        lowCount = 0;
      } else if (t > SETTLE_MS + STILL_MS) {
        startAlert("떨어진 뒤 움직임 없음");
      }
      break;
    }

    case ST_ALERT:
    case ST_EMERGENCY:
      break;  // 시간 확인은 loop() 에서
  }
}

// ===== 버튼 =====
void updateButton(unsigned long now) {
  static int lastBtn = HIGH;
  static unsigned long pressTime = 0;
  int b = digitalRead(PIN_BTN);
  if (b == LOW && lastBtn == HIGH) pressTime = now;
  if (b == LOW && now - pressTime > 50) {  // 50ms 이상 눌림
    if (state == ST_ALERT) backToNormal("버튼", true);
    else if (state == ST_EMERGENCY && now - pressTime > 2000) backToNormal("버튼 2초 길게 누름", true);
  }
  lastBtn = b;
}

// ===== 친구 키링 (홀 센서) =====
void updateHall(unsigned long now) {
  int raw = digitalRead(PIN_HALL);
  if (raw != hallLastRaw) {
    hallLastRaw = raw;
    hallChangeTime = now;
  }
  if (now - hallChangeTime < 100) return;  // 0.1초 동안 같은 값이어야 인정
  bool magnet = (raw != hallIdle);
  if (magnet && !magnetOn) {
    friendCount++;
    friendShowUntil = now + 2000;
    Serial.print("*** 친구 키링 연결! 누적 ");
    Serial.print(friendCount);
    Serial.println("번");
    netSend(EV_MEET);
  }
  magnetOn = magnet;
}

// ===== LED 표시 =====
void updateLed(unsigned long now) {
  if (state == ST_EMERGENCY) {
    ledOn(true);                          // 계속 켜짐
  } else if (state == ST_ALERT) {
    ledOn((now / 100) % 2 == 0);          // 아주 빠르게 깜빡
  } else if (now < friendShowUntil) {
    ledOn((now / 250) % 2 == 0);          // 친구 연결: 천천히 깜빡
  } else {
    ledOn(now % 3000 < 60);               // 평소: 3초마다 짧게 반짝
  }
}

// =============================================================
//  서버 연결 (netTask)
// =============================================================
#if PAIRY_ONLINE

String bootId;          // 전원을 켤 때마다 새로 만듦 (서버가 중복 보고를 걸러 낼 때 씀)
int reportSeq = 0;
uint32_t stepsSent = 0; // 서버가 받았다고 확인한 걸음
int pendingSeq = 0;     // 아직 확인 못 받은 보고 (실패하면 같은 번호·같은 값으로 다시 보냄)
uint32_t pendingDelta = 0;
bool hasPending = false;

String alertId = "";    // 서버가 만든 낙상 알림 id
uint32_t alertIdGen = 0;

// {"key": "value"} 에서 value 꺼내기 (작은 응답만 다루므로 라이브러리 없이 간단히)
String jsonValue(const String &s, const char *key) {
  String k = String("\"") + key + "\":";
  int i = s.indexOf(k);
  if (i < 0) return "";
  i += k.length();
  while (i < (int)s.length() && s[i] == ' ') i++;
  if (i >= (int)s.length()) return "";
  if (s[i] == '"') {
    int e = s.indexOf('"', i + 1);
    return e < 0 ? "" : s.substring(i + 1, e);
  }
  int e = i;
  while (e < (int)s.length() && s[e] != ',' && s[e] != '}') e++;
  String v = s.substring(i, e);
  v.trim();
  return v;
}

// Supabase RPC 호출: POST {SUPABASE_URL}/rest/v1/rpc/{함수 이름}
int callRpc(const char *fn, const String &body, String &out) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  WiFiClientSecure client;
  client.setInsecure();  // ⚠️ 해커톤용: 인증서 확인 생략. 실제 제품은 루트 인증서를 넣어 확인해야 함
  HTTPClient http;
  http.setConnectTimeout(6000);
  http.setTimeout(6000);
  if (!http.begin(client, String(SUPABASE_URL) + "/rest/v1/rpc/" + fn)) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  // 예전 형식 키(eyJ…)는 Authorization 에도 넣어야 함. 새 형식(sb_publishable_…)은 apikey 만
  if (strncmp(SUPABASE_ANON_KEY, "eyJ", 3) == 0) http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  int code = http.POST(body);
  out = code > 0 ? http.getString() : "";
  http.end();

  if (code == 200) {
    netState = NET_OK;
    netLastOkMs = millis();
  } else if (out.indexOf("DEVICE_AUTH_FAILED") >= 0) {
    netState = NET_AUTH_FAIL;
    Serial.println("(서버) 기기 인증 실패: secrets.h 의 DEVICE_ID / DEVICE_SECRET 을 확인하세요");
  } else {
    netState = NET_ERROR;
    Serial.print("(서버) ");
    Serial.print(fn);
    Serial.print(" 실패 code=");
    Serial.print(code);
    Serial.print(" ");
    Serial.println(out.substring(0, 160));
  }
  return code;
}

String authJson() {
  return String("\"p_device_id\":\"") + DEVICE_ID + "\",\"p_secret\":\"" + DEVICE_SECRET + "\"";
}

// 서버 응답에 들어 있는 설정 + 알림 상태를 키링에 반영
void applyServerState(const String &res) {
  String v = jsonValue(res, "fall_enabled");
  if (v.length()) fallEnabled = (v == "true");
  v = jsonValue(res, "sensitivity");
  if (v == "low") impactG = 2.5;
  else if (v == "high") impactG = 1.6;
  else if (v == "normal") impactG = 2.0;
  v = jsonValue(res, "wait_seconds");
  if (v.length()) {
    long s = v.toInt();
    if (s >= 5 && s <= 60) cancelMs = (unsigned long)s * 1000UL;
  }
  v = jsonValue(res, "steps_today");
  if (v.length()) serverStepsToday = v.toInt();

  // 지금 다루는 낙상 알림의 상태가 서버에서 바뀌었으면(폰에서 누름) 키링도 따라감
  String id = jsonValue(res, "alert_id");
  String st = jsonValue(res, "alert_status");
  if (alertId.length() == 0 || id != alertId) return;
  uint8_t cmd = RC_NONE;
  if (st == "cancelled") cmd = RC_CANCEL;
  else if (st == "sent") cmd = RC_EMERGENCY;
  else if (st == "resolved") cmd = RC_RESOLVE;
  if (cmd != RC_NONE) {
    remoteGen = alertIdGen;
    remoteCmd = cmd;
  }
}

// 주기 보고: 늘어난 걸음 + 살아 있다는 신호. 응답으로 설정·알림 상태를 받음
void sendReport() {
  if (!hasPending) {
    uint32_t delta = totalSteps - stepsSent;
    pendingDelta = delta > 2000 ? 2000 : delta;  // 서버는 한 번에 2000 걸음까지만 받음. 나머지는 다음에
    pendingSeq = ++reportSeq;
    hasPending = true;
  }
  String body = "{" + authJson() + ",\"p_boot_id\":\"" + bootId + "\",\"p_seq\":" + pendingSeq +
                ",\"p_steps_delta\":" + pendingDelta + ",\"p_firmware\":\"" FIRMWARE_VERSION "\"}";
  String res;
  if (callRpc("device_report", body, res) == 200) {
    stepsSent += pendingDelta;  // 중복(duplicate)이어도 서버가 이미 더한 것이므로 성공으로 봄
    hasPending = false;
    applyServerState(res);
  }
}

// 낙상 상태 전이 보내기. 성공하면 true
bool sendFall(const NetMsg &m) {
  const char *ev = m.ev == EV_DETECTED ? "detected" : m.ev == EV_CANCEL ? "cancel" : m.ev == EV_EMERGENCY ? "emergency" : "resolve";
  String body = "{" + authJson() + ",\"p_event\":\"" + ev + "\"";
  // 같은 낙상의 알림 id 를 알면 함께 보냄 (모르면 서버가 최근 알림을 찾음)
  if (m.ev != EV_DETECTED && alertId.length() && alertIdGen == m.gen) body += ",\"p_alert_id\":\"" + alertId + "\"";
  if (m.test) body += ",\"p_source\":\"test\"";
  body += "}";
  String res;
  if (callRpc("device_fall", body, res) != 200) return false;

  String id = jsonValue(res, "alert_id");
  if (id.length() && id != "null" && m.ev != EV_CANCEL && m.ev != EV_RESOLVE) {
    alertId = id;
    alertIdGen = m.gen;
  }
  Serial.print("(서버) 낙상 ");
  Serial.print(ev);
  Serial.print(" -> ");
  Serial.println(jsonValue(res, "alert_status"));
  if (jsonValue(res, "error") == "FALL_DETECTION_DISABLED") Serial.println("(서버) 웹 설정에서 낙상 감지가 꺼져 있어요");
  applyServerState(res);
  return true;
}

bool sendMeet() {
  String res;
  if (callRpc("device_meet", "{" + authJson() + "}", res) != 200) return false;
  if (jsonValue(res, "matched") == "true") {
    String name = jsonValue(res, "friend_nickname");
    strlcpy(lastFriendName, name.c_str(), sizeof(lastFriendName));
    Serial.print("(서버) 친구 키링과 연결됨: ");
    Serial.println(name);
  }
  return true;
}

void netTask(void *) {
  unsigned long lastReport = 0;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      if (netState != NET_AUTH_FAIL) netState = NET_WIFI_WAIT;
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    // 1) 보낼 일이 있으면 먼저 처리 (낙상이 걸음보다 급함)
    NetMsg m;
    if (xQueueReceive(netQueue, &m, pdMS_TO_TICKS(200)) == pdTRUE) {
      // 응급은 성공할 때까지 계속 재시도 (5분). 다른 일은 몇 번만
      int maxTry = m.ev == EV_EMERGENCY ? 100 : m.ev == EV_MEET ? 2 : 5;
      for (int i = 0; i < maxTry; i++) {
        bool ok = (m.ev == EV_MEET) ? sendMeet() : sendFall(m);
        if (ok || netState == NET_AUTH_FAIL) break;
        // 응급 재시도 중에 "괜찮아요"가 들어오면 응급 재시도는 그만
        if (m.ev == EV_EMERGENCY && state != ST_EMERGENCY) break;
        vTaskDelay(pdMS_TO_TICKS(m.ev == EV_EMERGENCY ? 3000 : 1000));
      }
      continue;
    }

    // 2) 주기 보고: 평소 10초, 낙상 경고/응급 중에는 2초 (폰에서 누른 걸 빨리 알려고)
    //    인증 실패면 30초마다만 (비밀키를 고칠 때까지 서버를 두드리지 않게)
    unsigned long every = netState == NET_AUTH_FAIL ? 30000 : (state == ST_ALERT || state == ST_EMERGENCY) ? 2000 : 10000;
    if (millis() - lastReport >= every) {
      lastReport = millis();
      sendReport();
    }
  }
}

void setupNet() {
  char buf[9];
  snprintf(buf, sizeof(buf), "%08lx", (unsigned long)esp_random());
  bootId = buf;
  netQueue = xQueueCreate(16, sizeof(NetMsg));
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  netState = NET_WIFI_WAIT;
  // TLS(https)는 메모리를 많이 써서 스택을 넉넉히
  xTaskCreate(netTask, "pairy-net", 16384, nullptr, 1, nullptr);
  Serial.print("서버 연결: 와이파이 ");
  Serial.print(WIFI_SSID);
  Serial.println(" 에 접속 중...");
}
#endif  // PAIRY_ONLINE

const char *netText() {
  switch (netState) {
    case NET_OFFLINE:   return "오프라인 모드 (secrets.h 없음)";
    case NET_WIFI_WAIT: return "와이파이 연결 중…";
    case NET_OK:        return "서버 연결됨";
    case NET_ERROR:     return "서버 전송 실패 (재시도 중)";
    case NET_AUTH_FAIL: return "기기 인증 실패 - 비밀키 확인";
  }
  return "";
}

// ===== 스마트폰 화면 =====
const char PAGE[] = R"rawliteral(
<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pariy 키링</title>
<style>
body{font-family:sans-serif;margin:0;padding:20px;background:#fafaf7;color:#222}
h1{font-size:22px;margin:0 0 16px}
.card{background:#fff;border:1px solid #ddd;border-radius:12px;padding:16px;margin-bottom:12px}
.big{font-size:40px;font-weight:bold}
.alert{background:#fde8e8;border-color:#e24b4a}
.sub{color:#777;font-size:14px}
button{font-size:16px;padding:12px;margin:4px 0;width:100%;border-radius:8px;border:1px solid #bbb;background:#fff}
</style></head><body>
<h1>Pariy 키링</h1>
<div class="card" id="stateCard"><div>상태</div><div class="big" id="state" style="font-size:22px">-</div><div id="count"></div></div>
<div class="card"><div>오늘 걸음 수</div><div class="big" id="steps">0</div><div class="sub" id="server"></div></div>
<div class="card"><div>친구 키링 연결</div><div class="big" id="friends">0</div><div id="magnet"></div></div>
<div class="card"><div id="mpu"></div><div class="sub" id="net"></div></div>
<button onclick="fetch('/cancel')">경보 해제</button>
<button onclick="fetch('/testfall')">낙상 테스트 (시연용)</button>
<button onclick="fetch('/reset')">걸음 수 초기화 (화면만)</button>
<script>
async function tick(){
 try{
  const r=await fetch('/status');const d=await r.json();
  document.getElementById('state').textContent=d.state;
  document.getElementById('steps').textContent=d.steps;
  document.getElementById('server').textContent=d.server_steps>=0?('서버에 기록된 오늘 걸음 '+d.server_steps):'';
  document.getElementById('friends').textContent=d.friends;
  document.getElementById('magnet').textContent=(d.magnet?'지금 자석 닿아 있음 ':'')+(d.friend_name?('최근 연결: '+d.friend_name):'');
  document.getElementById('mpu').textContent=d.mpu?'센서 정상':'센서 연결 안 됨 - 배선 확인';
  document.getElementById('net').textContent=d.net+(d.net_ago>=0?(' · '+d.net_ago+'초 전'):'');
  document.getElementById('count').textContent=d.countdown>0?('취소까지 '+d.countdown+'초'):'';
  document.getElementById('stateCard').className='card'+(d.alert?' alert':'');
 }catch(e){}
}
setInterval(tick,700);tick();
</script></body></html>
)rawliteral";

void handleStatus() {
  int countdown = 0;
  if (state == ST_ALERT) {
    long left = (long)cancelMs - (long)(millis() - alertTime);
    countdown = left > 0 ? (left + 999) / 1000 : 0;
  }
  long netAgo = netLastOkMs ? (long)((millis() - netLastOkMs) / 1000) : -1;
  String json = "{";
  json += "\"state\":\"" + String(stateName()) + "\",";
  json += "\"steps\":" + String(steps) + ",";
  json += "\"server_steps\":" + String(serverStepsToday) + ",";
  json += "\"friends\":" + String(friendCount) + ",";
  json += "\"friend_name\":\"" + String(lastFriendName) + "\",";
  json += "\"magnet\":" + String(magnetOn ? "true" : "false") + ",";
  json += "\"mpu\":" + String(mpuOk ? "true" : "false") + ",";
  json += "\"net\":\"" + String(netText()) + "\",";
  json += "\"net_ago\":" + String(netAgo) + ",";
  json += "\"alert\":" + String((state == ST_ALERT || state == ST_EMERGENCY) ? "true" : "false") + ",";
  json += "\"countdown\":" + String(countdown);
  json += "}";
  server.send(200, "application/json; charset=utf-8", json);
}

void setupWeb() {
  server.on("/", []() { server.send(200, "text/html; charset=utf-8", PAGE); });
  server.on("/status", handleStatus);
  server.on("/cancel", []() {
    if (state == ST_ALERT || state == ST_EMERGENCY) backToNormal("스마트폰", true);
    server.send(200, "text/plain", "ok");
  });
  server.on("/testfall", []() {
    if (state == ST_NORMAL) startAlert("시연용 테스트 버튼", true);
    server.send(200, "text/plain", "ok");
  });
  server.on("/reset", []() {
    steps = 0;  // 화면 숫자만 초기화. 서버로 보낸 걸음은 그대로
    server.send(200, "text/plain", "ok");
  });
  server.begin();
}

// ===== 시작 =====
void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_HALL, INPUT);
  pinMode(PIN_BTN, INPUT_PULLUP);
  ledOn(false);

  Wire.begin(PIN_SDA, PIN_SCL);
  mpuOk = mpuInit();

  // 켜질 때 홀 센서 값을 "자석 없음" 기준으로 기억 (켤 때 자석을 대지 마세요)
  hallIdle = digitalRead(PIN_HALL);
  hallLastRaw = hallIdle;

  // 키링 와이파이(AP)는 항상 켜 두고, 서버 연결 모드면 핫스팟(STA)에도 동시에 접속
  WiFi.mode(PAIRY_ONLINE ? WIFI_AP_STA : WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  setupWeb();
#if PAIRY_ONLINE
  setupNet();
#endif

  Serial.println();
  Serial.println("===== Pariy 키링 시작 =====");
  Serial.println(mpuOk ? "MPU-6050 정상" : "MPU-6050 연결 안 됨! 배선 확인");
  Serial.print("와이파이: ");
  Serial.print(AP_SSID);
  Serial.print(" / 비밀번호: ");
  Serial.println(AP_PASS);
  Serial.print("스마트폰 주소: http://");
  Serial.println(WiFi.softAPIP());
  Serial.println(PAIRY_ONLINE ? "서버 연결 모드" : "오프라인 모드 (secrets.h 없음)");
}

// ===== 반복 =====
void loop() {
  unsigned long now = millis();

  if (now - lastSample >= 10) {  // 1초에 100번 센서 읽기
    lastSample = now;
    float mag;
    if (mpuOk && readMag(mag)) {
      lastMag = mag;
      updateSteps(mag, now);
      updateFall(mag, now);
    }
  }

  // 골든타임이 지나면 응급 상태로 (센서 값과 상관없이 시간은 흐름)
  if (state == ST_ALERT && now - alertTime > cancelMs) goEmergency(true);

  applyRemote();
  updateButton(now);
  updateHall(now);
  updateLed(now);
  server.handleClient();

  if (now - lastPrint >= 1000) {  // 1초마다 상태 출력
    lastPrint = now;
    Serial.print("상태=");     Serial.print(stateName());
    Serial.print(" | 걸음=");  Serial.print(steps);
    Serial.print(" | 친구=");  Serial.print(friendCount);
    Serial.print(" | 가속도="); Serial.print(lastMag, 2);
    Serial.print(" | 서버=");  Serial.println(netText());
  }
}
