const storage = chrome.storage.local;
const API_ROOT = "https://jira.foodtechkorea.com/rest";
const API_VERSION = "2";
const GOOGLE_CLIENT_ID = "114426039511-29s70ph8lbdkr87g4urdqtmt7gdk40qe.apps.googleusercontent.com";
// const GOOGLE_CLIENT_ID = "1013698314494-ebkt0s9ht63snhhcpgevifj9s9dpmr4m.apps.googleusercontent.com"; // DEV
const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_KEY = "googleAuth";
const DAILY_TARGET_MINUTES = 480; // 평일 목표 worklog 시간(8h)

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
  issueExtraFields: document.getElementById("issueExtraFields"),
  issueWorklogStarted: document.getElementById("issueWorklogStarted"),
  issueWorklogTimeSpent: document.getElementById("issueWorklogTimeSpent"),
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
  loadedMeetingsCount: document.getElementById("loadedMeetingsCount"),
  loadedMeetingsList: document.getElementById("loadedMeetingsList"),
  tabWorklogOnce: document.getElementById("tab-worklog-once"),
  tabWorklogPerMeeting: document.getElementById("tab-worklog-per-meeting"),
  panelWorklogOnce: document.getElementById("panel-worklog-once"),
  panelWorklogPerMeeting: document.getElementById("panel-worklog-per-meeting"),
  clearWorklog: document.getElementById("clearWorklog"),
  authStatus: document.getElementById("authStatus"),
  status: document.getElementById("status"),
  appVersion: document.getElementById("appVersion"),
  tabMyIssues: document.getElementById("tab-my-issues"),
  panelMyIssues: document.getElementById("panel-my-issues"),
  tabMyIssuesList: document.getElementById("tab-my-issues-list"),
  tabMyIssuesMissing: document.getElementById("tab-my-issues-missing"),
  tabMyIssuesLongRunning: document.getElementById("tab-my-issues-long-running"),
  panelMyIssuesList: document.getElementById("panel-my-issues-list"),
  panelMyIssuesMissing: document.getElementById("panel-my-issues-missing"),
  panelMyIssuesLongRunning: document.getElementById("panel-my-issues-long-running"),
  loadMyInProgressIssues: document.getElementById("loadMyInProgressIssues"),
  myIssuesStatus: document.getElementById("myIssuesStatus"),
  myIssuesList: document.getElementById("myIssuesList"),
  myIssuesStatusFilter: document.getElementById("myIssuesStatusFilter"),
  resetMyIssuesStatusFilter: document.getElementById("resetMyIssuesStatusFilter"),
  myIssuesProjectFilter: document.getElementById("myIssuesProjectFilter"),
  myIssuesProjectFilterRow: document.getElementById("myIssuesProjectFilterRow"),
  myIssuesPaging: document.getElementById("myIssuesPaging"),
  myIssuesPageInfo: document.getElementById("myIssuesPageInfo"),
  myIssuesPrev: document.getElementById("myIssuesPrev"),
  myIssuesNext: document.getElementById("myIssuesNext"),
  missingWorklogMonth: document.getElementById("missingWorklogMonth"),
  loadMissingWorklog: document.getElementById("loadMissingWorklog"),
  missingWorklogMsg: document.getElementById("missingWorklogMsg"),
  missingWorklogList: document.getElementById("missingWorklogList"),
  missingWorklogProjectFilter: document.getElementById("missingWorklogProjectFilter"),
  longRunningThreshold: document.getElementById("longRunningThreshold"),
  longRunningProjectFilterRow: document.getElementById("longRunningProjectFilterRow"),
  longRunningProjectFilter: document.getElementById("longRunningProjectFilter"),
  loadLongRunning: document.getElementById("loadLongRunning"),
  longRunningMsg: document.getElementById("longRunningMsg"),
  longRunningList: document.getElementById("longRunningList"),
  tabMonthCheck: document.getElementById("tab-month-check"),
  panelMonthCheck: document.getElementById("panel-month-check"),
  monthCheckMonth: document.getElementById("monthCheckMonth"),
  loadMonthCheck: document.getElementById("loadMonthCheck"),
  monthCheckStatus: document.getElementById("monthCheckStatus"),
  monthCheckSummary: document.getElementById("monthCheckSummary"),
  monthCheckList: document.getElementById("monthCheckList"),
};

const SETTINGS_FIELDS = ["projectKey", "issueType"];
const DRAFT_FIELDS = ["summary", "description", "parentIssueKey"];
// 자주 쓰는 프로젝트 키 (add jira 자동완성용)
const DEFAULT_PROJECT_KEYS = ["DEVP2026", "FTPM", "DBMS", "DEVOPS"];
let projectKeys = [...DEFAULT_PROJECT_KEYS];
// 구성요소(components)는 전용 셀렉터로 다루므로 createmeta 동적 필드에서는 제외한다.
const componentsCache = {}; // projectKey(대문자) -> 구성요소 배열
let loadedComponentsProject = "";
const myIssuesProjectOptionsCache = {}; // 상태 텍스트 -> [[key, name], ...]
let missingWorklogIssues = []; // 미기록 티켓 마지막 조회 결과(프로젝트 필터용 캐시)
const LONG_RUNNING_STATUS = "진행 중";
let longRunningIssues = []; // 장기 진행 티켓 마지막 조회 결과(임계값·프로젝트 필터용 캐시)
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
/** 캘린더에서 불러온 회의 목록 (회의별 Worklog 저장용). 각 항목: { start, durationMin, title, timeLabel?, selected } */
let loadedCalendarMeetings = [];
/** worklog 저장 방식: 'once' | 'per-meeting' (회의별로 저장이 첫 번째 탭) */
let worklogMode = "per-meeting";

/** add jira: 프로젝트/이슈타입별 createmeta 필드 (동적 필드 렌더링용) */
let issueCreateMetaFields = null;
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

function getSelectedMeetingsCount() {
  return loadedCalendarMeetings.filter((m) => m.selected !== false).length;
}

function setWorklogMode(mode) {
  worklogMode = mode;
  const isPerMeeting = mode === "per-meeting";
  elements.tabWorklogPerMeeting?.classList.toggle("active", isPerMeeting);
  elements.tabWorklogPerMeeting?.setAttribute("aria-selected", String(isPerMeeting));
  elements.panelWorklogPerMeeting?.classList.toggle("hidden", !isPerMeeting);
  elements.tabWorklogOnce?.classList.toggle("active", !isPerMeeting);
  elements.tabWorklogOnce?.setAttribute("aria-selected", String(!isPerMeeting));
  elements.panelWorklogOnce?.classList.toggle("hidden", isPerMeeting);
  if (elements.addWorklog) {
    if (isPerMeeting) {
      elements.addWorklog.disabled = getSelectedMeetingsCount() === 0;
    } else {
      elements.addWorklog.disabled = false;
    }
  }
}

