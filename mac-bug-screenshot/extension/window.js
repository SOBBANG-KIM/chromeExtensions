const statusEl = document.getElementById("status");
const closeBtn = document.getElementById("closeBtn");
const nativeGuide = document.getElementById("nativeGuide");

const HOST_NAME = "com.sobbangcompany.mac_bug_screenshot";

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#374151";
}

function getMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") || "full";
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["outputDir"], (result) => {
      resolve({ outputDir: result.outputDir || "" });
    });
  });
}

async function minimizeWindow() {
  const win = await chrome.windows.getCurrent();
  await chrome.windows.update(win.id, { state: "minimized" });
}

async function restoreWindow() {
  const win = await chrome.windows.getCurrent();
  await chrome.windows.update(win.id, { state: "normal", focused: true });
}

async function startCapture() {
  const mode = getMode();
  setStatus(mode === "full" ? "Preparing full screen capture..." : "Preparing region capture...");
  const settings = await getSettings();
  const outputDir = settings.outputDir || "";

  await minimizeWindow();
  await new Promise((resolve) => setTimeout(resolve, 200));

  chrome.runtime.sendNativeMessage(
    HOST_NAME,
    { action: "capture", outputDir, mode },
    async (response) => {
      if (chrome.runtime.lastError) {
        await restoreWindow();
        nativeGuide.classList.remove("is-hidden");
        setStatus(`Error: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      if (!response || response.ok !== true) {
        await restoreWindow();
        nativeGuide.classList.remove("is-hidden");
        setStatus(`Error: ${response?.error || "Unknown error"}`, true);
        return;
      }
      await restoreWindow();
      nativeGuide.classList.add("is-hidden");
      setStatus("Capture complete");
    }
  );
}

closeBtn.addEventListener("click", () => {
  window.close();
});

startCapture();
