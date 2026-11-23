// =============================================================
//  Pariy 키링 - 2단계: 완성 코드 (오늘 시연 버전)
//  보드: ESP32-C3 SuperMini
//
//  기능
//   - 걸음 수 세기 (MPU-6050)
//   - 낙상 감지: 떨어짐 -> 충격 -> 2초간 움직임 없음
//   - 10초 골든타임: LED가 빠르게 깜빡이는 동안 BOOT 버튼을 누르면 취소
//   - 10초 안에 취소 안 하면 "응급" 상태 (LED 계속 켜짐)
//   - 친구 키링 맞대기: 자석이 홀 센서에 닿으면 "친구 연결" 카운트
//   - 스마트폰 화면: 키링이 만든 와이파이에 접속해서 상태 확인
//       와이파이 이름: Pariy-Keyring   비밀번호: pariy1234
//       인터넷 주소창에 192.168.4.1 입력
//
//  부품: 보드 + MPU-6050 + KY-024만 있으면 동작합니다.
//        LED와 버튼은 보드에 붙어 있는 것을 씁니다.
// =============================================================

#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>

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
const float IMPACT_G          = 2.0;   // 이보다 크면 "쾅 부딪힘"
const unsigned long IMPACT_WINDOW_MS = 1000;  // 떨어진 뒤 충격까지 기다리는 시간
const unsigned long SETTLE_MS = 500;   // 충격 직후 튕기는 시간은 무시
const unsigned long STILL_MS  = 2000;  // 이 시간 동안 가만히 있으면 쓰러진 것으로 판단
const float MOVE_G            = 0.35;  // 1g에서 이만큼 벗어나면 "움직였다"
const unsigned long CANCEL_MS = 10000; // 10초 골든타임

// ----- 걸음 수 기준 -----
const float STEP_HIGH_G = 1.25;
const float STEP_LOW_G  = 1.05;
const unsigned long STEP_GAP_MS = 300;

const uint8_t MPU_ADDR = 0x68;

// ----- 상태 -----
enum State { NORMAL, FALLING, CHECK_STILL, ALERT, EMERGENCY };
State state = NORMAL;

bool mpuOk = false;
float lastMag = 1.0;
unsigned long steps = 0;
unsigned long lastStepTime = 0;
bool stepHigh = false;

int lowCount = 0;
unsigned long fallTime = 0;
unsigned long impactTime = 0;
unsigned long alertTime = 0;

int hallIdle = HIGH;          // 자석이 없을 때 값 (켜질 때 자동 측정)
int hallLastRaw = HIGH;
unsigned long hallChangeTime = 0;
bool magnetOn = false;
unsigned long friendCount = 0;
unsigned long friendShowUntil = 0;

unsigned long lastSample = 0;
unsigned long lastPrint = 0;

WebServer server(80);

// ===== 기본 함수 =====
void ledOn(bool on) { digitalWrite(PIN_LED, on ? LOW : HIGH); }