function renderLoadedMeetingsList() {
  const listEl = elements.loadedMeetingsList;
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!loadedCalendarMeetings.length) {
    listEl.classList.add("hidden");
    return;
  }
  listEl.classList.remove("hidden");
  const title = document.createElement("p");
  title.className = "loaded-meetings-title";
  title.textContent = "저장할 회의 선택 (체크 해제 시 제외)";
  listEl.appendChild(title);
  for (let i = 0; i < loadedCalendarMeetings.length; i += 1) {
    const meeting = loadedCalendarMeetings[i];
    const row = document.createElement("label");
    row.className = "loaded-meeting-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = meeting.selected !== false;
    checkbox.setAttribute("aria-label", `${meeting.title} ${meeting.timeLabel || ""} 저장 여부`);
    checkbox.addEventListener("change", () => {
      meeting.selected = checkbox.checked;
      updateLoadedMeetingsUI();
    });
    const text = document.createElement("span");
    text.className = "loaded-meeting-text";
    text.textContent = meeting.timeLabel ? `${meeting.timeLabel} ${meeting.title}` : meeting.title;
    row.appendChild(checkbox);
    row.appendChild(text);
    listEl.appendChild(row);
  }
}

function updateLoadedMeetingsUI() {
  const count = loadedCalendarMeetings.length;
  const selectedCount = getSelectedMeetingsCount();
  if (elements.loadedMeetingsCount) {
    if (count === 0) {
      elements.loadedMeetingsCount.textContent = "";
    } else {
      elements.loadedMeetingsCount.textContent =
        selectedCount === count
          ? `${count}개 회의 불러옴`
          : `${count}개 중 ${selectedCount}개 선택`;
    }
  }
  if (elements.addWorklog && worklogMode === "per-meeting") {
    elements.addWorklog.disabled = selectedCount === 0;
  }
  if (count === 0 && elements.loadedMeetingsList) {
    elements.loadedMeetingsList.innerHTML = "";
    elements.loadedMeetingsList.classList.add("hidden");
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
  const DAY_MINUTES = 8 * 60; // Jira 기본 근무 설정(1일 = 8시간) 기준
  const days = Math.floor(minutes / DAY_MINUTES);
  const remainder = minutes - days * DAY_MINUTES;
  const hours = Math.floor(remainder / 60);
  const mins = remainder % 60;
  const parts = [];
  if (days) {
    parts.push(`${days}d`);
  }
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

const ISSUE_FIELDS_SKIP = new Set(["project", "issuetype", "summary", "description", "parent", "assignee", "reporter", "components"]);

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

/** Jira createmeta 조회 후 필수/선택 필드 목록 반환 */
async function fetchIssueCreateMeta(projectKey, issueTypeName) {
  if (!projectKey || !issueTypeName) return null;
  const params = new URLSearchParams({
    projectKeys: projectKey,
    issuetypeNames: issueTypeName,
    expand: "projects.issuetypes.fields",
  });
  const url = `${API_ROOT}/api/${API_VERSION}/issue/createmeta?${params.toString()}`;
  const res = await fetch(url, { method: "GET", credentials: "include", headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.projects?.length) return null;
  const project = data.projects.find((p) => (p.key || p.id) === projectKey);
  if (!project?.issuetypes?.length) return null;
  const it = project.issuetypes.find(
    (t) => (t.name || "").toLowerCase() === (issueTypeName || "").toLowerCase()
  );
  if (!it?.fields) return null;
  const list = [];
  for (const [fieldId, meta] of Object.entries(it.fields)) {
    if (ISSUE_FIELDS_SKIP.has(fieldId)) continue;
    if (meta.schema?.system === "parent" && fieldId !== "parent") continue;
    if (!meta.required) continue;
    list.push({
      id: fieldId,
      name: meta.name || fieldId,
      required: true,
      schema: meta.schema || {},
      allowedValues: meta.allowedValues || [],
    });
  }
  return list;
}

/** 동적 이슈 필드 UI 렌더링 */
function renderIssueExtraFields(fields) {
  const container = elements.issueExtraFields;
  if (!container) return;
  container.innerHTML = "";
  if (!fields?.length) return;
  for (const f of fields) {
    const label = document.createElement("label");
    label.className = "issue-extra-field";
    const span = document.createElement("span");
    span.className = "issue-extra-field-label";
    span.textContent = f.name + (f.required ? " *" : "");
    label.appendChild(span);
    if (f.allowedValues?.length > 0) {
      const select = document.createElement("select");
      select.dataset.fieldId = f.id;
      select.dataset.fieldType = "select";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = f.required ? "선택하세요" : "(선택)";
      select.appendChild(empty);
      for (const opt of f.allowedValues) {
        const idVal = opt.id;
        const val = opt.value ?? opt.name ?? "";
        const name = opt.value ?? opt.name ?? String(idVal ?? val);
        const option = document.createElement("option");
        option.value = String(idVal ?? val);
        option.textContent = name;
        if (idVal !== undefined && idVal !== null) option.dataset.optionId = String(idVal);
        else if (val !== undefined && val !== null) option.dataset.optionValue = String(val);
        select.appendChild(option);
      }
      label.appendChild(select);
    } else {
      const schema = f.schema?.type || "";
      const input = document.createElement("input");
      input.dataset.fieldId = f.id;
      input.dataset.fieldType = schema === "number" ? "number" : "string";
      if (schema === "number") {
        input.type = "number";
        input.placeholder = "0";
      } else {
        input.type = "text";
        input.placeholder = f.required ? "필수" : "선택";
      }
      label.appendChild(input);
    }
    container.appendChild(label);
  }
}

/** 동적 필드에서 값 수집 (payload.fields 형식) */
function getExtraFieldsValues() {
  const container = elements.issueExtraFields;
  const out = {};
  if (!container) return out;
  const selects = container.querySelectorAll("select[data-field-id]");
  const inputs = container.querySelectorAll("input[data-field-id]");
  for (const el of selects) {
    const id = el.dataset.fieldId;
    const val = el.value?.trim();
    if (!val) continue;
    const opt = el.options[el.selectedIndex];
    if (opt?.dataset?.optionId) out[id] = { id: opt.dataset.optionId };
    else if (opt?.dataset?.optionValue !== undefined) out[id] = { value: opt.dataset.optionValue };
    else out[id] = { value: val };
  }
  for (const el of inputs) {
    const id = el.dataset.fieldId;
    const type = el.dataset.fieldType;
    const val = el.value?.trim();
    if (val === "") continue;
    out[id] = type === "number" ? Number(val) : val;
  }
  return out;
}

/** 동적 필드 필수값 검사 (빈 문자열/미선택) */
function validateExtraFields() {
  if (!issueCreateMetaFields?.length) return "";
  const container = elements.issueExtraFields;
  if (!container) return "";
  for (const f of issueCreateMetaFields) {
    if (!f.required) continue;
    const el = container.querySelector(`[data-field-id="${f.id}"]`);
    if (!el) continue;
    const val = el.tagName === "SELECT" ? el.value?.trim() : el.value?.trim();
    if (!val) return `${f.name} 항목은 필수입니다.`;
  }
  return "";
}

/** 저장 시 Jira API 오류를 막기 위해 이모지(그림 문자)만 제거. 숫자/콜론 등은 유지(\p{Emoji}는 0-9 포함하므로 사용 안 함) */
function stripEmoji(str) {
  if (str == null || typeof str !== "string") {
    return str;
  }
  return str
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
    summary: stripEmoji(values.summary),
    issuetype: { name: values.issueType },
  };

  if (currentUserId) {
    const userRef = API_VERSION === "3"
      ? { accountId: currentUserId }
      : { name: currentUserId };
    fields.assignee = userRef;
    fields.reporter = userRef;
  }

  if (values.issueType === "부작업" && values.parentIssueKey) {
    fields.parent = { key: values.parentIssueKey };
  }

  if (values.description) {
    const desc = stripEmoji(values.description);
    if (API_VERSION === "3") {
      fields.description = toAdf(desc);
    } else {
      fields.description = desc;
    }
  }

  const extra = getExtraFieldsValues();
  Object.assign(fields, extra);

  // 구성요소는 전용 셀렉터가 단독 소유 (createmeta 동적 필드에서는 제외됨)
  if (values.component) {
    fields.components = [{ id: values.component }];
  }

  return { fields };
}

function buildWorklogPayload(values) {
  const payload = {
    timeSpent: values.timeSpent,
    started: values.started,
  };

  if (values.comment) {
    const comment = stripEmoji(values.comment);
    payload.comment = API_VERSION === "3"
      ? toAdf(comment)
      : comment;
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
  const extraError = validateExtraFields();
  if (extraError) return extraError;
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
  const isMonthCheck = tabName === "month-check";

  elements.tabIssue.classList.toggle("active", isIssue);
  elements.tabIssue.setAttribute("aria-selected", String(isIssue));
  elements.panelIssue.classList.toggle("hidden", !isIssue);

  elements.tabWorklog.classList.toggle("active", isWorklog);
  elements.tabWorklog.setAttribute("aria-selected", String(isWorklog));
  elements.panelWorklog.classList.toggle("hidden", !isWorklog);

  elements.tabMyIssues.classList.toggle("active", isMyIssues);
  elements.tabMyIssues.setAttribute("aria-selected", String(isMyIssues));
  elements.panelMyIssues.classList.toggle("hidden", !isMyIssues);

  elements.tabMonthCheck.classList.toggle("active", isMonthCheck);
  elements.tabMonthCheck.setAttribute("aria-selected", String(isMonthCheck));
  elements.panelMonthCheck.classList.toggle("hidden", !isMonthCheck);
}

function updateParentIssueVisibility() {
  const isSubTask = elements.issueType.value === "부작업";
  elements.parentIssueRow.style.display = isSubTask ? "block" : "none";
}

// ── 프로젝트 키 즐겨찾기(datalist) ───────────────────────────────
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

// ── 구성요소(components) 전용 셀렉터 ─────────────────────────────
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
  if (loadedComponentsProject !== projectKey) {
    return; // 조회 도중 프로젝트 키가 바뀌었으면 무시
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
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      applyComponents(key, []); // 없는 키 등은 조용히 숨김
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

/** 프로젝트/이슈타입에 맞는 createmeta 조회 후 동적 필드 렌더 */
async function loadIssueCreateMetaAndRender() {
  const projectKey = elements.projectKey?.value?.trim();
  const issueType = elements.issueType?.value?.trim();
  issueCreateMetaFields = null;
  renderIssueExtraFields([]);
  if (!projectKey || !issueType) return;
  const fields = await fetchIssueCreateMeta(projectKey, issueType);
  issueCreateMetaFields = fields;
  renderIssueExtraFields(fields || []);
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
  elements.issueWorklogStarted.value = formatLocalInputValue(new Date());

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
  elements.monthCheckMonth.value = formatLocalInputValue(new Date()).slice(0, 7);
  elements.missingWorklogMonth.value = formatLocalInputValue(new Date()).slice(0, 7);

  lastIssueKey = result.lastIssueKey || "";
  setActiveTab(result.activeTab || "issue");
  updateLoadedMeetingsUI();
  if (result.activeTab === "issue") {
    await loadIssueCreateMetaAndRender();
  }
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

    let worklogNote = "";
    if (issueKey) {
      lastIssueKey = issueKey;
      await storage.set({ lastIssueKey: issueKey });
      if (!elements.worklogIssueKey.value.trim()) {
        elements.worklogIssueKey.value = issueKey;
        await saveWorklogDraft();
      }

      const inlineTimeSpent = elements.issueWorklogTimeSpent.value.trim();
      if (inlineTimeSpent) {
        try {
          await postWorklog(issueKey, {
            started: datetimeLocalToJiraStarted(elements.issueWorklogStarted.value),
            timeSpent: inlineTimeSpent,
          });
          worklogNote = " / Worklog 저장 완료";
        } catch (worklogError) {
          worklogNote = ` / Worklog 저장 실패: ${normalizeErrorMessage(worklogError)}`;
        }
        elements.issueWorklogTimeSpent.value = "";
        elements.issueWorklogStarted.value = formatLocalInputValue(new Date());
      }
    }

    setStatus(
      issueKey ? `등록 완료: ${issueKey}${worklogNote}` : "등록 완료",
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

    /* 한번에 저장 후에도 불러온 시작 시각·작업 시간·설명은 유지 (재사용 가능) */
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
  const toSave = loadedCalendarMeetings.filter((m) => m.selected !== false);
  if (!toSave.length) {
    setStatus("저장할 회의를 하나 이상 선택해주세요.", "error");
    return;
  }

  setStatus("회의별 Worklog 저장 중...", "loading");
  let successCount = 0;
  let lastError = null;
  for (const meeting of toSave) {
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

/** add my issues 탭 내부 서브탭(내 이슈 목록/미기록 티켓/장기 진행) 전환 */
function setMyIssuesMode(mode) {
  const isList = mode === "list";
  const isMissing = mode === "missing";
  const isLongRunning = mode === "long-running";

  elements.tabMyIssuesList.classList.toggle("active", isList);
  elements.tabMyIssuesList.setAttribute("aria-selected", String(isList));
  elements.panelMyIssuesList.classList.toggle("hidden", !isList);

  elements.tabMyIssuesMissing.classList.toggle("active", isMissing);
  elements.tabMyIssuesMissing.setAttribute("aria-selected", String(isMissing));
  elements.panelMyIssuesMissing.classList.toggle("hidden", !isMissing);

  elements.tabMyIssuesLongRunning.classList.toggle("active", isLongRunning);
  elements.tabMyIssuesLongRunning.setAttribute("aria-selected", String(isLongRunning));
  elements.panelMyIssuesLongRunning.classList.toggle("hidden", !isLongRunning);
}

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
  return elements.myIssuesStatusFilter?.value?.trim() || "";
}

function escapeStatusForJql(status) {
  return status.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getMyIssuesProjectFilter() {
  return elements.myIssuesProjectFilter?.value?.trim() || "";
}

// 현재 상태 조건으로, 내게 할당된 이슈들의 프로젝트만 추려 드롭다운 옵션을 채운다.
async function loadMyIssuesProjectOptions() {
  const statusText = getMyIssuesStatusFilter();
  const cacheKey = statusText || "__all__";
  let projects = myIssuesProjectOptionsCache[cacheKey];

  if (!projects) {
    try {
      let jql = "assignee = currentUser()";
      if (statusText) {
        jql += ` AND status = "${escapeStatusForJql(statusText)}"`;
      }
      const params = new URLSearchParams({
        jql,
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
      myIssuesProjectOptionsCache[cacheKey] = projects;
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
  select.value = keys.includes(current) ? current : "";

  elements.myIssuesProjectFilterRow.classList.remove("hidden");
}

async function fetchMyInProgressIssues(startAt = 0) {
  const statusText = getMyIssuesStatusFilter();
  let jql = "assignee = currentUser()";
  if (statusText) {
    jql += ` AND status = "${escapeStatusForJql(statusText)}"`;
  }
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

/** 이슈 키/요약을 받아 접이식 worklog 입력 폼이 달린 <li>를 생성 (내 이슈 목록·미기록 티켓 목록 공용) */
/** 이슈의 worklog 중 나(currentUserId)의 것만 최신순으로 조회 */
async function fetchMyWorklogEntriesForIssue(issueKey) {
  const url = `${API_ROOT}/api/${API_VERSION}/issue/${encodeURIComponent(issueKey)}/worklog`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`조회 실패 (${response.status})`);
  }
  const data = await response.json().catch(() => ({}));
  const worklogs = data.worklogs || [];
  return worklogs
    .filter((w) => {
      const author = w.author || {};
      return currentUserId
        && (author.accountId === currentUserId || author.name === currentUserId || author.key === currentUserId);
    })
    .map((w) => ({
      started: new Date(w.started),
      minutes: Math.round((w.timeSpentSeconds || 0) / 60),
      timeSpent: w.timeSpent || formatDuration(Math.round((w.timeSpentSeconds || 0) / 60)),
      comment: typeof w.comment === "string" ? w.comment : "",
    }))
    .sort((a, b) => b.started - a.started);
}

/** 이번 달 기준으로 내가 이 이슈에 기록한 worklog 합계(분) */
async function fetchMyLoggedMinutesThisMonthForIssue(issueKey) {
  const entries = await fetchMyWorklogEntriesForIssue(issueKey);
  const range = getMonthRange(formatLocalInputValue(new Date()).slice(0, 7));
  return entries.reduce((sum, entry) => {
    if (entry.started >= range.start && entry.started <= range.end) {
      return sum + entry.minutes;
    }
    return sum;
  }, 0);
}

function createIssueWorklogListItem(key, summary, { showMonthlyBadge = true, extraLine = "" } = {}) {
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

  if (showMonthlyBadge) {
    const monthlyBadge = document.createElement("span");
    monthlyBadge.className = "month-check-ontarget";
    monthlyBadge.textContent = "확인 중...";
    head.appendChild(monthlyBadge);

    fetchMyLoggedMinutesThisMonthForIssue(key)
      .then((minutes) => {
        if (minutes > 0) {
          monthlyBadge.className = "month-check-ontarget";
          monthlyBadge.textContent = `로그 ${formatDuration(minutes)}`;
        } else {
          monthlyBadge.className = "month-check-shortfall";
          monthlyBadge.textContent = "미기록";
        }
      })
      .catch(() => {
        monthlyBadge.className = "month-check-shortfall";
        monthlyBadge.textContent = "확인 실패";
      });
  }

  head.appendChild(toggleBtn);
  li.appendChild(head);

  if (extraLine) {
    const subtext = document.createElement("p");
    subtext.className = "issue-list-item-subtext";
    subtext.textContent = extraLine;
    li.appendChild(subtext);
  }

  const formWrap = document.createElement("div");
  formWrap.className = "issue-worklog-form hidden";

  const historyWrap = document.createElement("div");
  historyWrap.className = "issue-worklog-history";

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

  formWrap.appendChild(historyWrap);
  formWrap.appendChild(startedLabel);
  formWrap.appendChild(timeSpentLabel);
  formWrap.appendChild(commentLabel);
  formWrap.appendChild(formActions);
  formWrap.appendChild(statusEl);
  li.appendChild(formWrap);

  async function loadHistory() {
    historyWrap.innerHTML = "";
    const loadingEl = document.createElement("p");
    loadingEl.className = "issue-list-item-status loading";
    loadingEl.textContent = "작업로그 불러오는 중...";
    historyWrap.appendChild(loadingEl);
    try {
      const entries = await fetchMyWorklogEntriesForIssue(key);
      historyWrap.innerHTML = "";
      if (!entries.length) {
        const emptyEl = document.createElement("p");
        emptyEl.className = "issue-worklog-history-empty";
        emptyEl.textContent = "내 작업로그가 없습니다.";
        historyWrap.appendChild(emptyEl);
        return;
      }
      const list = document.createElement("ul");
      list.className = "issue-worklog-history-list";
      entries.forEach((entry) => {
        const item = document.createElement("li");
        const dateLabel = formatLocalInputValue(entry.started).replace("T", " ");
        item.textContent = entry.comment
          ? `${dateLabel} · ${entry.timeSpent} · ${entry.comment}`
          : `${dateLabel} · ${entry.timeSpent}`;
        list.appendChild(item);
      });
      historyWrap.appendChild(list);
    } catch (err) {
      historyWrap.innerHTML = "";
      const errorEl = document.createElement("p");
      errorEl.className = "issue-list-item-status error";
      errorEl.textContent = normalizeErrorMessage(err) || "작업로그를 불러오지 못했습니다.";
      historyWrap.appendChild(errorEl);
    }
  }

  toggleBtn.addEventListener("click", () => {
    const isHidden = formWrap.classList.toggle("hidden");
    if (!isHidden) {
      startedInput.value = formatLocalInputValue(new Date());
      statusEl.textContent = "";
      statusEl.className = "issue-list-item-status";
      loadHistory();
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
      loadHistory();
    } catch (err) {
      statusEl.textContent = normalizeErrorMessage(err) || "저장에 실패했습니다.";
      statusEl.className = "issue-list-item-status error";
    } finally {
      saveBtn.disabled = false;
    }
  });

  return li;
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
    elements.myIssuesList.appendChild(createIssueWorklogListItem(key, summary));
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
  // 프로젝트 드롭다운 옵션(현재 상태의 내 프로젝트)을 채운다.
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

// ── 이번 달 미기록 티켓 ─────────────────────────────
function setMissingWorklogStatus(message, type = "") {
  elements.missingWorklogMsg.className = `calendar-status ${type}`.trim();
  elements.missingWorklogMsg.textContent = message;
}

/**
 * 지정 기간 동안 상태가 바뀌었거나(=작업이 있었다고 추정) 새로 생성된 내 담당 이슈 목록 조회 (페이지네이션 포함)
 * 생성 직후 상태 전환 이력 없이 바로 작업된 티켓도 놓치지 않도록 생성일시 조건을 OR로 추가한다.
 */
async function fetchIssuesStatusChangedInRange(start, end) {
  const startDate = toJqlDate(start);
  const endDate = toJqlDate(end);
  // created는 datetime 필드라 "<=" 날짜 리터럴은 그 날 자정으로 해석되므로,
  // 종료일 전체를 포함하도록 다음 날 자정 미만(<)으로 상한을 잡는다.
  const endExclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const createdBefore = toJqlDate(endExclusive);
  const jql = `assignee = currentUser() AND (status changed DURING ("${startDate}","${endDate}") OR (created >= "${startDate}" AND created < "${createdBefore}"))`;
  const issues = [];
  const pageSize = 100;
  let startAt = 0;
  let total = Infinity;
  while (startAt < total) {
    const params = new URLSearchParams({
      jql,
      fields: "summary,project",
      maxResults: String(pageSize),
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
    const pageIssues = data.issues || [];
    pageIssues.forEach((issue) => {
      if (issue.key) {
        const project = issue.fields?.project || {};
        issues.push({
          key: issue.key,
          summary: issue.fields?.summary || "(제목 없음)",
          projectKey: project.key || "",
          projectName: project.name || project.key || "",
        });
      }
    });
    total = data.total ?? pageIssues.length;
    startAt += pageIssues.length;
    if (!pageIssues.length) break;
  }
  return issues;
}

function renderMissingWorklogList(listEl, issues) {
  listEl.innerHTML = "";
  if (!issues.length) {
    const li = document.createElement("li");
    li.className = "issue-list-empty";
    li.textContent = "모두 worklog가 기록되어 있습니다.";
    listEl.appendChild(li);
    return;
  }
  issues.forEach(({ key, summary }) => {
    listEl.appendChild(createIssueWorklogListItem(key, summary, { showMonthlyBadge: false }));
  });
}

/** 미기록 티켓이 속한 프로젝트만 추려 드롭다운 옵션을 채운다 */
function renderMissingWorklogProjectOptions(issues) {
  const projectMap = new Map();
  issues.forEach((issue) => {
    if (issue.projectKey && !projectMap.has(issue.projectKey)) {
      projectMap.set(issue.projectKey, issue.projectName || issue.projectKey);
    }
  });
  const projects = [...projectMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const select = elements.missingWorklogProjectFilter;
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
  select.value = keys.includes(current) ? current : "";
}

/** 선택된 프로젝트로 캐시된 미기록 티켓 목록을 다시 렌더링 (재조회 없이 클라이언트에서 필터링) */
function applyMissingWorklogProjectFilter() {
  const projectKey = elements.missingWorklogProjectFilter.value.trim();
  const filtered = projectKey
    ? missingWorklogIssues.filter((issue) => issue.projectKey === projectKey)
    : missingWorklogIssues;
  renderMissingWorklogList(elements.missingWorklogList, filtered);
}

async function handleLoadMissingWorklog() {
  const monthValue = elements.missingWorklogMonth.value || formatLocalInputValue(new Date()).slice(0, 7);
  const range = getMonthRange(monthValue);
  if (!range) {
    setMissingWorklogStatus("대상 월을 선택해주세요.", "error");
    return;
  }

  const now = new Date();
  const cappedEnd = range.end > now ? now : range.end;
  if (cappedEnd < range.start) {
    setMissingWorklogStatus("미래 월은 조회할 수 없습니다.", "error");
    elements.missingWorklogList.innerHTML = "";
    return;
  }

  setMissingWorklogStatus("확인 중...", "loading");
  elements.missingWorklogList.innerHTML = "";

  try {
    const [loggedIssueKeys, changedIssues] = await Promise.all([
      fetchIssueKeysWithWorklogInRange(range.start, cappedEnd),
      fetchIssuesStatusChangedInRange(range.start, cappedEnd),
    ]);
    const loggedKeySet = new Set(loggedIssueKeys);
    missingWorklogIssues = changedIssues.filter((issue) => !loggedKeySet.has(issue.key));
    renderMissingWorklogProjectOptions(missingWorklogIssues);
    applyMissingWorklogProjectFilter();
    setMissingWorklogStatus("", "");
  } catch (error) {
    const message = normalizeErrorMessage(error);
    setMissingWorklogStatus(message ? `확인 실패: ${message}` : "확인에 실패했습니다.", "error");
  }
}

// ── 장기 진행 티켓 ─────────────────────────────
function setLongRunningStatus(message, type = "") {
  elements.longRunningMsg.className = `calendar-status ${type}`.trim();
  elements.longRunningMsg.textContent = message;
}

/** 특정 상태에 있는 내 담당 이슈 목록 조회 (페이지네이션 포함) */
async function fetchInProgressIssueList(statusName) {
  const jql = `assignee = currentUser() AND status = "${escapeStatusForJql(statusName)}"`;
  const issues = [];
  const pageSize = 100;
  let startAt = 0;
  let total = Infinity;
  while (startAt < total) {
    const params = new URLSearchParams({
      jql,
      fields: "summary,project",
      maxResults: String(pageSize),
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
    const pageIssues = data.issues || [];
    pageIssues.forEach((issue) => {
      if (issue.key) {
        const project = issue.fields?.project || {};
        issues.push({
          key: issue.key,
          summary: issue.fields?.summary || "(제목 없음)",
          projectKey: project.key || "",
          projectName: project.name || project.key || "",
        });
      }
    });
    total = data.total ?? pageIssues.length;
    startAt += pageIssues.length;
    if (!pageIssues.length) break;
  }
  return issues;
}

/** 이슈 changelog에서 특정 상태로 전환된 가장 최근 시각을 조회 (없으면 이슈 생성일로 폴백) */
async function fetchStatusEnteredDate(issueKey, statusName) {
  const url = `${API_ROOT}/api/${API_VERSION}/issue/${encodeURIComponent(issueKey)}?fields=created&expand=changelog`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    return null;
  }
  const data = await response.json().catch(() => null);
  if (!data) {
    return null;
  }
  const histories = data.changelog?.histories || [];
  let enteredAt = null;
  for (const history of histories) {
    for (const item of history.items || []) {
      if (item.field === "status" && item.toString === statusName) {
        enteredAt = new Date(history.created);
      }
    }
  }
  if (enteredAt) {
    return enteredAt;
  }
  return data.fields?.created ? new Date(data.fields.created) : null;
}

/** 상태 진입일 기준 경과 영업일까지 계산한 전체 진행중 이슈 목록(임계값 적용 전) */
async function fetchLongRunningIssues(statusName) {
  const issues = await fetchInProgressIssueList(statusName);
  const today = new Date();
  const results = await Promise.all(
    issues.map(async ({ key, summary, projectKey, projectName }) => {
      const enteredAt = await fetchStatusEnteredDate(key, statusName);
      if (!enteredAt) {
        return null;
      }
      const elapsedDays = buildWeekdayList(enteredAt, today).length;
      return { key, summary, projectKey, projectName, enteredAt, elapsedDays };
    })
  );
  return results.filter(Boolean).sort((a, b) => b.elapsedDays - a.elapsedDays);
}

/** 조회된 진행중 이슈가 속한 프로젝트만 추려 드롭다운 옵션을 채운다 */
function renderLongRunningProjectOptions(issues) {
  const projectMap = new Map();
  issues.forEach((issue) => {
    if (issue.projectKey && !projectMap.has(issue.projectKey)) {
      projectMap.set(issue.projectKey, issue.projectName || issue.projectKey);
    }
  });
  const projects = [...projectMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const select = elements.longRunningProjectFilter;
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
  select.value = keys.includes(current) ? current : "";
}

/** 캐시된 전체 진행중 이슈에 임계 영업일/프로젝트 필터를 적용해 다시 렌더링 (재조회 없이) */
function applyLongRunningFilters() {
  const threshold = Number(elements.longRunningThreshold.value) || 5;
  const projectKey = elements.longRunningProjectFilter.value.trim();
  const filtered = longRunningIssues.filter((issue) => {
    if (issue.elapsedDays < threshold) return false;
    if (projectKey && issue.projectKey !== projectKey) return false;
    return true;
  });
  renderLongRunningList(filtered);
}

function renderLongRunningList(items) {
  const listEl = elements.longRunningList;
  listEl.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "issue-list-empty";
    li.textContent = "기준을 넘는 장기 진행 티켓이 없습니다.";
    listEl.appendChild(li);
    return;
  }
  items.forEach(({ key, summary, enteredAt }) => {
    const dateLabel = formatLocalInputValue(enteredAt).replace("T", " ");
    listEl.appendChild(createIssueWorklogListItem(key, summary, { extraLine: `마지막 상태 변경일시: ${dateLabel}` }));
  });
}

async function handleLoadLongRunning() {
  setLongRunningStatus("확인 중...", "loading");
  elements.longRunningList.innerHTML = "";

  try {
    longRunningIssues = await fetchLongRunningIssues(LONG_RUNNING_STATUS);
    renderLongRunningProjectOptions(longRunningIssues);
    applyLongRunningFilters();
    setLongRunningStatus("", "");
  } catch (error) {
    const message = normalizeErrorMessage(error);
    setLongRunningStatus(message ? `확인 실패: ${message}` : "확인에 실패했습니다.", "error");
  }
}

// ── 월 Worklog 부족일 체크 ─────────────────────────────
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function setMonthCheckStatus(message, type = "") {
  elements.monthCheckStatus.className = `calendar-status ${type}`.trim();
  elements.monthCheckStatus.textContent = message;
}

function toJqlDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getMonthRange(monthValue) {
  const [year, month] = (monthValue || "").split("-").map(Number);
  if (!year || !month) {
    return null;
  }
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function buildWeekdayList(start, end) {
  const days = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      days.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** 해당 날짜가 속한 주(월요일)의 날짜를 반환 */
function getWeekStart(date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);
}

/** worklogAuthor/worklogDate JQL로 이번 기간에 내 worklog가 있는 이슈 키 목록 조회 (페이지네이션 포함) */
async function fetchIssueKeysWithWorklogInRange(start, end) {
  const jql = `worklogAuthor = currentUser() AND worklogDate >= "${toJqlDate(start)}" AND worklogDate <= "${toJqlDate(end)}"`;
  const keys = [];
  const pageSize = 100;
  let startAt = 0;
  let total = Infinity;
  while (startAt < total) {
    const params = new URLSearchParams({
      jql,
      fields: "key",
      maxResults: String(pageSize),
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
    const issues = data.issues || [];
    issues.forEach((issue) => {
      if (issue.key) keys.push(issue.key);
    });
    total = data.total ?? issues.length;
    startAt += issues.length;
    if (!issues.length) break;
  }
  return keys;
}

/** 이슈 하나의 worklog 중 나(currentUserId)의 것만, 지정 기간 내 항목만 추려 { date, minutes } 배열로 반환 */
async function fetchIssueWorklogEntries(issueKey, start, end) {
  const entries = [];
  const pageSize = 1000;
  let startAt = 0;
  let total = Infinity;
  while (startAt < total) {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: String(pageSize),
    });
    const url = `${API_ROOT}/api/${API_VERSION}/issue/${encodeURIComponent(issueKey)}/worklog?${params.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return entries;
    }
    const data = await response.json().catch(() => ({}));
    const worklogs = data.worklogs || [];
    for (const w of worklogs) {
      const author = w.author || {};
      const isMine = currentUserId
        && (author.accountId === currentUserId || author.name === currentUserId || author.key === currentUserId);
      if (!isMine || !w.started) continue;
      const started = new Date(w.started);
      if (Number.isNaN(started.getTime()) || started < start || started > end) continue;
      entries.push({
        date: toJqlDate(started),
        minutes: Math.round((w.timeSpentSeconds || 0) / 60),
      });
    }
    total = data.total ?? worklogs.length;
    startAt += worklogs.length;
    if (!worklogs.length) break;
  }
  return entries;
}

async function aggregateDailyMinutes(start, end, issueKeys) {
  const results = await Promise.all(
    issueKeys.map((key) => fetchIssueWorklogEntries(key, start, end))
  );
  const dailyMinutes = new Map();
  for (const entries of results) {
    for (const entry of entries) {
      dailyMinutes.set(entry.date, (dailyMinutes.get(entry.date) || 0) + entry.minutes);
    }
  }
  return dailyMinutes;
}

/** 부족일 "채우기" 클릭: add worklog 탭으로 이동 + 날짜/부족 시간 프리필 */
function handleFillShortfall(date, shortfallMinutes) {
  const pad = (value) => String(value).padStart(2, "0");
  const dateText = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  setWorklogMode("once");
  elements.worklogStarted.value = `${dateText}T09:00`;
  elements.worklogTimeSpent.value = formatDuration(shortfallMinutes);
  setActiveTab("worklog");
  saveActiveTab("worklog");
  saveWorklogDraft();
}

/** 부족(음수)/초과(양수)/충족(0) 상태 뱃지 생성. 조상 요소에 .month-check-week-summary 또는 .month-check-month-summary가 있으면 pill 스타일로 렌더링됨 */
function createDiffLabel(diffMinutes) {
  const el = document.createElement("span");
  if (diffMinutes < 0) {
    el.className = "month-check-shortfall";
    el.textContent = `부족 ${formatDuration(-diffMinutes)}`;
  } else if (diffMinutes > 0) {
    el.className = "month-check-surplus";
    el.textContent = `초과 ${formatDuration(diffMinutes)}`;
  } else {
    el.className = "month-check-ontarget";
    el.textContent = "충족";
  }
  return el;
}

function renderMonthCheckResult(dailyMinutesMap, weekdays) {
  const listEl = elements.monthCheckList;
  listEl.innerHTML = "";

  let totalLogged = 0;
  const dayEntries = weekdays.map((date) => {
    const dateText = toJqlDate(date);
    const minutes = dailyMinutesMap.get(dateText) || 0;
    totalLogged += minutes;
    return { date, minutes, diff: minutes - DAILY_TARGET_MINUTES };
  });

  const targetTotal = weekdays.length * DAILY_TARGET_MINUTES;
  elements.monthCheckSummary.innerHTML = "";
  if (weekdays.length) {
    const totalLabel = document.createElement("span");
    totalLabel.textContent = `로그 ${formatDuration(totalLogged)} / 목표 ${formatDuration(targetTotal)}`;
    elements.monthCheckSummary.appendChild(totalLabel);
    elements.monthCheckSummary.appendChild(createDiffLabel(totalLogged - targetTotal));
  }

  if (!dayEntries.length) {
    const li = document.createElement("li");
    li.className = "issue-list-empty";
    li.textContent = "조회할 평일이 없습니다.";
    listEl.appendChild(li);
    return;
  }

  let weekLogged = 0;
  let weekTarget = 0;
  let weekKey = "";
  let weekStartDate = null;
  let weekEndDate = null;

  dayEntries.forEach(({ date, minutes, diff }, index) => {
    const currentWeekKey = toJqlDate(getWeekStart(date));
    if (weekKey && currentWeekKey !== weekKey) {
      appendWeekSummaryRow(listEl, weekStartDate, weekEndDate, weekLogged, weekTarget);
      weekLogged = 0;
      weekTarget = 0;
      weekStartDate = null;
    }
    weekKey = currentWeekKey;
    if (!weekStartDate) {
      weekStartDate = date;
    }
    weekEndDate = date;
    weekLogged += minutes;
    weekTarget += DAILY_TARGET_MINUTES;

    const li = document.createElement("li");
    li.className = "issue-list-item";

    const head = document.createElement("div");
    head.className = "issue-list-item-head";

    const label = document.createElement("span");
    label.className = "issue-list-item-link";
    const weekdayLabel = WEEKDAY_LABELS[date.getDay()];
    label.textContent = `${date.getMonth() + 1}/${date.getDate()}(${weekdayLabel}) 로그 ${formatDuration(minutes)}`;

    head.appendChild(label);
    head.appendChild(createDiffLabel(diff));

    if (diff < 0) {
      const fillBtn = document.createElement("button");
      fillBtn.type = "button";
      fillBtn.className = "secondary issue-worklog-toggle";
      fillBtn.textContent = "채우기";
      fillBtn.addEventListener("click", () => handleFillShortfall(date, -diff));
      head.appendChild(fillBtn);
    }

    li.appendChild(head);
    listEl.appendChild(li);

    if (index === dayEntries.length - 1) {
      appendWeekSummaryRow(listEl, weekStartDate, weekEndDate, weekLogged, weekTarget);
    }
  });
}

/** 주(월~금) 단위 누적 로그/목표를 들여쓴 하위 항목으로 목록 중간에 삽입 */
function appendWeekSummaryRow(listEl, startDate, endDate, loggedMinutes, targetMinutes) {
  const li = document.createElement("li");
  li.className = "month-check-week-summary";

  const label = document.createElement("span");
  label.className = "month-check-week-summary-label";
  const rangeText = startDate && endDate
    ? `${startDate.getMonth() + 1}/${startDate.getDate()} ~ ${endDate.getMonth() + 1}/${endDate.getDate()} 주간 합계`
    : "주간 합계";
  label.textContent = `ㄴ ${rangeText}`;

  const row = document.createElement("div");
  row.className = "month-check-week-summary-row";

  const total = document.createElement("span");
  total.className = "month-check-week-summary-total";
  total.textContent = `로그 ${formatDuration(loggedMinutes)} / 목표 ${formatDuration(targetMinutes)}`;

  row.appendChild(total);
  row.appendChild(createDiffLabel(loggedMinutes - targetMinutes));
  li.appendChild(label);
  li.appendChild(row);
  listEl.appendChild(li);
}

async function handleLoadMonthCheck() {
  const monthValue = elements.monthCheckMonth.value || formatLocalInputValue(new Date()).slice(0, 7);
  const range = getMonthRange(monthValue);
  if (!range) {
    setMonthCheckStatus("대상 월을 선택해주세요.", "error");
    return;
  }

  const now = new Date();
  const cappedEnd = range.end > now ? now : range.end;
  if (cappedEnd < range.start) {
    setMonthCheckStatus("미래 월은 조회할 수 없습니다.", "error");
    elements.monthCheckSummary.textContent = "";
    elements.monthCheckList.innerHTML = "";
    return;
  }

  setMonthCheckStatus("조회 중...", "loading");
  elements.monthCheckSummary.textContent = "";
  elements.monthCheckList.innerHTML = "";

  try {
    const issueKeys = await fetchIssueKeysWithWorklogInRange(range.start, cappedEnd);
    const dailyMinutesMap = await aggregateDailyMinutes(range.start, cappedEnd, issueKeys);
    const weekdays = buildWeekdayList(range.start, cappedEnd);
    renderMonthCheckResult(dailyMinutesMap, weekdays);
    setMonthCheckStatus("", "");
  } catch (error) {
    const message = normalizeErrorMessage(error);
    setMonthCheckStatus(message ? `조회 실패: ${message}` : "조회에 실패했습니다.", "error");
  }
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
      timeLabel: m.timeLabel,
      selected: true,
    }));
    renderLoadedMeetingsList();
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

/** 클릭 시 여닫히는 "ⓘ 조회 조건" 툴팁. 다른 곳 클릭하거나 다시 클릭하면 닫힘 */
function setupTabHelpTooltips() {
  const helpButtons = document.querySelectorAll(".tab-help");
  helpButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = btn.classList.contains("open");
      helpButtons.forEach((other) => other.classList.remove("open"));
      if (!wasOpen) {
        btn.classList.add("open");
      }
    });
  });
  document.addEventListener("click", () => {
    helpButtons.forEach((btn) => btn.classList.remove("open"));
  });
}

function registerEventListeners() {
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
  elements.addWorklog.addEventListener("click", () => {
    if (worklogMode === "per-meeting") {
      handleAddWorklogsFromCalendar();
    } else {
      handleAddWorklog();
    }
  });
  elements.googleLogin.addEventListener("click", handleGoogleLogin);
  elements.loadMeetings.addEventListener("click", handleLoadMeetings);

  elements.issueType.addEventListener("change", () => {
    updateParentIssueVisibility();
    saveSettings();
    loadIssueCreateMetaAndRender();
  });
  // 프로젝트 키: createmeta 갱신 + 구성요소 표시
  elements.projectKey.addEventListener("change", () => {
    loadIssueCreateMetaAndRender();
    updateComponentVisibility();
  });
  let componentDebounce;
  elements.projectKey.addEventListener("input", () => {
    clearTimeout(componentDebounce);
    componentDebounce = setTimeout(updateComponentVisibility, 400);
  });
  // datalist는 입력값과 일치하는 옵션만 보여주므로, 포커스 시 잠시 비워 전체 목록을
  // 노출하고, 선택/입력 없이 벗어나면 이전 값을 복원한다(캡처 단계로 먼저 실행).
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
      if (!elements.projectKey.value.trim() && projectKeyBeforeFocus) {
        elements.projectKey.value = projectKeyBeforeFocus;
      }
      projectKeyBeforeFocus = "";
    },
    true
  );
  elements.projectKey.addEventListener("blur", () => {
    rememberProjectKey(elements.projectKey.value);
    updateComponentVisibility();
    loadIssueCreateMetaAndRender();
  });

  elements.tabIssue.addEventListener("click", async () => {
    setActiveTab("issue");
    await saveActiveTab("issue");
    await loadIssueCreateMetaAndRender();
  });
  elements.tabWorklog.addEventListener("click", async () => {
    setActiveTab("worklog");
    await saveActiveTab("worklog");
  });
  elements.tabWorklogOnce?.addEventListener("click", () => setWorklogMode("once"));
  elements.tabWorklogPerMeeting?.addEventListener("click", () => setWorklogMode("per-meeting"));
  elements.tabMyIssues.addEventListener("click", async () => {
    setActiveTab("my-issues");
    await saveActiveTab("my-issues");
  });
  elements.tabMyIssuesList.addEventListener("click", () => setMyIssuesMode("list"));
  elements.tabMyIssuesMissing.addEventListener("click", () => setMyIssuesMode("missing"));
  elements.tabMyIssuesLongRunning.addEventListener("click", () => setMyIssuesMode("long-running"));
  elements.loadMyInProgressIssues.addEventListener("click", handleLoadMyInProgressIssues);
  elements.resetMyIssuesStatusFilter.addEventListener("click", () => {
    elements.myIssuesStatusFilter.value = "";
  });
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
  elements.loadMissingWorklog.addEventListener("click", handleLoadMissingWorklog);
  elements.missingWorklogMonth.addEventListener("change", handleLoadMissingWorklog);
  elements.missingWorklogProjectFilter.addEventListener("change", applyMissingWorklogProjectFilter);
  elements.loadLongRunning.addEventListener("click", handleLoadLongRunning);
  elements.longRunningProjectFilter.addEventListener("change", applyLongRunningFilters);
  elements.longRunningThreshold.addEventListener("change", applyLongRunningFilters);

  elements.tabMonthCheck.addEventListener("click", async () => {
    setActiveTab("month-check");
    await saveActiveTab("month-check");
  });
  elements.loadMonthCheck.addEventListener("click", handleLoadMonthCheck);
  elements.monthCheckMonth.addEventListener("change", handleLoadMonthCheck);
}

document.addEventListener("DOMContentLoaded", async () => {
  // UI 인터랙션(탭 전환 등)은 네트워크/인증 초기화와 무관하게 항상 동작해야 하므로
  // 리스너를 먼저 등록한 뒤 비동기 초기화를 진행한다.
  registerEventListeners();
  setupTabHelpTooltips();

  // manifest.json의 version을 그대로 표시 (게시 시 manifest 버전만 올리면 자동 반영됨)
  elements.appVersion.textContent = `v${chrome.runtime.getManifest().version}`;

  try {
    await loadFromStorage();
    await loadProjectKeys();
  } catch (error) {
    console.error("초기화 중 오류:", error);
  }

  // 인증 확인은 실패/지연해도 UI 동작을 막지 않도록 개별 처리한다.
  checkAuthStatus().catch((error) => console.error("Jira 인증 확인 실패:", error));
  checkGoogleAuthStatus().catch((error) => console.error("Google 인증 확인 실패:", error));
});
