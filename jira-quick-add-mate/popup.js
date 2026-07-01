const storage = chrome.storage.local;
const API_ROOT = "https://jira.foodtechkorea.com/rest";
const API_VERSION = "2";
const GOOGLE_CLIENT_ID = "114426039511-29s70ph8lbdkr87g4urdqtmt7gdk40qe.apps.googleusercontent.com";
// const GOOGLE_CLIENT_ID = "1013698314494-ebkt0s9ht63snhhcpgevifj9s9dpmr4m.apps.googleusercontent.com"; // DEV
const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_KEY = "googleAuth";

const elements = {
  projectKey: document.getElementById("projectKey"),
  projectKeyList: document.getElementById("projectKeyList"),
  issueType: document.getElementById("issueType"),
  tabIssue: document.getElementById("tab-issue"),
  tabWorklog: document.getElementById("tab-worklog"),
  panelIssue: document.getElementById("panel-issue"),
  panelWorklog: document.getElementById("panel-worklog"),
  summary: document.getElementById("summary"),
  description: document.getElementById("description"),
  create: document.getElementById("create"),
  clear: document.getElementById("clear"),
  parentIssueRow: document.getElementById("parentIssueRow"),
  parentIssueKey: document.getElementById("parentIssueKey"),
  componentRow: document.getElementById("componentRow"),
  component: document.getElementById("component"),
  worklogIssueKey: document.getElementById("worklogIssueKey"),
  worklogStarted: document.getElementById("worklogStarted"),
  worklogTimeSpent: document.getElementById("worklogTimeSpent"),
  worklogComment: document.getElementById("worklogComment"),
  useLastIssue: document.getElementById("useLastIssue"),
  calendarDate: document.getElementById("calendarDate"),
  calendarRange: document.getElementById("calendarRange"),
  googleLogin: document.getElementById("googleLogin"),
  loadMeetings: document.getElementById("loadMeetings"),
  calendarStatus: document.getElementById("calendarStatus"),
  addWorklog: document.getElementById("addWorklog"),
  addWorklogsFromCalendar: document.getElementById("addWorklogsFromCalendar"),
  loadedMeetingsCount: document.getElementById("loadedMeetingsCount"),
  clearWorklog: document.getElementById("clearWorklog"),
  authStatus: document.getElementById("authStatus"),
  status: document.getElementById("status"),
  tabMyIssues: document.getElementById("tab-my-issues"),
  panelMyIssues: document.getElementById("panel-my-issues"),
  loadMyInProgressIssues: document.getElementById("loadMyInProgressIssues"),
  myIssuesStatus: document.getElementById("myIssuesStatus"),
  myIssuesList: document.getElementById("myIssuesList"),
  myIssuesStatusFilter: document.getElementById("myIssuesStatusFilter"),
  myIssuesProjectFilter: document.getElementById("myIssuesProjectFilter"),
  myIssuesProjectFilterRow: document.getElementById("myIssuesProjectFilterRow"),
  myIssuesPaging: document.getElementById("myIssuesPaging"),
  myIssuesPageInfo: document.getElementById("myIssuesPageInfo"),
  myIssuesPrev: document.getElementById("myIssuesPrev"),
  myIssuesNext: document.getElementById("myIssuesNext"),
};

const SETTINGS_FIELDS = ["projectKey", "issueType"];
const DEFAULT_PROJECT_KEYS = ["DEVP2026", "FTPM", "DBMS", "DEVOPS"];
let projectKeys = [...DEFAULT_PROJECT_KEYS];
// 구성요소(components)는 프로젝트별로 조회해, 구성요소가 있는 프로젝트에서만 노출한다.
const componentsCache = {}; // projectKey(대문자) -> 구성요소 배열
let loadedComponentsProject = "";
const DRAFT_FIELDS = ["summary", "description", "parentIssueKey"];
const WORKLOG_FIELDS = [
  "worklogIssueKey",
  "worklogStarted",
  "worklogTimeSpent",
  "worklogComment",
  "calendarDate",
  "calendarRange",
];

let lastIssueKey = "";
let currentUserId = "";
const MY_ISSUES_PAGE_SIZE = 10;
/** 캘린더에서 불러온 회의 목록 (회의별 Worklog 저장용). 각 항목: { start: Date, durationMin: number, title: string } */
let loadedCalendarMeetings = [];
let myIssuesTotal = 0;
let myIssuesCurrentPage = 0;

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

function setCalendarStatus(message, type = "") {
  elements.calendarStatus.className = `calendar-status ${type}`.trim();
  elements.calendarStatus.textContent = message;
}

