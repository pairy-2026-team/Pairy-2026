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
> 새 스케치를 추가할 때도 `firmware/스케치이름/스케치이름.ino` 형태로 만들어 주세요.

## 시작하기
1. Arduino IDE에 **esp32 보드 패키지** 설치
2. 보드: `ESP32C3 Dev Module`, **USB CDC On Boot = Enabled**
3. 먼저 `firmware/pariy_hw_test`를 올려 배선 확인 (시리얼 모니터 115200)
4. 이상 없으면 `firmware/pariy_keyring`을 업로드
5. 서버(Supabase)로 보내려면 `secrets.example.h`를 `secrets.h`로 복사해서 채운 뒤 다시 업로드
   → 자세한 순서는 [docs/keyring-server.md](docs/keyring-server.md)

---

## 협업 규칙

### 브랜치 구조
| 브랜치 | 용도 |
|---|---|
| `main` | 시연·발표용 안정 버전. develop에서 검증된 것만 합칩니다 |
| `develop` | 개발 통합 브랜치. **모든 작업 PR은 여기로** |
| `Type/#이슈번호-작업내용` | 개인 작업 브랜치. develop에서 만들어 작업합니다 |

### 작업 흐름
```
이슈 생성 → develop에서 브랜치 생성 → 작업·커밋 → 보드 테스트 → PR(→ develop) → 리뷰 승인 → Merge
```

```
git checkout develop
git pull
git checkout -b Feat/#3-fall-detection
(Arduino IDE로 작업)
git add -A
git commit -m "Feat/#3 낙상 감지 상태 머신 구현"
git push -u origin Feat/#3-fall-detection
```
그다음 GitHub에서 **base: `develop`** 으로 PR을 만듭니다.

### 1. 이슈 생성
```
[Type] 작업 내용
ex) [Feat] 낙상 감지 기능 구현
```

### 2. 브랜치 생성
```
Type/#IssueNumber-작업내용
ex) Feat/#3-fall-detection
```
> 작업 내용은 **영어 소문자 + 하이픈**으로 써 주세요. 한글 브랜치 이름은 일부 도구에서 깨집니다.

### 3. 커밋 메시지
```
Type/#IssueNumber 작업 내용
ex) Feat/#3 낙상 감지 상태 머신 구현
```

### 4. PR 생성
```
[Type/#IssueNumber] 작업 내용
ex) [Feat/#3] 낙상 감지 및 10초 골든타임 구현
```
PR 본문에는 아래 내용을 적어 주세요.
- 관련 이슈: `close #3` (merge되면 이슈가 자동으로 닫힙니다)
- 변경 내용 요약
- **테스트 결과**: 실제 보드에 업로드해서 확인한 내용 (시리얼 모니터 로그나 동작 사진·영상)

❗최소 1명의 리뷰 승인 후 merge가 가능하게 설정했으므로 **Reviewers**를 꼭 지정해 주세요❗

### 5. Merge
```
Merge #IssueNumber -> develop
ex) Merge #3 -> develop
```
❗main 브랜치가 아닌 **develop** 브랜치로 merge 바랍니다❗
merge 후 작업 브랜치는 삭제해 주세요.

### Type
| Type | 의미 | 이 프로젝트 예시 |
|---|---|---|
| `Feat` | 기능 구현 | 걸음 수 기능, 보호자 알림 전송 |
| `Fix` | 버그 수정 | 홀 센서가 두 번 세지는 문제 |
| `Mod` | 코드 및 파일 변경 | 낙상 감지 임계값 조정, 핀 번호 변경 |
| `Add` | 파일 추가 | 새 테스트 스케치, 회로도 이미지 |
| `Delete` | 코드 및 파일 삭제 | 안 쓰는 테스트 코드 정리 |
| `Refactor` | 코드 리팩토링 | 센서 읽기 함수 분리 |
| `Docs` | 문서 변경 | README, 배선 문서 수정 |
| `Chore` | 환경 설정 등 기타 | .gitignore, 보드 설정, 라이브러리 추가 |

### PR 올리기 전 체크리스트
- [ ] Arduino IDE에서 **검증(✓)** 이 에러 없이 통과한다
- [ ] 실제 ESP32-C3 보드에 업로드해서 동작을 확인했다
- [ ] 핀 번호를 바꿨다면 `docs/wiring.md`와 두 스케치의 상수를 함께 고쳤다
- [ ] 새 라이브러리를 썼다면 README에 이름과 버전을 적었다
- [ ] 와이파이 비밀번호, API 키 같은 비밀 정보가 코드에 없다

## 주의
와이파이 비밀번호 등 비밀 정보는 코드에 직접 쓰지 말고 `secrets.h`(git 제외됨)에 두세요.
