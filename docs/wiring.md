# 배선

| 신호 | ESP32-C3 핀 | 연결 대상 |
|---|---|---|
| SDA | GPIO 6 | MPU-6050 SDA |
| SCL | GPIO 7 | MPU-6050 SCL |
| HALL | GPIO 4 | KY-024 DO |
| LED | GPIO 8 | 보드 내장 파란 LED (LOW = 켜짐) |
| BTN | GPIO 9 | 보드 BOOT 버튼 (누르면 LOW) |

전원(VCC/GND)은 각 센서를 3.3V / GND에 연결합니다.
핀 번호를 바꾸면 두 펌웨어 파일의 상단 상수를 함께 수정하세요.