function updateLoadedMeetingsUI() {
  const count = loadedCalendarMeetings.length;
  if (elements.loadedMeetingsCount) {
    elements.loadedMeetingsCount.textContent = count ? `${count}개 회의 불러옴` : "";
  }
  if (elements.addWorklogsFromCalendar) {
    elements.addWorklogsFromCalendar.disabled = count === 0;
  }
}

function normalizeErrorMessage(error) {
  if (!error) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error.message) {
    return error.message;
  }
  return String(error);
}

function parseAuthFragment(redirectUrl) {
  const hashIndex = redirectUrl.indexOf("#");
  if (hashIndex === -1) {
    return {};
  }
  const fragment = new URLSearchParams(redirectUrl.slice(hashIndex + 1));
  const accessToken = fragment.get("access_token") || "";
  const expiresIn = Number(fragment.get("expires_in"));
  return { accessToken, expiresIn };
}

function getRedirectUrl() {
  return chrome.identity.getRedirectURL("oauth2");
}

async function readStoredGoogleToken() {
  const result = await storage.get({ [GOOGLE_TOKEN_KEY]: null });
  return result[GOOGLE_TOKEN_KEY];
}

async function saveGoogleToken(accessToken, expiresIn) {
  const expiryMs = Date.now() + (Number(expiresIn) || 3600) * 1000;
  await storage.set({
    [GOOGLE_TOKEN_KEY]: {
      accessToken,
      expiryMs,
    },
  });
}

function setGoogleUiEnabled(enabled) {
  elements.googleLogin.disabled = !enabled;
  elements.loadMeetings.disabled = !enabled;
}

function setGoogleLoginButtonVisible(visible) {
  elements.googleLogin.classList.toggle("hidden", !visible);
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts = [];
  if (hours) {
    parts.push(`${hours}h`);
  }
  if (mins || !parts.length) {
    parts.push(`${mins}m`);
  }
  return parts.join(" ");
}

function parseTimeRange(value) {
  const match = value
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const startHour = Number(match[1]);
  const startMin = Number(match[2]);
  const endHour = Number(match[3]);
  const endMin = Number(match[4]);
  if (
    Number.isNaN(startHour)
    || Number.isNaN(startMin)
    || Number.isNaN(endHour)
    || Number.isNaN(endMin)
    || startHour > 23
    || endHour > 23
    || startMin > 59
    || endMin > 59
  ) {
    return null;
  }
  return { startHour, startMin, endHour, endMin };
}

function buildDateRange(dateText, rangeText) {
  const parsed = parseTimeRange(rangeText || "");
  if (!parsed) {
    return null;
  }
  if (!dateText) {
    return null;
  }
  const [year, month, day] = dateText.split("-").map(Number);
  const start = new Date(year, (month || 1) - 1, day || 1, parsed.startHour, parsed.startMin, 0, 0);
  const end = new Date(year, (month || 1) - 1, day || 1, parsed.endHour, parsed.endMin, 0, 0);
  if (end <= start) {
    return null;
  }
  return { start, end };
}

function ensureGoogleClientConfigured() {
  return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.includes(".apps.googleusercontent.com")
    && !GOOGLE_CLIENT_ID.startsWith("YOUR_");
}

async function getGoogleToken(interactive, timeoutMs = 20000) {
  const stored = await readStoredGoogleToken();
  if (stored?.accessToken && stored.expiryMs && stored.expiryMs > Date.now()) {
    return stored.accessToken;
  }

  if (!interactive) {
    throw new Error("로그인이 필요합니다.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error("로그인 창 응답 시간 초과"));
    }, timeoutMs);

    const redirectUrl = getRedirectUrl();
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUrl,
      response_type: "token",
      scope: GOOGLE_SCOPES.join(" "),
      include_granted_scopes: "true",
      prompt: "consent",
      hl: "ko",
    });

    const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, async (responseUrl) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError || !responseUrl) {
        reject(chrome.runtime.lastError || new Error("인증 응답이 없습니다."));
        return;
      }
      const { accessToken, expiresIn } = parseAuthFragment(responseUrl);
      if (!accessToken) {
        reject(new Error("액세스 토큰을 받지 못했습니다."));
        return;
      }
      await saveGoogleToken(accessToken, expiresIn);
      resolve(accessToken);
    });
  });
}

