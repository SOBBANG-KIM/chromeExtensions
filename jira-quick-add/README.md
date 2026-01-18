# Jira Quick Add

이미 로그인된 Jira 세션(쿠키)을 활용해 이슈와 워크로그를 빠르게 등록하는 크롬 확장 프로그램입니다.

## 주요 기능

- **이슈 등록**: 프로젝트 키/이슈 타입/요약/설명 입력 후 즉시 생성
- **워크로그 등록**: 이슈 키/시작 시각/소요 시간/설명 입력으로 기록
- **로그인 상태 표시**: Jira 세션이 연결되어 있는지 상단에 텍스트로 표시
- **최근 이슈 키 사용**: 직전에 생성한 이슈 키를 워크로그 탭에 자동 사용

## 설치 방법

1. Chrome 브라우저에서 `chrome://extensions/` 접속
2. 우측 상단의 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `jira-quick-add` 폴더 선택

## 사용 방법

### add jira 탭
1. `프로젝트 키`, `이슈 타입`, `요약`, `설명` 입력
2. `등록` 버튼 클릭
3. 성공 시 이슈 키가 표시되고, `열기` 링크로 이동 가능

### add worklog 탭
1. `이슈 키` 입력 또는 `마지막 이슈 키 사용` 버튼 클릭
2. `시작 시각`, `소요 시간`, `설명` 입력
3. `Worklog 저장` 버튼 클릭

## 고정 API 정보

- Base URL: `https://jira.foodtechkorea.com/rest`
- API 버전: `v2`
- 호출 예시: `https://jira.foodtechkorea.com/rest/api/2/issue`

## 입력 형식 안내

- **소요 시간**: Jira 형식(`1h`, `30m`, `1h 30m` 등)
- **시작 시각**: 로컬 시간 기준 `datetime-local`

## 파일 구조

```
jira-quick-add/
├── manifest.json
├── popup.html
├── popup.css
├── popup.js
└── README.md
```

## 권한

- `storage`: 입력값/설정 저장
- `activeTab`: 현재 탭 정보 가져오기
- `host_permissions`: Jira API 호출

## 라이선스

이 프로젝트는 학습 목적으로 제작되었습니다.
