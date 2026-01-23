const prefixInput = document.getElementById("prefixInput");
const dirInput = document.getElementById("dirInput");
const nativeDirField = document.getElementById("nativeDirField");
const nativeHint = document.getElementById("nativeHint");
const nativeRegionHint = document.getElementById("nativeRegionHint");
const nativeGuide = document.getElementById("nativeGuide");
const nativeActions = document.getElementById("nativeActions");
const nativeRegionBtn = document.getElementById("nativeRegionBtn");
const nativeFullWindowBtn = document.getElementById("nativeFullWindowBtn");
const nativeFullResultBtn = document.getElementById("nativeFullResultBtn");
const copyInstallBtn = document.getElementById("copyInstallBtn");
const copyRegisterBtn = document.getElementById("copyRegisterBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

const HOST_NAME = "com.sobbangcompany.mac_bug_screenshot";

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#374151";
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ["filenamePrefix", "outputDir"],
      (result) => {
        resolve({
          filenamePrefix: result.filenamePrefix || "",
          outputDir: result.outputDir || ""
        });
      }
    );
  });
}

function setSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => resolve());
  });
}

async function saveSettingsFromInputs() {
  const filenamePrefix = prefixInput.value.trim();
  const outputDir = dirInput.value.trim();
  await setSettings({ filenamePrefix, outputDir });
  return { filenamePrefix, outputDir };
}

async function init() {
  const settings = await getSettings();
  prefixInput.value = settings.filenamePrefix;
  dirInput.value = settings.outputDir;
  nativeDirField.classList.remove("is-hidden");
  nativeHint.classList.remove("is-hidden");
  nativeRegionHint.classList.remove("is-hidden");
  nativeActions.classList.remove("is-hidden");
  nativeGuide.classList.add("is-hidden");
}

saveBtn.addEventListener("click", async () => {
  await saveSettingsFromInputs();
  nativeGuide.classList.add("is-hidden");
  setStatus("설정을 저장했습니다.");
});

copyInstallBtn.addEventListener("click", async () => {
  try {
    await copyToClipboard("npm install -g @mac-bug-screenshot/native-host");
    setStatus("설치 명령이 복사되었습니다.");
  } catch (error) {
    setStatus(`복사 실패: ${error.message}`, true);
  }
});

copyRegisterBtn.addEventListener("click", async () => {
  try {
    const command = `mac-bug-screenshot-install ${chrome.runtime.id}`;
    await copyToClipboard(command);
    setStatus("등록 명령이 복사되었습니다.");
  } catch (error) {
    setStatus(`복사 실패: ${error.message}`, true);
  }
});

async function captureNativeMode(mode, options = {}) {
  setStatus(mode === "full" ? "전체 화면 캡처 요청 중..." : "영역 캡처 요청 중...");
  const settings = await getSettings();
  const outputDir = settings.outputDir || dirInput.value.trim();
  chrome.runtime.sendNativeMessage(
    HOST_NAME,
    { action: "capture", outputDir, mode },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus(`오류: ${chrome.runtime.lastError.message}`, true);
        nativeGuide.classList.remove("is-hidden");
        options.onError?.(chrome.runtime.lastError.message);
        return;
      }
      if (!response || response.ok !== true) {
        setStatus(`오류: ${response?.error || "알 수 없는 오류"}`, true);
        nativeGuide.classList.remove("is-hidden");
        options.onError?.(response?.error || "알 수 없는 오류");
        return;
      }
      nativeGuide.classList.add("is-hidden");
      options.onSuccess?.(response);
      if (!options.keepOpen) {
        window.close();
      }
    }
  );
}

nativeRegionBtn.addEventListener("click", async () => {
  await saveSettingsFromInputs();
  await captureNativeMode("region");
});

nativeFullWindowBtn.addEventListener("click", async () => {
  await saveSettingsFromInputs();
  const url = chrome.runtime.getURL("window.html?mode=full");
  chrome.windows.create({ url, type: "popup", width: 360, height: 260 });
  window.close();
});

nativeFullResultBtn.addEventListener("click", async () => {
  await saveSettingsFromInputs();
  await captureNativeMode("full", {
    keepOpen: true,
    onSuccess: () => {
      const url = chrome.runtime.getURL("result.html?status=success");
      chrome.tabs.create({ url });
      window.close();
    }
  });
});

init();