async function checkGoogleAuthStatus() {
  if (!ensureGoogleClientConfigured()) {
    setCalendarStatus("Google OAuth 클라이언트 ID 설정 필요", "error");
    setGoogleUiEnabled(false);
    setGoogleLoginButtonVisible(true);
    return;
  }
  setGoogleUiEnabled(true);
  try {
    await getGoogleToken(false);
    setCalendarStatus("Google 로그인 상태: 로그인됨", "success");
    setGoogleLoginButtonVisible(false);
  } catch (error) {
    setCalendarStatus("Google 로그인 상태: 미로그인", "error");
    setGoogleLoginButtonVisible(true);
  }
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
      const isUnauthorized = response.status === 401 || response.status === 403;
      setAuthStatus(
        isUnauthorized
          ? "로그인 상태: 미로그인 (세션 만료)"
          : `로그인 상태 확인 실패 (${response.status})`,
        "error"
      );
      return;
    }

    const data = await response.json().catch(() => ({}));
    currentUserId = data.accountId || data.name || data.key || "";
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

function datetimeLocalToJiraStarted(value) {
  if (!value) {
    return formatJiraDateTime(new Date());
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? formatJiraDateTime(new Date())
    : formatJiraDateTime(date);
}

function syncWorklogStartedDate(dateText, rangeText = "") {
  if (!dateText) {
    return;
  }
  const current = elements.worklogStarted.value;
  let hours = "09";
  let minutes = "00";
  if (current) {
    const timePart = current.split("T")[1];
    if (timePart) {
      const [h, m] = timePart.split(":");
      if (h && m) {
        hours = h;
        minutes = m;
      }
    }
  } else {
    const parsedRange = parseTimeRange(rangeText || elements.calendarRange.value || "");
    if (parsedRange) {
      hours = String(parsedRange.startHour).padStart(2, "0");
      minutes = String(parsedRange.startMin).padStart(2, "0");
    }
  }
  elements.worklogStarted.value = `${dateText}T${hours}:${minutes}`;
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
    parentIssueKey: elements.parentIssueKey.value.trim(),
    component: elements.component.value.trim(),
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

  if (currentUserId) {
    fields.assignee = API_VERSION === "3"
      ? { accountId: currentUserId }
      : { name: currentUserId };
  }

  if (values.issueType === "부작업" && values.parentIssueKey) {
    fields.parent = { key: values.parentIssueKey };
  }

  if (values.component) {
    fields.components = [{ id: values.component }];
  }

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
  if (values.issueType === "부작업" && !values.parentIssueKey) {
    return "부작업은 상위 이슈 키가 필요합니다.";
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
  const isWorklog = tabName === "worklog";
  const isMyIssues = tabName === "my-issues";

  elements.tabIssue.classList.toggle("active", isIssue);
  elements.tabIssue.setAttribute("aria-selected", String(isIssue));
  elements.panelIssue.classList.toggle("hidden", !isIssue);

  elements.tabWorklog.classList.toggle("active", isWorklog);
  elements.tabWorklog.setAttribute("aria-selected", String(isWorklog));
  elements.panelWorklog.classList.toggle("hidden", !isWorklog);

  elements.tabMyIssues.classList.toggle("active", isMyIssues);
  elements.tabMyIssues.setAttribute("aria-selected", String(isMyIssues));
  elements.panelMyIssues.classList.toggle("hidden", !isMyIssues);
}

function updateParentIssueVisibility() {
  const isSubTask = elements.issueType.value === "부작업";
  elements.parentIssueRow.style.display = isSubTask ? "block" : "none";
}

function renderComponentOptions(components, selectedId) {
  const select = elements.component;
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "구성요소 선택";
  select.appendChild(placeholder);
  components.forEach((component) => {
    const option = document.createElement("option");
    option.value = component.id;
    option.textContent = component.name;
    select.appendChild(option);
  });
  if (selectedId) {
    select.value = selectedId;
  }
}

// 구성요소가 있으면 필드를 표시하고, 없으면 숨긴다.
function applyComponents(projectKey, components) {
  // 조회 도중 사용자가 다른 프로젝트 키로 바꿨으면 무시
  if (loadedComponentsProject !== projectKey) {
    return;
  }
  if (components.length > 0) {
    renderComponentOptions(components);
    elements.componentRow.classList.remove("hidden");
  } else {
    elements.component.value = "";
    elements.componentRow.classList.add("hidden");
  }
}

async function loadComponents(projectKey) {
  const key = (projectKey || "").trim().toUpperCase();
  if (componentsCache[key]) {
    applyComponents(key, componentsCache[key]);
    return;
  }
  try {
    const url = `${API_ROOT}/api/${API_VERSION}/project/${encodeURIComponent(key)}/components`;
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { "Accept": "application/json" },
    });
    if (!response.ok) {
      // 존재하지 않는 키 등은 조용히 숨김 처리
      applyComponents(key, []);
      return;
    }
    const data = await response.json().catch(() => []);
    const components = Array.isArray(data) ? data : [];
    componentsCache[key] = components;
    applyComponents(key, components);
  } catch (error) {
    console.error("구성요소 조회 실패:", error);
    applyComponents(key, []);
  }
}