const char *stateName() {
  switch (state) {
    case NORMAL:      return "정상";
    case FALLING:     return "떨어짐 감지";
    case CHECK_STILL: return "충격 감지, 움직임 확인 중";
    case ALERT:       return "낙상 경고 (10초 안에 버튼으로 취소)";
    case EMERGENCY:   return "응급 상황";
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
void startAlert(const char *why) {
  state = ALERT;
  alertTime = millis();
  Serial.print(">>> 낙상 경고 시작: ");
  Serial.println(why);
  Serial.println(">>> 10초 안에 BOOT 버튼을 누르면 취소됩니다");
}

void cancelAlert(const char *how) {
  state = NORMAL;
  lowCount = 0;
  Serial.print(">>> 경고 취소: ");
  Serial.println(how);
}

void goEmergency() {
  state = EMERGENCY;
  Serial.println("!!! 응급 상황: 10초 동안 취소되지 않았습니다 !!!");
  // 나중에 여기서 Supabase나 보호자 알림을 보내면 됩니다.
}

// ===== 걸음 수 =====
void updateSteps(float mag, unsigned long now) {
  if (state != NORMAL) return;
  if (!stepHigh && mag > STEP_HIGH_G && now - lastStepTime > STEP_GAP_MS) {
    steps++;
    lastStepTime = now;
    stepHigh = true;
  }
  if (mag < STEP_LOW_G) stepHigh = false;
}

// ===== 낙상 감지 =====
void updateFall(float mag, unsigned long now) {
  switch (state) {
    case NORMAL:
      lowCount = (mag < FREEFALL_G) ? lowCount + 1 : 0;
      if (lowCount >= FREEFALL_SAMPLES) {
        state = FALLING;
        fallTime = now;
        Serial.println("... 떨어지는 중");
      }
      break;

    case FALLING:
      if (mag > IMPACT_G) {
        state = CHECK_STILL;
        impactTime = now;
        Serial.println("... 충격 감지, 2초간 움직임 확인");
      } else if (now - fallTime > IMPACT_WINDOW_MS) {
        state = NORMAL;  // 충격이 없었으면 무시
        lowCount = 0;
      }
      break;

    case CHECK_STILL: {
      unsigned long t = now - impactTime;
      if (t < SETTLE_MS) break;  // 튕기는 시간은 무시
      if (fabs(mag - 1.0f) > MOVE_G) {
        Serial.println("... 다시 움직여서 낙상 아님");
        state = NORMAL;
        lowCount = 0;
      } else if (t > SETTLE_MS + STILL_MS) {
        startAlert("떨어진 뒤 움직임 없음");
      }
      break;
    }

    case ALERT:
      if (now - alertTime > CANCEL_MS) goEmergency();
      break;

    case EMERGENCY:
      break;
  }
}

// ===== 버튼 =====
void updateButton(unsigned long now) {
  static int lastBtn = HIGH;
  static unsigned long pressTime = 0;
  int b = digitalRead(PIN_BTN);
  if (b == LOW && lastBtn == HIGH) pressTime = now;
  if (b == LOW && now - pressTime > 50) {  // 50ms 이상 눌림
    if (state == ALERT) cancelAlert("버튼");
    else if (state == EMERGENCY && now - pressTime > 2000) cancelAlert("버튼 2초 길게 누름");
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
  }
  magnetOn = magnet;
}

// ===== LED 표시 =====
void updateLed(unsigned long now) {
  if (state == EMERGENCY) {
    ledOn(true);                          // 계속 켜짐
  } else if (state == ALERT) {
    ledOn((now / 100) % 2 == 0);          // 아주 빠르게 깜빡
  } else if (now < friendShowUntil) {
    ledOn((now / 250) % 2 == 0);          // 친구 연결: 천천히 깜빡
  } else {
    ledOn(now % 3000 < 60);               // 평소: 3초마다 짧게 반짝
  }
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
button{font-size:16px;padding:12px;margin:4px 0;width:100%;border-radius:8px;border:1px solid #bbb;background:#fff}
</style></head><body>
<h1>Pariy 키링</h1>
<div class="card" id="stateCard"><div>상태</div><div class="big" id="state" style="font-size:22px">-</div><div id="count"></div></div>
<div class="card"><div>오늘 걸음 수</div><div class="big" id="steps">0</div></div>
<div class="card"><div>친구 키링 연결</div><div class="big" id="friends">0</div><div id="magnet"></div></div>
<div class="card"><div id="mpu"></div></div>
<button onclick="fetch('/cancel')">경보 해제</button>
<button onclick="fetch('/testfall')">낙상 테스트 (시연용)</button>
<button onclick="fetch('/reset')">걸음 수 초기화</button>
<script>
async function tick(){
 try{
  const r=await fetch('/status');const d=await r.json();
  document.getElementById('state').textContent=d.state;
  document.getElementById('steps').textContent=d.steps;
  document.getElementById('friends').textContent=d.friends;
  document.getElementById('magnet').textContent=d.magnet?'지금 자석 닿아 있음':'';
  document.getElementById('mpu').textContent=d.mpu?'센서 정상':'센서 연결 안 됨 - 배선 확인';
  document.getElementById('count').textContent=d.countdown>0?('취소까지 '+d.countdown+'초'):'';
  document.getElementById('stateCard').className='card'+(d.alert?' alert':'');
 }catch(e){}
}
setInterval(tick,700);tick();
</script></body></html>
)rawliteral";

void handleStatus() {
  int countdown = 0;
  if (state == ALERT) {
    long left = (long)CANCEL_MS - (long)(millis() - alertTime);
    countdown = left > 0 ? (left + 999) / 1000 : 0;
  }
  String json = "{";
  json += "\"state\":\"" + String(stateName()) + "\",";
  json += "\"steps\":" + String(steps) + ",";
  json += "\"friends\":" + String(friendCount) + ",";
  json += "\"magnet\":" + String(magnetOn ? "true" : "false") + ",";
  json += "\"mpu\":" + String(mpuOk ? "true" : "false") + ",";
  json += "\"alert\":" + String((state == ALERT || state == EMERGENCY) ? "true" : "false") + ",";
  json += "\"countdown\":" + String(countdown);
  json += "}";
  server.send(200, "application/json; charset=utf-8", json);
}

void setupWeb() {
  server.on("/", []() { server.send(200, "text/html; charset=utf-8", PAGE); });
  server.on("/status", handleStatus);
  server.on("/cancel", []() {
    if (state == ALERT || state == EMERGENCY) cancelAlert("스마트폰");
    server.send(200, "text/plain", "ok");
  });
  server.on("/testfall", []() {
    if (state == NORMAL) startAlert("시연용 테스트 버튼");
    server.send(200, "text/plain", "ok");
  });
  server.on("/reset", []() {
    steps = 0;
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

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  setupWeb();

  Serial.println();
  Serial.println("===== Pariy 키링 시작 =====");
  Serial.println(mpuOk ? "MPU-6050 정상" : "MPU-6050 연결 안 됨! 배선 확인");
  Serial.print("와이파이: ");
  Serial.print(AP_SSID);
  Serial.print(" / 비밀번호: ");
  Serial.println(AP_PASS);
  Serial.print("스마트폰 주소: http://");
  Serial.println(WiFi.softAPIP());
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

  // 10초가 지나면 응급 상태로 (센서 값과 상관없이 시간은 흐름)
  if (state == ALERT && now - alertTime > CANCEL_MS) goEmergency();

  updateButton(now);
  updateHall(now);
  updateLed(now);
  server.handleClient();

  if (now - lastPrint >= 1000) {  // 1초마다 상태 출력
    lastPrint = now;
    Serial.print("상태=");     Serial.print(stateName());
    Serial.print(" | 걸음=");  Serial.print(steps);
    Serial.print(" | 친구=");  Serial.print(friendCount);
    Serial.print(" | 가속도="); Serial.println(lastMag, 2);
  }
}
