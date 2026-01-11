// sw.js (MV3 service worker, ES module)
// - Action click opens side panel (if supported)
// - Command Ctrl/Cmd+Shift+K toggles in-page palette
// - Side panel asks TS_ENSURE_CONTENT to ensure content script is injected and get tabId

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs?.[0]?.id ?? null;
}

async function ensureContentScript(tabId) {
  if (!tabId) return { ok: false, reason: "no_tab" };

  try {
    // Best-effort inject. content/content.js is idempotent (guarded by window.__TODAY_SNIPPET__)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/content.js"]
    });
    return { ok: true };
  } catch (e) {
    // Restricted pages (chrome://, webstore, PDF viewer, etc.) may fail.
    return { ok: false, reason: "inject_failed" };
  }
}

// Open side panel on action click when possible
try {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
} catch {}

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab?.id ?? await getActiveTabId();
  if (!tabId) return;

  // In some Chrome versions, openPanelOnActionClick handles this already.
  try {
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ tabId });
    }
  } catch {
    // ignore
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-palette") return;

  const tabId = await getActiveTabId();
  const ensured = await ensureContentScript(tabId);
  if (!ensured.ok) return;

  try {
    await chrome.tabs.sendMessage(tabId, { type: "TS_TOGGLE_PALETTE" });
  } catch {
    // if message fails, try inject once more
    const ensured2 = await ensureContentScript(tabId);
    if (!ensured2.ok) return;
    try { await chrome.tabs.sendMessage(tabId, { type: "TS_TOGGLE_PALETTE" }); } catch {}
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (!msg?.type) return;

    if (msg.type === "TS_ENSURE_CONTENT") {
      const tabId = await getActiveTabId();
      const ensured = await ensureContentScript(tabId);
      sendResponse({ ...ensured, tabId });
      return;
    }
  })();
  return true;
});