async function updateComponentVisibility() {
  const key = elements.projectKey.value.trim().toUpperCase();

  if (!key) {
    elements.component.value = "";
    elements.componentRow.classList.add("hidden");
    loadedComponentsProject = "";
    return;
  }

  if (loadedComponentsProject !== key) {
    loadedComponentsProject = key;
    await loadComponents(key);
  }
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
      calendarDate: "",
      calendarRange: "09:30 ~ 18:30",
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

  updateParentIssueVisibility();
  updateComponentVisibility();

  WORKLOG_FIELDS.forEach((field) => {
    elements[field].value = result.worklogDraft[field] || "";
  });

  if (!elements.worklogStarted.value) {
    elements.worklogStarted.value = formatLocalInputValue(new Date());
  }
  if (!elements.calendarDate.value) {
    elements.calendarDate.value = formatLocalInputValue(new Date()).split("T")[0];
  }
  syncWorklogStartedDate(elements.calendarDate.value);

  lastIssueKey = result.lastIssueKey || "";
  setActiveTab(result.activeTab || "issue");
  updateLoadedMeetingsUI();
}

async function saveSettings() {
  const settings = {};
  SETTINGS_FIELDS.forEach((field) => {
    settings[field] = elements[field].value.trim();
  });
  await storage.set({ settings });
}

function renderProjectKeyOptions() {
  elements.projectKeyList.innerHTML = "";
  projectKeys.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    elements.projectKeyList.appendChild(option);
  });
}

async function loadProjectKeys() {
  const result = await storage.get({ projectKeys: DEFAULT_PROJECT_KEYS });
  const stored = Array.isArray(result.projectKeys) ? result.projectKeys : [];
  // 기본 키를 항상 포함하고, 저장된 키와 합쳐 중복 제거
  projectKeys = [...new Set([...DEFAULT_PROJECT_KEYS, ...stored])].filter(Boolean);
  renderProjectKeyOptions();
}

