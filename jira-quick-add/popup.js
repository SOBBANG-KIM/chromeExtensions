const storage = chrome.storage.local;
const API_ROOT = "https://jira.foodtechkorea.com/rest";
const API_VERSION = "2";

const elements = {
  projectKey: document.getElementById("projectKey"),
  issueType: document.getElementById("issueType"),
  tabIssue: document.getElementById("tab-issue"),
  tabWorklog: document.getElementById("tab-worklog"),
  panelIssue: document.getElementById("panel-issue"),
  panelWorklog: document.getElementById("panel-worklog"),
  summary: document.getElementById("summary"),
  description: document.getElementById("description"),
  useTab: document.getElementById("useTab"),
  create: document.getElementById("create"),
  clear: document.getElementById("clear"),
  worklogIssueKey: document.getElementById("worklogIssueKey"),
  worklogStarted: document.getElementById("worklogStarted"),
  worklogTimeSpent: document.getElementById("worklogTimeSpent"),
  worklogComment: document.getElementById("worklogComment"),
  useLastIssue: document.getElementById("useLastIssue"),
  addWorklog: document.getElementById("addWorklog"),
  clearWorklog: document.getElementById("clearWorklog"),
  authStatus: document.getElementById("authStatus"),
  status: document.getElementById("status"),
};

const SETTINGS_FIELDS = ["projectKey", "issueType"];
const DRAFT_FIELDS = ["summary", "description"];
const WORKLOG_FIELDS = [
  "worklogIssueKey",
  "worklogStarted",
  "worklogTimeSpent",
  "worklogComment",
];

let lastIssueKey = "";

function setStatus(message, type = "", linkUrl = "") {
  elements.status.className = `status ${type}`.trim();
  elements.status.textContent = "";

  if (message) {
    elements.status.append(document.createTextNode(message));
  }

  if (linkUrl) {
    const link = document.createElement("a");
    link.href = linkUrl;
    link.textContent = "열기";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.style.marginLeft = "8px";
    elements.status.append(link);
  }
}

function setAuthStatus(message, type = "") {
  elements.authStatus.className = `auth-status ${type}`.trim();
  elements.authStatus.textContent = message;
}

async function checkAuthStatus() {
  try {
    const response = await fetch(`${API_ROOT}/api/${API_VERSION}/myself`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      setAuthStatus("로그인 상태: 미로그인", "error");
      return;
    }

    const data = await response.json().catch(() => ({}));
    const displayName = data.displayName || data.name || "";
    const message = displayName
      ? `로그인 상태: 로그인됨 (${displayName})`
      : "로그인 상태: 로그인됨";
    setAuthStatus(message, "success");
  } catch (error) {
    setAuthStatus("로그인 상태 확인 실패", "error");
  }
}

function formatJiraDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetMins = pad(Math.abs(offsetMinutes) % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000${sign}${offsetHours}${offsetMins}`;
}

function formatLocalInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getWorklogDateTimeValue() {
  const value = elements.worklogStarted.value;
  if (!value) {
    return formatJiraDateTime(new Date());
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatJiraDateTime(new Date());
  }
  return formatJiraDateTime(date);
}

function getFormValues() {
  return {
    projectKey: elements.projectKey.value.trim(),
    issueType: elements.issueType.value.trim(),
    summary: elements.summary.value.trim(),
    description: elements.description.value.trim(),
  };
}

function toAdf(text) {
  if (!text) {
    return null;
  }

  const paragraphs = text.split(/\n/).map((line) => {
    const paragraph = { type: "paragraph" };
    if (line.trim()) {
      paragraph.content = [{ type: "text", text: line }];
    }
    return paragraph;
  });

  return {
    type: "doc",
    version: 1,
    content: paragraphs,
  };
}

function buildPayload(values) {
  const fields = {
    project: { key: values.projectKey },
    summary: values.summary,
    issuetype: { name: values.issueType },
  };

  if (values.description) {
    if (API_VERSION === "3") {
      fields.description = toAdf(values.description);
    } else {
      fields.description = values.description;
    }
  }

  return { fields };
}

function buildWorklogPayload(values) {
  const payload = {
    timeSpent: values.timeSpent,
    started: values.started,
  };

  if (values.comment) {
    payload.comment = API_VERSION === "3"
      ? toAdf(values.comment)
      : values.comment;
  }

  return payload;
}

function validate(values) {
  if (!values.projectKey) {
    return "프로젝트 키를 입력해주세요.";
  }
  if (!values.issueType) {
    return "이슈 타입을 입력해주세요.";
  }
  if (!values.summary) {
    return "요약을 입력해주세요.";
  }
  return "";
}

function validateWorklog(values) {
  if (!values.issueKey) {
    return "이슈 키를 입력해주세요.";
  }
  if (!values.timeSpent) {
    return "소요 시간을 입력해주세요.";
  }
  return "";
}

function setActiveTab(tabName) {
  const isIssue = tabName === "issue";
  elements.tabIssue.classList.toggle("active", isIssue);
  elements.tabIssue.setAttribute("aria-selected", String(isIssue));
  elements.panelIssue.classList.toggle("hidden", !isIssue);

  elements.tabWorklog.classList.toggle("active", !isIssue);
  elements.tabWorklog.setAttribute("aria-selected", String(!isIssue));
  elements.panelWorklog.classList.toggle("hidden", isIssue);
}

async function loadFromStorage() {
  const result = await storage.get({
    settings: {
      projectKey: "",
      issueType: "",
    },
    draft: {
      summary: "",
      description: "",
    },
    worklogDraft: {
      worklogIssueKey: "",
      worklogStarted: "",
      worklogTimeSpent: "",
      worklogComment: "",
    },
    lastIssueKey: "",
    activeTab: "issue",
  });

  SETTINGS_FIELDS.forEach((field) => {
    elements[field].value = result.settings[field] || "";
  });
  DRAFT_FIELDS.forEach((field) => {
    elements[field].value = result.draft[field] || "";
  });

  WORKLOG_FIELDS.forEach((field) => {
    elements[field].value = result.worklogDraft[field] || "";
  });

  if (!elements.worklogStarted.value) {
    elements.worklogStarted.value = formatLocalInputValue(new Date());
  }

  lastIssueKey = result.lastIssueKey || "";
  setActiveTab(result.activeTab || "issue");
}

async function saveSettings() {
  const settings = {};
  SETTINGS_FIELDS.forEach((field) => {
    settings[field] = elements[field].value.trim();
  });
  await storage.set({ settings });
}

async function saveDraft() {
  const draft = {};
  DRAFT_FIELDS.forEach((field) => {
    draft[field] = elements[field].value.trim();
  });
  await storage.set({ draft });
}

async function saveWorklogDraft() {
  const worklogDraft = {};
  WORKLOG_FIELDS.forEach((field) => {
    worklogDraft[field] = elements[field].value.trim();
  });
  await storage.set({ worklogDraft });
}

async function saveActiveTab(tabName) {
  await storage.set({ activeTab: tabName });
}

async function handleUseTab() {
  setStatus("", "");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    setStatus("현재 탭 정보를 가져올 수 없습니다.", "error");
    return;
  }

  if (!elements.summary.value.trim()) {
    elements.summary.value = tab.title || "";
  }

  if (tab.url) {
    const current = elements.description.value.trim();
    const suffix = `URL: ${tab.url}`;
    elements.description.value = current ? `${current}\n\n${suffix}` : suffix;
  }

  await saveDraft();
}

async function handleClear() {
  elements.summary.value = "";
  elements.description.value = "";
  await saveDraft();
  setStatus("입력이 초기화되었습니다.", "success");
}

async function handleUseLastIssue() {
  if (lastIssueKey) {
    elements.worklogIssueKey.value = lastIssueKey;
    await saveWorklogDraft();
  } else {
    setStatus("저장된 이슈 키가 없습니다.", "error");
  }
}

async function handleClearWorklog() {
  elements.worklogIssueKey.value = "";
  elements.worklogStarted.value = "";
  elements.worklogTimeSpent.value = "";
  elements.worklogComment.value = "";
  await saveWorklogDraft();
  setStatus("입력이 초기화되었습니다.", "success");
}

async function handleCreate() {
  setStatus("등록 중...", "loading");
  const values = getFormValues();
  const error = validate(values);

  if (error) {
    setStatus(error, "error");
    return;
  }

  await saveSettings();

  const payload = buildPayload(values);
  const url = `${API_ROOT}/api/${API_VERSION}/issue`;

  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = data.errorMessages?.join(", ") || "등록에 실패했습니다.";
      const fieldErrors = data.errors
        ? Object.values(data.errors).join(", ")
        : "";
      setStatus(
        [errorMessage, fieldErrors].filter(Boolean).join(" "),
        "error"
      );
      return;
    }

    const issueKey = data.key;
    const browseUrl = issueKey
      ? "https://jira.foodtechkorea.com/browse/" + issueKey
      : "";

    elements.summary.value = "";
    elements.description.value = "";
    await saveDraft();

    if (issueKey) {
      lastIssueKey = issueKey;
      await storage.set({ lastIssueKey: issueKey });
      if (!elements.worklogIssueKey.value.trim()) {
        elements.worklogIssueKey.value = issueKey;
        await saveWorklogDraft();
      }
    }

    setStatus(
      issueKey ? `등록 완료: ${issueKey}` : "등록 완료",
      "success",
      browseUrl
    );
  } catch (error) {
    setStatus("네트워크 오류가 발생했습니다.", "error");
  }
}

async function handleAddWorklog() {
  setStatus("Worklog 저장 중...", "loading");
  const values = {
    issueKey: elements.worklogIssueKey.value.trim(),
    timeSpent: elements.worklogTimeSpent.value.trim(),
    started: getWorklogDateTimeValue(),
    comment: elements.worklogComment.value.trim(),
  };
  const error = validateWorklog(values);

  if (error) {
    setStatus(error, "error");
    return;
  }

  await saveSettings();

  const payload = buildWorklogPayload(values);
  const url = `${API_ROOT}/api/${API_VERSION}/issue/${encodeURIComponent(values.issueKey)}/worklog`;

  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = data.errorMessages?.join(", ") || "Worklog 저장에 실패했습니다.";
      const fieldErrors = data.errors
        ? Object.values(data.errors).join(", ")
        : "";
      setStatus(
        [errorMessage, fieldErrors].filter(Boolean).join(" "),
        "error"
      );
      return;
    }

    lastIssueKey = values.issueKey;
    await storage.set({ lastIssueKey });

    elements.worklogTimeSpent.value = "";
    elements.worklogComment.value = "";
    await saveWorklogDraft();

    setStatus("Worklog 저장 완료", "success");
  } catch (error) {
    setStatus("네트워크 오류가 발생했습니다.", "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadFromStorage();
  await checkAuthStatus();

  SETTINGS_FIELDS.forEach((field) => {
    elements[field].addEventListener("input", saveSettings);
    elements[field].addEventListener("change", saveSettings);
    elements[field].addEventListener("blur", saveSettings);
  });

  DRAFT_FIELDS.forEach((field) => {
    elements[field].addEventListener("input", saveDraft);
  });

  WORKLOG_FIELDS.forEach((field) => {
    elements[field].addEventListener("input", saveWorklogDraft);
  });

  elements.useTab.addEventListener("click", handleUseTab);
  elements.clear.addEventListener("click", handleClear);
  elements.create.addEventListener("click", handleCreate);
  elements.useLastIssue.addEventListener("click", handleUseLastIssue);
  elements.clearWorklog.addEventListener("click", handleClearWorklog);
  elements.addWorklog.addEventListener("click", handleAddWorklog);

  elements.tabIssue.addEventListener("click", async () => {
    setActiveTab("issue");
    await saveActiveTab("issue");
  });
  elements.tabWorklog.addEventListener("click", async () => {
    setActiveTab("worklog");
    await saveActiveTab("worklog");
  });
});
