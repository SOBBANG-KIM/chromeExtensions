const prefixInput = document.getElementById("prefixInput");
const dirInput = document.getElementById("dirInput");
const nativeDirField = document.getElementById("nativeDirField");
const nativeHint = document.getElementById("nativeHint");
const nativeRegionHint = document.getElementById("nativeRegionHint");
const nativeGuide = document.getElementById("nativeGuide");
const nativeActions = document.getElementById("nativeActions");
const nativeRegionBtn = document.getElementById("nativeRegionBtn");
const nativeFullWindowBtn = document.getElementById("nativeFullWindowBtn");
const copyInstallBtn = document.getElementById("copyInstallBtn");
const copyRegisterBtn = document.getElementById("copyRegisterBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const langToggle = document.getElementById("langToggle");

const HOST_NAME = "com.sobbangcompany.mac_bug_screenshot";
const LANGUAGE_KEY = "uiLanguage";

const translations = {
  ko: {
    title: "Mac Bug Screenshot",
    hintInstall: "별도 설치가 필요합니다.",
    labelPrefix: "파일명 접두사",
    labelDir: "저장 경로",
    hintSettings: "설정 저장 후 적용됩니다.",
    hintRegion: "영역 드래그 선택을 지원합니다.",
    btnSave: "설정 저장",
    btnRegion: "영역 캡처",
    btnFullWindow: "전체 화면 캡처",
    guideTitle: "설치가 필요합니다.",
    guideDesc: "터미널에서 아래 명령을 실행하세요.",
    btnCopyInstall: "설치 명령 복사",
    btnCopyRegister: "등록 명령 복사",
    linkNpm: "npm 페이지 열기",
    statusSaved: "설정을 저장했습니다.",
    statusCopyInstall: "설치 명령이 복사되었습니다.",
    statusCopyRegister: "등록 명령이 복사되었습니다.",
    statusInstalled: "설치 완료",
    statusCopyFailed: "복사 실패: {error}",
    statusCaptureFull: "전체 화면 캡처 요청 중...",
    statusCaptureRegion: "영역 캡처 요청 중...",
    statusError: "오류: {error}",
    unknownError: "알 수 없는 오류"
  },
  en: {
    title: "Mac Bug Screenshot",
    hintInstall: "Installation required.",
    labelPrefix: "Filename prefix",
    labelDir: "Save directory",
    hintSettings: "Applied after saving settings.",
    hintRegion: "Region drag selection is supported.",
    btnSave: "Save settings",
    btnRegion: "Region capture",
    btnFullWindow: "Full screen",
    guideTitle: "Installation required.",
    guideDesc: "Run the following commands in Terminal.",
    btnCopyInstall: "Copy install command",
    btnCopyRegister: "Copy register command",
    linkNpm: "Open npm page",
    statusSaved: "Settings saved.",
    statusCopyInstall: "Install command copied.",
    statusCopyRegister: "Register command copied.",
    statusInstalled: "Installed",
    statusCopyFailed: "Copy failed: {error}",
    statusCaptureFull: "Requesting full screen capture...",
    statusCaptureRegion: "Requesting region capture...",
    statusError: "Error: {error}",
    unknownError: "Unknown error"
  }
};
let currentLanguage = "ko";

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#374151";
}

function formatText(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
}

function t(key, params) {
  const template = translations[currentLanguage]?.[key] || "";
  return formatText(template, params);
}

function applyTranslations(lang) {
  currentLanguage = lang;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    const text = t(key);
    if (text) {
      element.textContent = text;
    }
  });
  langToggle.textContent = currentLanguage === "ko" ? "English" : "한국어";
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

function getLanguage() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([LANGUAGE_KEY], (result) => {
      resolve(result[LANGUAGE_KEY] || "ko");
    });
  });
}

function setLanguage(lang) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [LANGUAGE_KEY]: lang }, () => resolve());
  });
}

async function saveSettingsFromInputs() {
  const filenamePrefix = prefixInput.value.trim();
  const outputDir = dirInput.value.trim();
  await setSettings({ filenamePrefix, outputDir });
  return { filenamePrefix, outputDir };
}

async function init() {
  const [settings, language] = await Promise.all([getSettings(), getLanguage()]);
  prefixInput.value = settings.filenamePrefix;
  dirInput.value = settings.outputDir;
  nativeDirField.classList.remove("is-hidden");
  nativeHint.classList.remove("is-hidden");
  nativeRegionHint.classList.remove("is-hidden");
  nativeActions.classList.remove("is-hidden");
  nativeGuide.classList.add("is-hidden");
  applyTranslations(language);
  setStatus(t("statusInstalled"));
}

saveBtn.addEventListener("click", async () => {
  await saveSettingsFromInputs();
  nativeGuide.classList.add("is-hidden");
  setStatus(t("statusSaved"));
});

copyInstallBtn.addEventListener("click", async () => {
  try {
    await copyToClipboard("npm install -g @mac-bug-screenshot/native-host");
    setStatus(t("statusCopyInstall"));
  } catch (error) {
    setStatus(t("statusCopyFailed", { error: error.message }), true);
  }
});

copyRegisterBtn.addEventListener("click", async () => {
  try {
    const command = `mac-bug-screenshot-install ${chrome.runtime.id}`;
    await copyToClipboard(command);
    setStatus(t("statusCopyRegister"));
  } catch (error) {
    setStatus(t("statusCopyFailed", { error: error.message }), true);
  }
});

async function captureNativeMode(mode, options = {}) {
  setStatus(mode === "full" ? t("statusCaptureFull") : t("statusCaptureRegion"));
  const settings = await getSettings();
  const outputDir = settings.outputDir || dirInput.value.trim();
  chrome.runtime.sendNativeMessage(
    HOST_NAME,
    { action: "capture", outputDir, mode },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus(
          t("statusError", { error: chrome.runtime.lastError.message }),
          true
        );
        nativeGuide.classList.remove("is-hidden");
        options.onError?.(chrome.runtime.lastError.message);
        return;
      }
      if (!response || response.ok !== true) {
        setStatus(
          t("statusError", {
            error: response?.error || t("unknownError")
          }),
          true
        );
        nativeGuide.classList.remove("is-hidden");
        options.onError?.(response?.error || t("unknownError"));
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

langToggle.addEventListener("click", async () => {
  const nextLanguage = currentLanguage === "ko" ? "en" : "ko";
  await setLanguage(nextLanguage);
  applyTranslations(nextLanguage);
});

init();