async function rememberProjectKey(rawKey) {
  const key = (rawKey || "").trim().toUpperCase();
  if (!key || projectKeys.includes(key)) {
    return;
  }
  projectKeys.push(key);
  renderProjectKeyOptions();
  await storage.set({ projectKeys });
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
  elements.calendarDate.value = formatLocalInputValue(new Date()).split("T")[0];
  elements.calendarRange.value = "09:30 ~ 18:30";
  loadedCalendarMeetings = [];
  updateLoadedMeetingsUI();
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
    await rememberProjectKey(values.projectKey);

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

async function handleAddWorklogsFromCalendar() {
  const issueKey = elements.worklogIssueKey.value.trim();
  if (!issueKey) {
    setStatus("이슈 키를 입력해주세요.", "error");
    return;
  }
  if (!loadedCalendarMeetings.length) {
    setStatus("캘린더에서 회의를 먼저 불러와주세요.", "error");
    return;
  }

  setStatus("회의별 Worklog 저장 중...", "loading");
  let successCount = 0;
  let lastError = null;
  for (const meeting of loadedCalendarMeetings) {
    try {
      await postWorklog(issueKey, {
        started: formatJiraDateTime(meeting.start),
        timeSpent: formatDuration(meeting.durationMin),
        comment: meeting.title,
      });
      successCount += 1;
    } catch (err) {
      lastError = err;
      setStatus(`${successCount}개 저장 후 오류: ${normalizeErrorMessage(err)}`, "error");
      return;
    }
  }

  lastIssueKey = issueKey;
  await storage.set({ lastIssueKey });
  loadedCalendarMeetings = [];
  updateLoadedMeetingsUI();
  elements.worklogTimeSpent.value = "";
  elements.worklogComment.value = "";
  await saveWorklogDraft();
  setStatus(`${successCount}개 Worklog 저장 완료`, "success");
}

async function handleGoogleLogin() {
  if (!ensureGoogleClientConfigured()) {
    setCalendarStatus("Google OAuth 클라이언트 ID 설정 필요", "error");
    return;
  }
  setGoogleUiEnabled(true);
  setCalendarStatus("Google 로그인 중... (팝업을 닫지 마세요)", "loading");
  try {
    await getGoogleToken(true);
    setCalendarStatus("Google 로그인 상태: 로그인됨", "success");
    setGoogleLoginButtonVisible(false);
  } catch (error) {
    const message = normalizeErrorMessage(error);
    setCalendarStatus(
      message ? `Google 로그인 실패: ${message}` : "Google 로그인 실패",
      "error"
    );
  }
}

const JIRA_BROWSE_BASE = "https://jira.foodtechkorea.com/browse";

function setMyIssuesStatus(message, type = "") {
  elements.myIssuesStatus.className = `calendar-status ${type}`.trim();
  elements.myIssuesStatus.textContent = message;
}

async function postWorklog(issueKey, { started, timeSpent, comment }) {
  const payload = buildWorklogPayload({ started, timeSpent, comment });
  const url = `${API_ROOT}/api/${API_VERSION}/issue/${encodeURIComponent(issueKey)}/worklog`;
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data.errorMessages?.join(", ") || data.errors
      ? Object.values(data.errors).join(", ")
      : `저장 실패 (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

function getMyIssuesStatusFilter() {
  const value = elements.myIssuesStatusFilter?.value?.trim();
  return value || "진행 중";
}

function escapeStatusForJql(status) {
  return status.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getMyIssuesProjectFilter() {
  return elements.myIssuesProjectFilter?.value?.trim() || "";
}

const myIssuesProjectOptionsCache = {}; // 상태 텍스트 -> [[key, name], ...]

// 현재 상태 조건으로, 내게 할당된 이슈들의 프로젝트만 추려 드롭다운 옵션을 채운다.
// (현재 페이지가 아니라 해당 상태의 내 이슈 전체 기준이라, 페이지를 넘겨도 옵션이 줄지 않는다.)
async function loadMyIssuesProjectOptions() {
  const statusText = getMyIssuesStatusFilter();
  let projects = myIssuesProjectOptionsCache[statusText];

  if (!projects) {
    try {
      const escaped = escapeStatusForJql(statusText);
      const params = new URLSearchParams({
        jql: `assignee = currentUser() AND status = "${escaped}"`,
        fields: "project",
        maxResults: "200",
        startAt: "0",
      });
      const url = `${API_ROOT}/api/${API_VERSION}/search?${params.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        return;
      }
      const data = await response.json().catch(() => ({}));
      const issues = data.issues || [];
      const projectMap = new Map();
      issues.forEach((issue) => {
        const project = issue.fields?.project;
        if (project?.key && !projectMap.has(project.key)) {
          projectMap.set(project.key, project.name || project.key);
        }
      });
      projects = [...projectMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      myIssuesProjectOptionsCache[statusText] = projects;
    } catch (error) {
      console.error("내 이슈 프로젝트 목록 조회 실패:", error);
      return;
    }
  }

  const select = elements.myIssuesProjectFilter;
  const current = select.value;
  const keys = projects.map(([key]) => key);
  select.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "전체";
  select.appendChild(allOption);
  projects.forEach(([key, name]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = name && name !== key ? `${key} - ${name}` : key;
    select.appendChild(option);
  });
  // 이전 선택이 현재 상태에서도 유효하면 유지, 아니면 전체로
  select.value = keys.includes(current) ? current : "";

  elements.myIssuesProjectFilterRow.classList.remove("hidden");
}

