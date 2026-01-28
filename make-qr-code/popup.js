const elements = {
  urlInput: document.getElementById("urlInput"),
  sizeInput: document.getElementById("sizeInput"),
  captionInput: document.getElementById("captionInput"),
  fileNameInput: document.getElementById("fileNameInput"),
  langToggle: document.getElementById("langToggle"),
  generate: document.getElementById("generate"),
  download: document.getElementById("download"),
  status: document.getElementById("status"),
  canvas: document.getElementById("qrCanvas"),
};

const DEFAULT_SIZE = 240;
const MIN_SIZE = 120;
const MAX_SIZE = 1024;
const QR_API_URL = "https://api.qrserver.com/v1/create-qr-code/";

let renderTimer = null;
let lastRendered = null;
let currentLang = "ko";

const I18N = {
  ko: {
    title: "URL QR 코드 생성기",
    subtitle: "URL과 옵션을 입력하면 QR 코드 이미지를 만들어요.",
    labelUrl: "URL",
    labelSize: "이미지 크기 (px)",
    labelFileName: "다운로드 파일명",
    labelCaption: "QR 코드 아래 문구 (선택)",
    placeholderCaption: "예) 이벤트 페이지 바로가기",
    buttonGenerate: "QR 생성",
    buttonDownload: "다운로드",
    statusNeedUrl: "URL을 입력하면 QR 코드가 생성됩니다.",
    statusInvalidUrl: "유효한 URL을 입력해주세요.",
    statusLoading: "QR 코드를 생성 중입니다...",
    statusReady: "QR 코드가 준비되었습니다.",
    statusNeedRender: "먼저 QR 코드를 생성해주세요.",
    statusFetchError: "QR 코드 이미지를 불러오지 못했습니다.",
    statusRenderError: "QR 코드 생성에 실패했습니다.",
    warningAutoScheme: "http/https가 없어 https:// 를 자동으로 붙였어요.",
    placeholderCanvas: "URL을 입력하세요",
    langToggle: "한국어",
  },
  en: {
    title: "URL QR Code Generator",
    subtitle: "Enter a URL and options to generate a QR code image.",
    labelUrl: "URL",
    labelSize: "Image size (px)",
    labelFileName: "Download file name",
    labelCaption: "Caption below QR (optional)",
    placeholderCaption: "e.g. Go to event page",
    buttonGenerate: "Generate",
    buttonDownload: "Download",
    statusNeedUrl: "Enter a URL to generate a QR code.",
    statusInvalidUrl: "Please enter a valid URL.",
    statusLoading: "Generating QR code...",
    statusReady: "Your QR code is ready.",
    statusNeedRender: "Please generate a QR code first.",
    statusFetchError: "Failed to fetch the QR code image.",
    statusRenderError: "Failed to generate the QR code.",
    warningAutoScheme: "Added https:// because the scheme was missing.",
    placeholderCanvas: "Enter a URL",
    langToggle: "English",
  },
};

function t(key) {
  return I18N[currentLang]?.[key] || I18N.ko[key] || "";
}

function setStatus(message = "", type = "") {
  elements.status.className = `status ${type}`.trim();
  elements.status.textContent = message;
}

function applyLanguage(lang) {
  currentLang = I18N[lang] ? lang : "ko";
  document.documentElement.lang = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    node.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    node.setAttribute("placeholder", t(key));
  });
  elements.langToggle.textContent = t("langToggle");
  elements.langToggle.setAttribute("aria-pressed", currentLang === "en");
}

function sanitizeFileName(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "qr-code";
  }
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, "").trim();
  return sanitized || "qr-code";
}

function normalizeUrlInput(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return { normalizedUrl: "", warningKey: "" };
  }
  try {
    const parsed = new URL(trimmed);
    return { normalizedUrl: parsed.toString(), warningKey: "" };
  } catch (error) {
    const withScheme = `https://${trimmed}`;
    try {
      const parsed = new URL(withScheme);
      return {
        normalizedUrl: parsed.toString(),
        warningKey: "warningAutoScheme",
      };
    } catch (secondError) {
      return { normalizedUrl: "", warningKey: "statusInvalidUrl" };
    }
  }
}

function clampSize(value) {
  const size = Number(value);
  if (Number.isNaN(size)) {
    return DEFAULT_SIZE;
  }
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));
}

