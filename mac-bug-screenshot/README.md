# mac-bug-screenshot

맥에서 전체 화면/영역 캡처를 빠르게 수행하는 크롬 확장입니다. 네이티브 호스트를 설치하면 지정한 경로로 바로 저장됩니다.

## 크롬 확장 팝업(UI)

1) `mac-bug-screenshot/extension`을 크롬 확장으로 로드
2) 파일명 접두사와 저장 경로를 입력
3) **설정 저장** 버튼 클릭
4) **전체 화면 캡처** 또는 **영역 캡처** 버튼 클릭

네이티브 호스트를 설치하세요.
```bash
npm install -g @mac-bug-screenshot/native-host
mac-bug-screenshot-install
```

## 파일명/경로 설정

**파일명 접두사**와 **저장 경로**가 모두 적용됩니다.

## 참고

- 캡처 결과는 기본적으로 Preview 앱으로 열립니다.
- 네이티브 호스트 설치가 필요합니다.
