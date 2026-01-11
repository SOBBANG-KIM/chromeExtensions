// sw.js (MV3 service worker)

chrome.runtime.onInstalled.addListener(async () => {
    // 액션(툴바 아이콘) 클릭하면 사이드 패널 열기
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });
  