function wrapText(ctx, text, maxWidth) {
  if (!text) {
    return [];
  }
  const paragraphs = text.split(/\n+/);
  const lines = [];

  paragraphs.forEach((paragraph, index) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
    } else {
      let currentLine = words[0];
      for (let i = 1; i < words.length; i += 1) {
        const next = `${currentLine} ${words[i]}`;
        if (ctx.measureText(next).width <= maxWidth) {
          currentLine = next;
        } else {
          lines.push(currentLine);
          currentLine = words[i];
        }
      }
      lines.push(currentLine);
    }
    if (index < paragraphs.length - 1) {
      lines.push("");
    }
  });

  return lines;
}

function drawPlaceholder(message) {
  const ctx = elements.canvas.getContext("2d");
  const size = DEFAULT_SIZE;
  elements.canvas.width = size;
  elements.canvas.height = size;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, size / 2, size / 2);
}

async function fetchQrImage(url, size) {
  const params = new URLSearchParams({
    size: `${size}x${size}`,
    data: url,
  });
  const response = await fetch(`${QR_API_URL}?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(t("statusFetchError"));
  }
  return response.blob();
}

async function renderQr() {
  const { normalizedUrl, warningKey } = normalizeUrlInput(elements.urlInput.value);
  const size = clampSize(elements.sizeInput.value);
  const caption = elements.captionInput.value.trim();

  elements.sizeInput.value = String(size);

  if (!normalizedUrl) {
    elements.download.disabled = true;
    const message = warningKey ? t(warningKey) : t("statusNeedUrl");
    const statusType = warningKey ? "error" : "";
    setStatus(message, statusType);
    drawPlaceholder(t("placeholderCanvas"));
    return;
  }

  try {
    const loadingMessage = warningKey
      ? `${t(warningKey)} ${t("statusLoading")}`
      : t("statusLoading");
    setStatus(loadingMessage);
    const qrBlob = await fetchQrImage(normalizedUrl, size);
    const qrBitmap = await createImageBitmap(qrBlob);

    const ctx = elements.canvas.getContext("2d");
    const fontSize = Math.max(12, Math.round(size * 0.07));
    const lineHeight = Math.round(fontSize * 1.4);
    const padding = 12;
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    const lines = wrapText(ctx, caption, size - padding * 2);
    const captionHeight = lines.length ? padding + lines.length * lineHeight + padding / 2 : 0;

    elements.canvas.width = size;
    elements.canvas.height = size + captionHeight;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
    ctx.drawImage(qrBitmap, 0, 0, size, size);

    if (lines.length) {
      ctx.fillStyle = "#1d2125";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      lines.forEach((line, index) => {
        const y = size + padding + index * lineHeight;
        ctx.fillText(line, size / 2, y);
      });
    }

    elements.download.disabled = false;
    lastRendered = {
      url: normalizedUrl,
      size,
      caption,
    };
    const doneMessage = warningKey
      ? `${t(warningKey)} ${t("statusReady")}`
      : t("statusReady");
    setStatus(doneMessage, "success");
  } catch (error) {
    elements.download.disabled = true;
    setStatus(error?.message || t("statusRenderError"), "error");
  }
}

function scheduleRender() {
  if (renderTimer) {
    window.clearTimeout(renderTimer);
  }
  renderTimer = window.setTimeout(() => {
    renderTimer = null;
    renderQr();
  }, 200);
}

function downloadCanvas() {
  if (!lastRendered) {
    setStatus(t("statusNeedRender"), "error");
    return;
  }
  const fileName = sanitizeFileName(elements.fileNameInput.value);
  const link = document.createElement("a");
  link.download = `${fileName}.png`;
  link.href = elements.canvas.toDataURL("image/png");
  link.click();
}

document.addEventListener("DOMContentLoaded", () => {
  elements.sizeInput.value = String(DEFAULT_SIZE);
  elements.fileNameInput.value = "qr-code";
  const defaultLang = navigator.language?.startsWith("en") ? "en" : "ko";
  applyLanguage(defaultLang);
  drawPlaceholder(t("placeholderCanvas"));

  elements.generate.addEventListener("click", renderQr);
  elements.download.addEventListener("click", downloadCanvas);
  elements.urlInput.addEventListener("input", scheduleRender);
  elements.sizeInput.addEventListener("input", scheduleRender);
  elements.captionInput.addEventListener("input", scheduleRender);
  elements.langToggle.addEventListener("click", () => {
    const nextLang = currentLang === "ko" ? "en" : "ko";
    applyLanguage(nextLang);
    renderQr();
  });
});
