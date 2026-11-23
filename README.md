# Pairy 2026 (페어리)

아두이노(ESP32-C3)로 만드는 **피지컬 AI 키링** 프로젝트입니다.
낙상 감지, 걸음 수 세기, 친구 키링 맞대기(홀 센서), 스마트폰 상태 확인 기능을 담고 있습니다.

## 기능
- 걸음 수 세기 (MPU-6050)
- 낙상 감지: 떨어짐 → 충격 → 2초간 움직임 없음
- 10초 골든타임: LED가 빠르게 깜빡이는 동안 BOOT 버튼으로 취소, 안 하면 "응급" 상태
- 친구 키링 맞대기: 자석이 홀 센서(KY-024)에 닿으면 연결 횟수 증가
- 키링이 만드는 와이파이(`Pariy-Keyring`)에 접속해 `192.168.4.1`에서 상태 확인

## 하드웨어
| 부품 | 용도 |
|---|---|
| ESP32-C3 SuperMini | 메인 보드 (내장 LED, BOOT 버튼 사용) |
| MPU-6050 | 가속도 센서 |
| KY-024 | 홀 센서 (친구 키링 감지) |

핀 배선은 [docs/wiring.md](docs/wiring.md)를 참고하세요.

## 폴더 구조
```
firmware/
  pariy_hw_test/     부품 배선 확인용 테스트 코드
  pariy_keyring/     키링 완성 코드
docs/                문서 (배선도 등)
```
> Arduino IDE는 `.ino` 파일 이름과 폴더 이름이 같아야 열립니다.

## 시작하기
1. Arduino IDE에 **esp32 보드 패키지** 설치
2. 보드: `ESP32C3 Dev Module`, **USB CDC On Boot = Enabled**
3. 먼저 `firmware/pariy_hw_test`를 올려 배선 확인 (시리얼 모니터 115200)
4. 이상 없으면 `firmware/pariy_keyring`을 업로드

## 브랜치 규칙
- `main`: 시연 가능한 안정 버전
- `feature/기능이름`: 기능 개발 후 PR로 `main`에 합치기

## 주의
와이파이 비밀번호 등 비밀 정보는 코드에 직접 쓰지 말고 `secrets.h`(git 제외됨)에 두세요.
