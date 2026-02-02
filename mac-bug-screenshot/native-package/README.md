# mac-bug-screenshot native host (npm)

크롬 확장 프로그램이 macOS `screencapture`를 호출할 수 있도록 네이티브 메시징 호스트를 설치합니다.

## 설치

```bash
npm install -g @mac-bug-screenshot/native-host
```

## 등록

```bash
mac-bug-screenshot-install
```

## 삭제

```bash
npm uninstall -g @mac-bug-screenshot/native-host
```

## 동작

- 전체 화면 캡처 후 Preview를 자동으로 엽니다.
- 저장 경로는 확장 프로그램에서 전달받습니다.

## 게시 정보

- npm 패키지: https://www.npmjs.com/package/@mac-bug-screenshot/native-host
- 현재 버전: 1.0.11

## 문제 해결

- `Native host has exited` 오류가 뜨면 최신 버전으로 업데이트 후 재등록하세요.
  ```bash
  npm install -g @mac-bug-screenshot/native-host@latest
  mac-bug-screenshot-install
  ```
- nvm 사용 시에도 `npm root -g` 기준 경로로 자동 설정됩니다.
