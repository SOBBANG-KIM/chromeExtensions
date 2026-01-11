# Chrome Extensions

Chrome 확장 프로그램 개발 학습 프로젝트 모음입니다.

## 프로젝트 목록

### 📋 [Tabs Sort Manager](./tabs-sort-manager/)

사이드 패널에서 탭을 효율적으로 관리할 수 있는 도구입니다.

**주요 기능:**
- 탭 그룹 관리 및 시각화
- 도메인별 자동 정렬
- 드래그 앤 드롭으로 탭 재정렬
- 검색 기능 (제목, URL, 도메인, 그룹명)
- 다크/라이트 테마 지원

**버전:** 0.1.0

[자세한 문서 보기](./tabs-sort-manager/README.md)

---

### 📝 [Today Snippet](./today-snippet/)

자주 사용하는 텍스트 스니펫을 저장하고 빠르게 삽입할 수 있는 도구입니다.

**주요 기능:**
- 스니펫 저장 및 관리
- 사이드 패널 및 인페이지 커맨드 팔레트
- 변수 치환 (내장 변수 + 사용자 변수)
- 드래그 앤 드롭으로 순서 변경
- 고정 기능 및 사용 통계
- 가져오기/내보내기

**버전:** 0.3.0

[자세한 문서 보기](./today-snippet/README.md)

---

## 공통 기술 스택

모든 프로젝트는 다음 기술을 사용합니다:

- **Manifest V3**: 최신 Chrome 확장 프로그램 API
- **Vanilla JavaScript**: 프레임워크 없이 순수 JavaScript 사용
- **Chrome APIs**: 
  - `chrome.sidePanel`: 사이드 패널
  - `chrome.storage`: 데이터 저장
  - `chrome.tabs`: 탭 관리
  - `chrome.scripting`: 스크립트 주입
  - `chrome.commands`: 키보드 단축키

## 설치 방법

각 프로젝트는 독립적으로 설치할 수 있습니다:

1. Chrome 브라우저에서 `chrome://extensions/` 접속
2. 우측 상단의 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. 원하는 프로젝트 폴더 선택

## 프로젝트 구조

```
chrome_extention/
├── tabs-sort-manager/      # 탭 관리 확장 프로그램
│   ├── manifest.json
│   ├── sidepanel.html
│   ├── sidepanel.css
│   ├── sidepanel.js
│   ├── sw.js
│   └── README.md
│
└── today-snippet/          # 스니펫 관리 확장 프로그램
    ├── manifest.json
    ├── sw.js
    ├── sidepanel/
    │   ├── sidepanel.html
    │   ├── sidepanel.css
    │   └── sidepanel.js
    ├── content/
    │   └── content.js
    ├── assets/
    │   ├── icon16.png
    │   ├── icon48.png
    │   └── icon128.png
    └── README.md
```

## 개발 목적

이 프로젝트들은 Chrome 확장 프로그램 개발 학습을 목적으로 제작되었습니다.

- Manifest V3 API 학습
- Chrome Extension 아키텍처 이해
- 사이드 패널 활용
- 콘텐츠 스크립트 주입
- 스토리지 관리
- 사용자 인터페이스 설계

## 라이선스

이 프로젝트들은 학습 목적으로 제작되었습니다.
