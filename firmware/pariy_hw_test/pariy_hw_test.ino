// =============================================================
//  Pariy 키링 - 부품 테스트 코드 (배선 확인용)
//  보드: ESP32-C3 SuperMini   시리얼 모니터: 115200
//
//  확인 항목 (핀 번호는 pariy_keyring.ino 와 동일)
//   1) LED     : 켜졌다 꺼졌다 (시작할 때 3번 깜빡)
//   2) 버튼    : BOOT 버튼 누르면 "버튼 눌림" 출력 + LED 켜짐
//   3) MPU-6050: I2C 스캔 + 가속도(g) 값 출력 (가만히 두면 1.00 근처)
//   4) 홀 센서 : 자석을 대면 값이 바뀜 -> "자석 감지!" 출력
//
//  Arduino IDE 설정: USB CDC On Boot = Enabled (안 보이면 켜기)
// =============================================================

#include <Wire.h>

const int PIN_SDA  = 6;
const int PIN_SCL  = 7;
const int PIN_HALL = 4;
const int PIN_LED  = 8;  // LOW = 켜짐
const int PIN_BTN  = 9;  // 누르면 LOW

const uint8_t MPU_ADDR = 0x68;

bool mpuOk = false;
int hallIdle = HIGH;
unsigned long lastPrint = 0;

void ledOn(bool on) { digitalWrite(PIN_LED, on ? LOW : HIGH); }

bool mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

bool readAccel(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)MPU_ADDR, 6) != 6) return false;
  uint8_t b[6];
  for (int i = 0; i < 6; i++) b[i] = Wire.read();
  ax = (int16_t)((b[0] << 8) | b[1]) / 4096.0f;  // ±8g 설정
  ay = (int16_t)((b[2] << 8) | b[3]) / 4096.0f;
  az = (int16_t)((b[4] << 8) | b[5]) / 4096.0f;
  return true;
}

void i2cScan() {
  Serial.println("[I2C 스캔]");
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("  발견: 0x");
      Serial.println(addr, HEX);
      found++;
    }
  }
  if (found == 0) Serial.println("  아무것도 못 찾음 -> SDA/SCL/VCC/GND 배선 확인");
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_HALL, INPUT);
  pinMode(PIN_BTN, INPUT_PULLUP);

  Serial.println();
  Serial.println("===== Pariy 부품 테스트 시작 =====");

  // 1) LED 3번 깜빡
  Serial.println("[LED] 3번 깜빡입니다");
  for (int i = 0; i < 3; i++) {
    ledOn(true);  delay(250);
    ledOn(false); delay(250);
  }

  // 3) MPU-6050
  Wire.begin(PIN_SDA, PIN_SCL);
  i2cScan();
  mpuOk = mpuWrite(0x6B, 0x00);  // 잠자기 해제
  delay(50);
  mpuWrite(0x1C, 0x10);          // ±8g
  Serial.println(mpuOk ? "[MPU-6050] 정상 연결" : "[MPU-6050] 연결 안 됨!");

  // 4) 홀 센서 기준값 (켤 때 자석을 대지 마세요)
  hallIdle = digitalRead(PIN_HALL);
  Serial.print("[홀 센서] 자석 없을 때 값 = ");
  Serial.println(hallIdle);

  Serial.println("-----------------------------------");
  Serial.println("보드를 흔들고, BOOT 버튼을 누르고, 자석을 대보세요.");
}

void loop() {
  static int lastBtn = HIGH;
  static int lastHall = -1;

  // 2) 버튼 (누르는 동안 LED 켜짐)
  int btn = digitalRead(PIN_BTN);
  ledOn(btn == LOW);
  if (btn == LOW && lastBtn == HIGH) Serial.println(">>> 버튼 눌림!");
  if (btn == HIGH && lastBtn == LOW) Serial.println(">>> 버튼 뗌");
  lastBtn = btn;

  // 4) 홀 센서 변화 감지
  int hall = digitalRead(PIN_HALL);
  if (hall != lastHall) {
    if (lastHall != -1) {
      Serial.println(hall != hallIdle ? ">>> 자석 감지!" : ">>> 자석 멀어짐");
    }
    lastHall = hall;
  }

  // 3) 가속도 값 0.5초마다 출력
  if (millis() - lastPrint >= 500) {
    lastPrint = millis();
    float ax, ay, az;
    if (mpuOk && readAccel(ax, ay, az)) {
      float mag = sqrt(ax * ax + ay * ay + az * az);
      Serial.print("가속도 X="); Serial.print(ax, 2);
      Serial.print(" Y=");       Serial.print(ay, 2);
      Serial.print(" Z=");       Serial.print(az, 2);
      Serial.print(" | 크기=");  Serial.print(mag, 2);
      Serial.print("g | 홀=");   Serial.println(hall);
    } else {
      Serial.println("MPU-6050 읽기 실패 - 배선 확인");
    }
  }
  delay(5);
}
