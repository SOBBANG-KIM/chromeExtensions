# Mate Jira Quick Add

Jira 이슈 등록과 Worklog 기록을 빠르게 처리하는 크롬 확장 프로그램입니다. 로그인된 Jira 세션을 그대로 사용하고, Google Calendar 회의를 기준으로 Worklog를 자동 입력할 수 있습니다.

## Chrome 웹스토어용 설명

**Mate Jira Quick Add**는 Jira 이슈 생성과 Worklog 입력을 빠르고 정확하게 수행하도록 돕는 확장 프로그램입니다.  
로그인된 Jira 세션을 그대로 사용하며, Google Calendar 회의를 불러와 날짜/시간 범위 기준으로 Worklog를 자동 작성할 수 있습니다.

**주요 기능**
- 이슈 등록: 프로젝트 키/이슈 타입/요약/설명 입력 후 즉시 생성
- 부작업 생성: 상위 이슈 키 입력 시 부작업 생성 지원
- Worklog 등록: 이슈 키/시작 시각/소요 시간/설명 입력으로 기록
- Google Calendar 연동: 회의 목록과 시간 합계를 자동 입력
- 로그인 상태 표시: Jira/Google 로그인 상태를 상단에서 확인

## 사용 가이드

### 1) Jira 이슈 등록
1. `add jira` 탭에서 `프로젝트 키`, `이슈 타입`, `요약`, `설명` 입력
2. 이슈 타입이 `부작업`이면 `상위 이슈 키`를 입력
3. `등록` 버튼 클릭 → 성공 시 이슈 키가 표시됨

### 2) Worklog 등록
1. `add worklog` 탭에서 `이슈 키` 입력
2. `시작 시각`, `소요 시간`, `설명` 입력
3. `Worklog 저장` 클릭

### 3) Google Calendar 회의 불러오기
1. `Google 로그인` 클릭 후 인증
2. 날짜와 시간 범위를 설정
3. `회의 불러오기` 클릭  
   - 회의 목록이 Worklog 설명에 자동 입력
   - 회의 합계(또는 시간 범위 합계)가 소요 시간에 자동 입력

## 입력 형식
- **소요 시간**: Jira 형식(`1h`, `30m`, `1h 30m` 등)
- **시작 시각**: 로컬 시간 기준 `datetime-local`

## 고정 API 정보
- Base URL: `https://jira.foodtechkorea.com/rest`
- API 버전: `v2`

## 권한 안내
- `storage`: 입력값 저장
- `identity`: Google OAuth 인증
- `host_permissions`: Jira/Google API 호출

## 파일 구조
```
jira-quick-add-mate/
├── manifest.json
├── popup.html
├── popup.css
├── popup.js
└── README.md
```

## 라이선스
이 프로젝트는 학습 목적으로 제작되었습니다.
