# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Jira 이슈 등록, Worklog 기록, 내 이슈 조회를 처리하는 Manifest V3 Chrome 확장 프로그램(팝업 기반). 빌드 도구나 패키지 매니저 없이 순수 HTML/CSS/JS로만 구성되어 있다.

## 개발 명령

빌드/린트/테스트 스크립트는 없다. 개발은 다음 방식으로 진행한다.

- **로드/리로드**: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드" (또는 기존 로드 후 새로고침 버튼)로 `manifest.json`이 있는 이 폴더를 로드한다.
- **디버깅**: 확장 아이콘 팝업을 우클릭 → "검사"로 팝업 전용 DevTools 콘솔을 연다. `popup.js` 내 `console.error` 로그를 확인한다.
- **버전 배포**: `manifest.json`의 `version`을 올리고 웹스토어에 zip으로 업로드한다 (커밋 로그 참고: 웹스토어 게시본과 로컬 버전 충돌 방지를 위해 버전을 순차적으로 올려왔다).

## 아키텍처

전체 로직이 `popup.js` 단일 파일(약 1700줄)에 있으며, `popup.html`의 DOM 요소를 `elements` 객체로 캐싱해 직접 조작하는 구조다. 프레임워크·모듈 번들러 없음.

### 3개 탭 구조 (popup.html 기준)
- **add jira** (`panel-issue`): 이슈 생성. 프로젝트 키/이슈 타입 입력 시 Jira `createmeta` API를 조회해 프로젝트·이슈타입별 필수 동적 필드를 자동 렌더링(`loadIssueCreateMetaAndRender` → `fetchIssueCreateMeta` → `renderIssueExtraFields`). 이슈 타입이 "부작업"이면 상위 이슈 키 입력란이 나타난다. 구성요소(components)는 동적 필드와 별개로 전용 셀렉터(`loadComponents`/`applyComponents`)로 처리된다.
- **add worklog** (`panel-worklog`): 내부에 다시 "한번에 저장"(`panel-worklog-once`)과 "회의별로 저장"(`panel-worklog-per-meeting`) 하위 탭이 있다(`worklogMode` 상태로 전환). Google Calendar 연동으로 지정 날짜/시간 범위의 회의를 불러와(`handleLoadMeetings`) 각 회의를 개별 Worklog로 저장(`handleAddWorklogsFromCalendar`)하거나, 합산된 시간을 하나의 Worklog로 저장(`handleAddWorklog`)할 수 있다.
- **add my issues** (`panel-my-issues`): JQL(`assignee = currentUser() AND status = "..."`)로 내 이슈를 상태/프로젝트 필터·페이지네이션(`MY_ISSUES_PAGE_SIZE = 10`)과 함께 조회하고, 각 이슈 항목에서 바로 Worklog를 남길 수 있다(`postWorklog` 공용 함수 사용).

### 인증
- **Jira**: 별도 로그인 UI 없이 브라우저의 기존 Jira 세션 쿠키를 그대로 사용(`credentials: "include"`). `checkAuthStatus()`가 `/myself` 호출로 로그인 여부만 확인한다.
- **Google**: `chrome.identity.launchWebAuthFlow` 기반 OAuth 암묵적 흐름(implicit flow)으로 access token을 받아 `chrome.storage.local`에 만료시간과 함께 캐싱한다(`getGoogleToken`, `GOOGLE_TOKEN_KEY`).

### 상태 저장 (`chrome.storage.local`)
입력값은 필드 그룹별로 자동 저장되며 팝업을 다시 열어도 복원된다: `settings`(프로젝트 키/이슈 타입), `draft`(요약/설명/상위 이슈 키), `worklogDraft`(Worklog 관련 입력 전체), `projectKeys`(즐겨찾기 프로젝트 키 목록, `DEFAULT_PROJECT_KEYS`와 병합), `lastIssueKey`, `activeTab`. 각 필드에 `input`/`change`/`blur` 리스너를 걸어 `saveSettings`/`saveDraft`/`saveWorklogDraft`를 호출하는 패턴이 반복된다.

### Jira API
- Base URL과 API 버전은 상단 상수로 고정: `API_ROOT = "https://jira.foodtechkorea.com/rest"`, `API_VERSION = "2"`. v3로 바꾸면 `description`/`comment` 필드가 ADF(Atlassian Document Format, `toAdf()`) 형식으로 전환되도록 이미 분기 처리되어 있다.
- 이슈/Worklog 생성 전 `stripEmoji()`로 이모지(그림 문자)를 제거한다 — Jira API가 특정 이모지 입력 시 오류를 내는 것을 막기 위함.
- 페이로드 구성은 `buildPayload`(이슈)/`buildWorklogPayload`(Worklog)가 담당하고, 유효성 검사는 `validate`/`validateWorklog`/`validateExtraFields`가 별도로 담당한다.

### 그 외 참고
- `host_permissions`에 `<all_urls>`가 포함되어 있어 임의 사이트에서도 쿠키 기반 요청이 가능하지만, 실제 호출 대상은 `API_ROOT`와 `www.googleapis.com`으로 코드 상 고정되어 있다.