async function fetchMyInProgressIssues(startAt = 0) {
  const statusText = getMyIssuesStatusFilter();
  const escaped = escapeStatusForJql(statusText);
  let jql = `assignee = currentUser() AND status = "${escaped}"`;
  const projectKey = getMyIssuesProjectFilter();
  if (projectKey) {
    jql += ` AND project = "${escapeStatusForJql(projectKey)}"`;
  }
  const params = new URLSearchParams({
    jql,
    fields: "summary,status",
    maxResults: String(MY_ISSUES_PAGE_SIZE),
    startAt: String(startAt),
  });
  const url = `${API_ROOT}/api/${API_VERSION}/search?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const msg = data.errorMessages?.join(", ") || `조회 실패 (${response.status})`;
    throw new Error(msg);
  }

  const data = await response.json();
  return {
    issues: data.issues || [],
    total: data.total ?? 0,
  };
}

function updateMyIssuesPagingUI() {
  if (!elements.myIssuesPaging || !elements.myIssuesPageInfo) {
    return;
  }
  if (myIssuesTotal <= MY_ISSUES_PAGE_SIZE) {
    elements.myIssuesPaging.classList.add("hidden");
    return;
  }
  elements.myIssuesPaging.classList.remove("hidden");
  const from = myIssuesCurrentPage * MY_ISSUES_PAGE_SIZE + 1;
  const to = Math.min((myIssuesCurrentPage + 1) * MY_ISSUES_PAGE_SIZE, myIssuesTotal);
  const totalPages = Math.ceil(myIssuesTotal / MY_ISSUES_PAGE_SIZE);
  elements.myIssuesPageInfo.textContent = `${from}-${to} / ${myIssuesTotal}건 (${myIssuesCurrentPage + 1} / ${totalPages}페이지)`;
  if (elements.myIssuesPrev) {
    elements.myIssuesPrev.disabled = myIssuesCurrentPage <= 0;
  }
  if (elements.myIssuesNext) {
    elements.myIssuesNext.disabled = (myIssuesCurrentPage + 1) * MY_ISSUES_PAGE_SIZE >= myIssuesTotal;
  }
}

function renderMyIssuesList(issues) {
  elements.myIssuesList.innerHTML = "";

  if (!issues.length) {
    const li = document.createElement("li");
    li.className = "issue-list-empty";
    li.textContent = "해당 상태의 이슈가 없습니다.";
    elements.myIssuesList.appendChild(li);
    return;
  }

  for (const issue of issues) {
    const key = issue.key || "";
    const summary = issue.fields?.summary || "(제목 없음)";
    const href = key ? `${JIRA_BROWSE_BASE}/${key}` : "";

    const li = document.createElement("li");
    li.className = "issue-list-item";
    li.dataset.issueKey = key;

    const head = document.createElement("div");
    head.className = "issue-list-item-head";

    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "issue-list-item-link";
    link.textContent = key ? `${key}: ${summary}` : summary;

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "secondary issue-worklog-toggle";
    toggleBtn.textContent = "작업로그";

    head.appendChild(link);
    head.appendChild(toggleBtn);
    li.appendChild(head);

    const formWrap = document.createElement("div");
    formWrap.className = "issue-worklog-form hidden";

    const startedLabel = document.createElement("label");
    startedLabel.textContent = "시작 시각";
    const startedInput = document.createElement("input");
    startedInput.type = "datetime-local";
    startedInput.className = "issue-worklog-started";
    startedInput.value = formatLocalInputValue(new Date());
    startedLabel.appendChild(startedInput);

    const timeSpentLabel = document.createElement("label");
    timeSpentLabel.textContent = "소요 시간";
    const timeSpentInput = document.createElement("input");
    timeSpentInput.type = "text";
    timeSpentInput.className = "issue-worklog-time";
    timeSpentInput.placeholder = "1h 30m";
    timeSpentLabel.appendChild(timeSpentInput);

    const commentLabel = document.createElement("label");
    commentLabel.textContent = "설명";
    const commentInput = document.createElement("textarea");
    commentInput.className = "issue-worklog-comment";
    commentInput.rows = 2;
    commentInput.placeholder = "작업 내용";
    commentLabel.appendChild(commentInput);

    const formActions = document.createElement("div");
    formActions.className = "actions issue-worklog-actions";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "primary";
    saveBtn.textContent = "저장";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary";
    cancelBtn.textContent = "취소";
    formActions.appendChild(saveBtn);
    formActions.appendChild(cancelBtn);

    const statusEl = document.createElement("p");
    statusEl.className = "issue-list-item-status";

    formWrap.appendChild(startedLabel);
    formWrap.appendChild(timeSpentLabel);
    formWrap.appendChild(commentLabel);
    formWrap.appendChild(formActions);
    formWrap.appendChild(statusEl);
    li.appendChild(formWrap);

    toggleBtn.addEventListener("click", () => {
      const isHidden = formWrap.classList.toggle("hidden");
      if (!isHidden) {
        startedInput.value = formatLocalInputValue(new Date());
        statusEl.textContent = "";
        statusEl.className = "issue-list-item-status";
      }
    });

    cancelBtn.addEventListener("click", () => {
      formWrap.classList.add("hidden");
      statusEl.textContent = "";
      statusEl.className = "issue-list-item-status";
    });

    saveBtn.addEventListener("click", async () => {
      const timeSpent = timeSpentInput.value.trim();
      if (!timeSpent) {
        statusEl.textContent = "소요 시간을 입력하세요.";
        statusEl.className = "issue-list-item-status error";
        return;
      }
      statusEl.textContent = "저장 중...";
      statusEl.className = "issue-list-item-status loading";
      saveBtn.disabled = true;
      try {
        await postWorklog(key, {
          started: datetimeLocalToJiraStarted(startedInput.value),
          timeSpent,
          comment: commentInput.value.trim(),
        });
        statusEl.textContent = "저장되었습니다.";
        statusEl.className = "issue-list-item-status success";
        timeSpentInput.value = "";
        commentInput.value = "";
        lastIssueKey = key;
        await storage.set({ lastIssueKey: key });
      } catch (err) {
        statusEl.textContent = normalizeErrorMessage(err) || "저장에 실패했습니다.";
        statusEl.className = "issue-list-item-status error";
      } finally {
        saveBtn.disabled = false;
      }
    });

    elements.myIssuesList.appendChild(li);
  }
}

async function loadMyIssuesPage(pageIndex) {
  const startAt = pageIndex * MY_ISSUES_PAGE_SIZE;
  setMyIssuesStatus("불러오는 중...", "loading");
  elements.myIssuesList.innerHTML = "";
  if (elements.myIssuesPaging) {
    elements.myIssuesPaging.classList.add("hidden");
  }

  try {
    const { issues, total } = await fetchMyInProgressIssues(startAt);
    myIssuesTotal = total;
    myIssuesCurrentPage = pageIndex;
    renderMyIssuesList(issues);
    updateMyIssuesPagingUI();
    setMyIssuesStatus(`총 ${total}건`, "success");
  } catch (error) {
    const message = normalizeErrorMessage(error);
    setMyIssuesStatus(message ? `조회 실패: ${message}` : "조회에 실패했습니다.", "error");
    renderMyIssuesList([]);
  }
}

async function handleLoadMyInProgressIssues() {
  // 프로젝트 드롭다운 옵션(내 이슈 전체 프로젝트)을 최초 1회 채운다.
  await loadMyIssuesProjectOptions();
  await loadMyIssuesPage(0);
}

function handleMyIssuesPrev() {
  if (myIssuesCurrentPage <= 0) return;
  loadMyIssuesPage(myIssuesCurrentPage - 1);
}

function handleMyIssuesNext() {
  if ((myIssuesCurrentPage + 1) * MY_ISSUES_PAGE_SIZE >= myIssuesTotal) return;
  loadMyIssuesPage(myIssuesCurrentPage + 1);
}

async function handleLoadMeetings() {
  if (!ensureGoogleClientConfigured()) {
    setCalendarStatus("Google OAuth 클라이언트 ID 설정 필요", "error");
    return;
  }
  const range = buildDateRange(elements.calendarDate.value, elements.calendarRange.value);
  if (!range) {
    setCalendarStatus("날짜/시간 범위를 확인해주세요. 예) 09:30 ~ 18:30", "error");
    return;
  }
  setCalendarStatus("회의를 불러오는 중...", "loading");
  try {
    const token = await getGoogleToken(true);
    const params = new URLSearchParams({
      timeMin: range.start.toISOString(),
      timeMax: range.end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
    });
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const detail = errorPayload.error?.message || errorPayload.error?.errors?.[0]?.message;
      const statusLine = response.status ? `(${response.status})` : "";
      setCalendarStatus(
        detail ? `캘린더 조회에 실패했습니다 ${statusLine}: ${detail}` : `캘린더 조회에 실패했습니다 ${statusLine}`,
        "error"
      );
      return;
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const meetings = items
      .filter((item) => item.start?.dateTime && item.end?.dateTime)
      .map((item) => {
        const start = new Date(item.start.dateTime);
        const end = new Date(item.end.dateTime);
        const durationMin = Math.max(0, Math.round((end - start) / 60000));
        const title = item.summary || "회의";
        const timeLabel = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`
          + `-${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
        return { start, title, durationMin, timeLabel };
      });

    loadedCalendarMeetings = meetings.map((m) => ({
      start: m.start,
      durationMin: m.durationMin,
      title: m.title,
    }));
    updateLoadedMeetingsUI();

    const rangeMinutes = Math.max(0, Math.round((range.end - range.start) / 60000));
    const totalMinutes = meetings.reduce((sum, meeting) => sum + meeting.durationMin, 0);
    const lines = meetings.map(
      (meeting) => `- ${meeting.timeLabel} ${meeting.title}`
    );
    elements.worklogComment.value = meetings.length
      ? `회의\n${lines.join("\n")}`
      : "회의없음";
    elements.worklogTimeSpent.value = meetings.length
      ? formatDuration(totalMinutes)
      : "8h";

    const start = range.start;
    const pad = (value) => String(value).padStart(2, "0");
    elements.worklogStarted.value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;

    await saveWorklogDraft();
    if (!meetings.length) {
      setCalendarStatus("해당 시간 범위에 회의가 없습니다.", "error");
    } else {
      setCalendarStatus("회의 정보를 입력했습니다. 아래에서 회의별로 Worklog를 저장할 수 있습니다.", "success");
    }
  } catch (error) {
    const message = normalizeErrorMessage(error);
    setCalendarStatus(
      message ? `Google 인증 또는 캘린더 조회 실패: ${message}` : "Google 인증 또는 캘린더 조회 실패",
      "error"
    );
  }
}

function registerEventListeners() {
  SETTINGS_FIELDS.forEach((field) => {
    elements[field].addEventListener("input", saveSettings);
    elements[field].addEventListener("change", saveSettings);
    elements[field].addEventListener("blur", saveSettings);
  });

  elements.projectKey.addEventListener("blur", () => {
    rememberProjectKey(elements.projectKey.value);
  });

  let componentDebounce;
  elements.projectKey.addEventListener("input", () => {
    clearTimeout(componentDebounce);
    componentDebounce = setTimeout(updateComponentVisibility, 400);
  });
  elements.projectKey.addEventListener("change", updateComponentVisibility);
  elements.projectKey.addEventListener("blur", updateComponentVisibility);

  // datalist는 입력값과 일치하는 옵션만 보여주므로, 값이 채워져 있으면
  // 전체 목록이 안 열린다. 포커스 시 잠시 비워 전체 목록을 노출하고,
  // 선택/입력 없이 벗어나면 이전 값을 복원한다.
  let projectKeyBeforeFocus = "";
  elements.projectKey.addEventListener("focus", () => {
    projectKeyBeforeFocus = elements.projectKey.value;
    if (projectKeyBeforeFocus) {
      elements.projectKey.value = "";
    }
  });
  elements.projectKey.addEventListener(
    "blur",
    () => {
      // 캡처 단계에서 먼저 실행되어, 복원된 값으로 저장/조회가 이뤄지게 한다.
      if (!elements.projectKey.value.trim() && projectKeyBeforeFocus) {
        elements.projectKey.value = projectKeyBeforeFocus;
      }
      projectKeyBeforeFocus = "";
    },
    true
  );

  DRAFT_FIELDS.forEach((field) => {
    elements[field].addEventListener("input", saveDraft);
  });

  WORKLOG_FIELDS.forEach((field) => {
    elements[field].addEventListener("input", saveWorklogDraft);
  });
  elements.calendarDate.addEventListener("change", async () => {
    syncWorklogStartedDate(elements.calendarDate.value, elements.calendarRange.value);
    await saveWorklogDraft();
  });
  elements.calendarRange.addEventListener("input", async () => {
    syncWorklogStartedDate(elements.calendarDate.value, elements.calendarRange.value);
    await saveWorklogDraft();
  });

  elements.clear.addEventListener("click", handleClear);
  elements.create.addEventListener("click", handleCreate);
  elements.useLastIssue.addEventListener("click", handleUseLastIssue);
  elements.clearWorklog.addEventListener("click", handleClearWorklog);
  elements.addWorklog.addEventListener("click", handleAddWorklog);
  if (elements.addWorklogsFromCalendar) {
    elements.addWorklogsFromCalendar.addEventListener("click", handleAddWorklogsFromCalendar);
  }
  elements.googleLogin.addEventListener("click", handleGoogleLogin);
  elements.loadMeetings.addEventListener("click", handleLoadMeetings);

  elements.issueType.addEventListener("change", () => {
    updateParentIssueVisibility();
    saveSettings();
  });

  elements.tabIssue.addEventListener("click", async () => {
    setActiveTab("issue");
    await saveActiveTab("issue");
  });
  elements.tabWorklog.addEventListener("click", async () => {
    setActiveTab("worklog");
    await saveActiveTab("worklog");
  });
  elements.tabMyIssues.addEventListener("click", async () => {
    setActiveTab("my-issues");
    await saveActiveTab("my-issues");
  });
  elements.loadMyInProgressIssues.addEventListener("click", handleLoadMyInProgressIssues);
  if (elements.myIssuesProjectFilter) {
    // 프로젝트를 바꾸면 해당 프로젝트만 Jira에서 다시 조회한다.
    elements.myIssuesProjectFilter.addEventListener("change", handleLoadMyInProgressIssues);
  }
  if (elements.myIssuesPrev) {
    elements.myIssuesPrev.addEventListener("click", handleMyIssuesPrev);
  }
  if (elements.myIssuesNext) {
    elements.myIssuesNext.addEventListener("click", handleMyIssuesNext);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // UI 인터랙션(탭 전환 등)은 네트워크/인증 초기화와 무관하게 항상 동작해야 하므로
  // 리스너를 먼저 등록한 뒤 비동기 초기화를 진행한다.
  registerEventListeners();

  try {
    await loadFromStorage();
    await loadProjectKeys();
  } catch (error) {
    console.error("초기화 중 오류:", error);
  }

  // 인증 확인은 실패해도 UI 동작에 영향을 주지 않도록 개별적으로 처리한다.
  checkAuthStatus().catch((error) => console.error("Jira 인증 확인 실패:", error));
  checkGoogleAuthStatus().catch((error) => console.error("Google 인증 확인 실패:", error));
});
