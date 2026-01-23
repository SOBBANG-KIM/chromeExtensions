// sw.js (MV3 service worker)

async function configureActionBehavior() {
  // 액션(툴바 아이콘) 클릭하면 사이드 패널 열기
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  // 팝업을 강제로 제거 (이전 설정/캐시 방지)
  await chrome.action.setPopup({ popup: "" });
}

chrome.runtime.onInstalled.addListener(async () => {
  await configureActionBehavior();
});

chrome.runtime.onStartup.addListener(async () => {
  await configureActionBehavior();
});
  