// sidepanel/sidepanel.js
// 1) 스니펫 고정(★) + 드래그드랍 정렬
// 2) 본문 결과 미리보기 (목록 + 편집)
// 3) 도메인/스코프 제거
// 4) 변수 관리 + 삽입 시 자동 치환/미등록 변수 입력 모달

const $ = (s) => document.querySelector(s);

const BUILTIN_KEYS = new Set(["date","time","datetime","clipboard","selectedText","url","title","hostname"]);

const state = {
  snippets: [],
  variables: {},           // { key: value }
  settings: { theme: "dark" },
  q: "",
  editingId: null,
  lastActiveTabId: null,
  pageContext: { url: "", title: "", hostname: "", selectedText: "" },
  pendingInsert: null      // { snippet, builtins, unknownKeys }
};

init();

async function init() {
  const data = await chrome.storage.local.get({
    snippets: [],
    variables: {},
    settings: { theme: "dark" }
  });

  state.snippets = normalizeSnippets(Array.isArray(data.snippets) ? data.snippets : []);
  state.variables = (data.variables && typeof data.variables === "object") ? data.variables : {};
  state.settings = data.settings || { theme: "dark" };

  const initialTheme = normalizeTheme(state.settings.theme);
  state.settings.theme = initialTheme;
  $("#theme").value = initialTheme;
  applyTheme(initialTheme);

  $("#theme").addEventListener("change", async () => {
    state.settings.theme = normalizeTheme($("#theme").value);
    await chrome.storage.local.set({ settings: state.settings });
    applyTheme(state.settings.theme);
    renderAll();
  });

  $("#q").addEventListener("input", () => {
    state.q = $("#q").value.trim().toLowerCase();
    renderLists();
  });

  $("#clearQ").addEventListener("click", () => {
    $("#q").value = "";
    state.q = "";
    renderLists();
    $("#q").focus();
  });

  $("#refreshContext").addEventListener("click", async () => {
    await ensureAndFetchContext(true);
    renderAll();
  });

  $("#new").addEventListener("click", () => {
    state.editingId = null;
    fillForm(blankSnippet());
    highlightActive(null);
    updatePreviewForEditor();
    openEditorModal();
    focusTitleInput();
  });

  const openVariables = $("#openVariables");
  if (openVariables) openVariables.addEventListener("click", () => {
    openVariablesModal();
    focusVariableKeyInput();
  });

  $("#save").addEventListener("click", onSave);
  $("#delete").addEventListener("click", onDelete);

  $("#insert").addEventListener("click", async () => {
    const s = getEditingSnippet();
    if (!s?.id) {
      alert("please select a saved snippet");
      return;
    }
    await insertSnippetById(s.id);
  });

  // Variables manager
  $("#addVar").addEventListener("click", async () => {
    const key = ($("#varKey").value || "").trim();
    const val = ($("#varValue").value || "");
    if (!isValidVarKey(key)) {
      alert("variable keys are recommended to be alphanumeric and underscores only. e.g. name, phone_number");
      return;
    }
    state.variables[key] = val;
    await persistVariables();
    $("#varKey").value = "";
    $("#varValue").value = "";
    renderVariables();
    renderAll(); // previews may change
  });

  // live preview update when editing
  ["title","tags","content","enabled"].forEach(id => {
    const el = $("#" + id);
    el.addEventListener("input", updatePreviewForEditor);
    el.addEventListener("change", updatePreviewForEditor);
  });

  // modal
  $("#modalCancel").addEventListener("click", closeModal);
  $("#modalOk").addEventListener("click", async () => await submitModalAndInsert());
  $("#modal").addEventListener("keydown", async (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) await submitModalAndInsert();
  });

  const editorBackdrop = $("#editorBackdrop");
  if (editorBackdrop) editorBackdrop.addEventListener("click", closeEditorModal);
  const editorClose = $("#editorClose");
  if (editorClose) editorClose.addEventListener("click", closeEditorModal);
  const variablesBackdrop = $("#variablesBackdrop");
  if (variablesBackdrop) variablesBackdrop.addEventListener("click", closeVariablesModal);
  const variablesClose = $("#variablesClose");
  if (variablesClose) variablesClose.addEventListener("click", closeVariablesModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isEditorModalOpen()) closeEditorModal();
    if (e.key === "Escape" && isVariablesModalOpen()) closeVariablesModal();
  });

  const exportBtn = $("#export");
  if (exportBtn) exportBtn.addEventListener("click", onExport);
  const importBtn = $("#import");
  if (importBtn) importBtn.addEventListener("click", () => $("#filePicker").click());
  const filePicker = $("#filePicker");
  if (filePicker) filePicker.addEventListener("change", onImportFile);

  // If empty, create demo snippets
  if (state.snippets.length === 0) {
    state.snippets = normalizeSnippets(makeDemoSnippets());
    await chrome.storage.local.set({ snippets: state.snippets });
  }

  // Default select first snippet
  state.editingId = firstSnippetId() || null;
  fillForm(getEditingSnippet() || blankSnippet());

  await ensureAndFetchContext(false);
  renderAll();
}

const THEME_SET = new Set(["dark","light","purple","blue","teal","green","orange","pink","magenta"]);

function normalizeTheme(theme) {
  if (!theme || theme === "system") {
    return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
  }
  return THEME_SET.has(theme) ? theme : "dark";
}

function applyTheme(theme) {
  document.body.dataset.theme = normalizeTheme(theme);
}

function isEditorModalOpen() {
  const modal = $("#editorModal");
  return !!(modal && modal.style.display !== "none");
}

function openEditorModal() {
  const modal = $("#editorModal");
  if (modal) modal.style.display = "block";
}

function closeEditorModal() {
  const modal = $("#editorModal");
  if (modal) modal.style.display = "none";
}

function focusTitleInput() {
  const title = $("#title");
  if (title) setTimeout(() => title.focus(), 0);
}

function isVariablesModalOpen() {
  const modal = $("#variablesModal");
  return !!(modal && modal.style.display !== "none");
}

function openVariablesModal() {
  const modal = $("#variablesModal");
  if (modal) modal.style.display = "block";
}

function closeVariablesModal() {
  const modal = $("#variablesModal");
  if (modal) modal.style.display = "none";
}

function focusVariableKeyInput() {
  const key = $("#varKey");
  if (key) setTimeout(() => key.focus(), 0);
}

function blankSnippet() {
  return {
    id: null,
    title: "",
    content: "",
    tags: [],
    enabled: true,
    pinned: false,
    order: 0,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: null,
    updatedAt: null
  };
}

function normalizeSnippets(snippets) {
  const cleaned = (snippets || [])
    .filter(Boolean)
    .map((s, idx) => {
      const ns = { ...s };
      // remove old scope/domain
      delete ns.scope;
      delete ns.domains;

      if (ns.pinned === undefined) ns.pinned = false;
      if (typeof ns.order !== "number") ns.order = idx;
      if (ns.enabled === undefined) ns.enabled = true;
      if (!Array.isArray(ns.tags)) ns.tags = [];
      return ns;
    });

  // Ensure sequential order inside each group
  const pinned = cleaned.filter(s => s.pinned).sort((a,b) => (a.order||0) - (b.order||0));
  const normal = cleaned.filter(s => !s.pinned).sort((a,b) => (a.order||0) - (b.order||0));
  pinned.forEach((s, i) => s.order = i);
  normal.forEach((s, i) => s.order = i);
  return pinned.concat(normal);
}

function firstSnippetId() {
  const { pinned, normal } = getSortedSnippets(false);
  return (pinned[0] || normal[0])?.id;
}

function getEditingSnippet() {
  if (!state.editingId) return null;
  return state.snippets.find(s => s.id === state.editingId) || null;
}

function getSortedSnippets(applySearch) {
  const base = state.snippets.filter(s => s && s.enabled !== false);

  const filtered = (applySearch && state.q)
    ? base.filter(s => {
        const hay = [s.title||"", (s.tags||[]).join(","), s.content||""].join(" ").toLowerCase();
        return hay.includes(state.q);
      })
    : base;

  const pinned = filtered.filter(s => s.pinned).sort((a,b) => (a.order||0) - (b.order||0));
  const normal = filtered.filter(s => !s.pinned).sort((a,b) => (a.order||0) - (b.order||0));
  return { pinned, normal };
}

function renderAll() {
  renderLists();
  renderVariables();
  updatePreviewForEditor();
}

function renderLists() {
  const { pinned, normal } = getSortedSnippets(true);
  const merged = pinned.concat(normal);
  renderListTo($("#list"), merged);
}

function renderListTo(container, items) {
  container.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "no snippets";
    container.appendChild(empty);
    return;
  }

  // drag enabled only when NOT searching
  const dragEnabled = !state.q;

  for (const s of items) {
    const el = document.createElement("div");
    el.className = "item";
    el.dataset.id = s.id;

    if (s.id === state.editingId) el.classList.add("active");

    el.draggable = dragEnabled;

    el.addEventListener("click", () => {
      state.editingId = s.id;
      fillForm(s);
      highlightActive(s.id);
      updatePreviewForEditor();
      openEditorModal();
      focusTitleInput();
    });

    el.addEventListener("dblclick", () => insertSnippetById(s.id));

    el.addEventListener("dragstart", (e) => {
      if (!dragEnabled) return;
      e.dataTransfer.setData("text/plain", s.id);
      e.dataTransfer.effectAllowed = "move";
      el.style.opacity = "0.7";
    });

    el.addEventListener("dragend", () => {
      el.style.opacity = "";
    });

    el.addEventListener("dragover", (e) => {
      if (!dragEnabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.style.outline = "2px dashed color-mix(in srgb, var(--accent) 45%, transparent)";
      el.style.outlineOffset = "2px";
    });

    el.addEventListener("dragleave", () => {
      el.style.outline = "";
      el.style.outlineOffset = "";
    });

    el.addEventListener("drop", async (e) => {
      if (!dragEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      el.style.outline = "";
      el.style.outlineOffset = "";

      const draggedId = e.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === s.id) return;

      await reorderByDrop(draggedId, s.id, s.pinned);
    });

    const top = document.createElement("div");
    top.className = "itemTop";

    const handle = document.createElement("div");
    handle.className = "dragHandle";
    handle.textContent = "⋮⋮";
    handle.title = dragEnabled ? "drag to reorder" : "dragging is disabled while searching";
    handle.addEventListener("click", (e) => e.stopPropagation());

    const pin = document.createElement("div");
    pin.className = "pinIcon";
    pin.title = s.pinned ? "Unpin" : "Pin";
    pin.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" x2="12" y1="17" y2="22"></line>
        <path d="M5 17h14v-3.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 13.24Z"></path>
      </svg>
    `;
    if (s.pinned) pin.classList.add("pinned");
    pin.addEventListener("click", async (e) => {
      e.stopPropagation();
      await togglePin(s.id);
    });

    const title = document.createElement("div");
    title.className = "itemTitle";
    title.textContent = s.title || "(no title)";

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = `${s.usageCount || 0} times`;

    top.appendChild(handle);
    top.appendChild(pin);
    top.appendChild(title);
    top.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "itemMeta";
    meta.textContent = (s.tags && s.tags.length) ? `#${s.tags.join(" #")}` : "no tags";

    const preview = document.createElement("div");
    preview.className = "itemPreview";
    preview.textContent = makePreviewText(s.content || "");

    el.appendChild(top);
    el.appendChild(meta);
    el.appendChild(preview);

    container.appendChild(el);
  }

  // Drop to end of list
  container.addEventListener("dragover", (e) => {
    if (!dragEnabled) return;
    e.preventDefault();
  });

  container.addEventListener("drop", async (e) => {
    if (!dragEnabled) return;
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    const dragged = state.snippets.find(s => s.id === draggedId);
    await reorderToEnd(draggedId, dragged?.pinned);
  });
}

function highlightActive(id) {
  for (const el of Array.from(document.querySelectorAll(".item"))) {
    el.classList.toggle("active", el.dataset.id === id);
  }
}

function fillForm(s) {
  $("#title").value = s.title || "";
  $("#tags").value = (s.tags || []).join(", ");
  $("#content").value = s.content || "";
  $("#enabled").checked = s.enabled !== false;
  $("#delete").disabled = !s.id;
}

function readForm() {
  const title = $("#title").value.trim();
  const tags = $("#tags").value.split(",").map(x => x.trim()).filter(Boolean);
  const content = $("#content").value;
  const pinned = getEditingSnippet()?.pinned ?? false;
  return {
    title,
    tags,
    content,
    enabled: $("#enabled").checked,
    pinned
  };
}

async function onSave() {
  const form = readForm();

  if (!form.title) { alert("please enter a title"); return; }
  if (!form.content) { alert("please enter a content"); return; }

  const now = Date.now();

  if (!state.editingId) {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(now) + "-" + Math.random().toString(16).slice(2);
    const order = nextOrderForPinned(form.pinned);
    const s = {
      id,
      ...form,
      order,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now
    };
    state.snippets.push(s);
    state.editingId = id;
  } else {
    const idx = state.snippets.findIndex(x => x.id === state.editingId);
    if (idx >= 0) {
      const prev = state.snippets[idx];
      let order = prev.order;
      if (prev.pinned !== form.pinned) order = nextOrderForPinned(form.pinned);
      state.snippets[idx] = { ...prev, ...form, order, updatedAt: now };
    }
  }

  normalizeOrdersInPlace();
  await persistSnippets();

  renderLists();
  highlightActive(state.editingId);
  const cur = getEditingSnippet();
  if (cur) fillForm(cur);
  updatePreviewForEditor();
}

async function onDelete() {
  if (!state.editingId) return;
  if (!confirm("are you sure you want to delete?")) return;

  state.snippets = state.snippets.filter(s => s.id !== state.editingId);
  normalizeOrdersInPlace();
  await persistSnippets();

  state.editingId = firstSnippetId() || null;
  fillForm(getEditingSnippet() || blankSnippet());
  renderLists();
  updatePreviewForEditor();
}

function nextOrderForPinned(pinned) {
  const group = state.snippets.filter(s => !!s.pinned === !!pinned);
  if (group.length === 0) return 0;
  return Math.max(...group.map(s => s.order || 0)) + 1;
}

async function togglePin(id) {
  const idx = state.snippets.findIndex(s => s.id === id);
  if (idx < 0) return;

  const s = state.snippets[idx];
  const nextPinned = !s.pinned;

  state.snippets[idx] = {
    ...s,
    pinned: nextPinned,
    order: nextOrderForPinned(nextPinned),
    updatedAt: Date.now()
  };

  if (state.editingId === id) $("#pinned").checked = nextPinned;

  normalizeOrdersInPlace();
  await persistSnippets();
  renderLists();
  updatePreviewForEditor();
}

async function reorderByDrop(draggedId, targetId, toPinnedSection) {
  const dragged = state.snippets.find(s => s.id === draggedId);
  const target = state.snippets.find(s => s.id === targetId);
  if (!dragged || !target) return;

  const toPinned = !!toPinnedSection;
  dragged.pinned = toPinned;

  const group = state.snippets
    .filter(s => s.enabled !== false && s.pinned === toPinned)
    .sort((a,b) => (a.order||0) - (b.order||0))
    .map(s => s.id);

  const fromIndex = group.indexOf(draggedId);
  const toIndex = group.indexOf(targetId);
  if (fromIndex < 0 || toIndex < 0) return;

  group.splice(fromIndex, 1);
  group.splice(toIndex, 0, draggedId);

  for (let i = 0; i < group.length; i++) {
    const id = group[i];
    const idx = state.snippets.findIndex(s => s.id === id);
    if (idx >= 0) state.snippets[idx].order = i;
  }

  normalizeOrdersInPlace();
  await persistSnippets();
  renderLists();
}

async function reorderToEnd(draggedId, toPinnedSection) {
  const dragged = state.snippets.find(s => s.id === draggedId);
  if (!dragged) return;

  const toPinned = !!toPinnedSection;
  dragged.pinned = toPinned;

  const group = state.snippets
    .filter(s => s.enabled !== false && s.pinned === toPinned)
    .sort((a,b) => (a.order||0) - (b.order||0))
    .map(s => s.id)
    .filter(id => id !== draggedId);

  group.push(draggedId);

  for (let i = 0; i < group.length; i++) {
    const idx = state.snippets.findIndex(s => s.id === group[i]);
    if (idx >= 0) state.snippets[idx].order = i;
  }

  normalizeOrdersInPlace();
  await persistSnippets();
  renderLists();
}

function normalizeOrdersInPlace() {
  const pinned = state.snippets.filter(s => s.pinned).sort((a,b) => (a.order||0) - (b.order||0));
  const normal = state.snippets.filter(s => !s.pinned).sort((a,b) => (a.order||0) - (b.order||0));
  pinned.forEach((s,i) => s.order = i);
  normal.forEach((s,i) => s.order = i);
}

// ===== Context =====
async function ensureAndFetchContext(force) {
  if (!force && state.pageContext?.hostname) return;

  const ensure = await chrome.runtime.sendMessage({ type: "TS_ENSURE_CONTENT" });
  if (!ensure?.ok) {
    state.pageContext = { url: "", title: "", hostname: "", selectedText: "" };
    return;
  }
  state.lastActiveTabId = ensure.tabId;

  const ctx = await sendToTab(state.lastActiveTabId, { type: "TS_GET_CONTEXT" });
  if (ctx?.ok && ctx.context) state.pageContext = ctx.context;
}

// ===== Template / Preview =====
function extractVariables(content) {
  const set = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(content)) !== null) set.add(m[1]);
  return Array.from(set);
}

function applyTemplate(content, values, unknownStyle = "placeholder") {
  // unknownStyle: "empty" | "placeholder" | "keep"
  return String(content).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      const v = values[key];
      return (v === undefined || v === null) ? "" : String(v);
    }
    if (unknownStyle === "empty") return "";
    if (unknownStyle === "keep") return `{{${key}}}`;
    return `⟪${key}⟫`;
  });
}

function getBuiltinsSync(context) {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  const datetime = `${date} ${time}`;

  return {
    date,
    time,
    datetime,
    clipboard: "", // preview에서는 비움
    selectedText: context?.selectedText || "",
    url: context?.url || "",
    title: context?.title || "",
    hostname: context?.hostname || ""
  };
}

async function getBuiltinsForInsert(context) {
  const built = getBuiltinsSync(context);
  try { built.clipboard = await navigator.clipboard.readText(); }
  catch { built.clipboard = ""; }
  return built;
}

function makePreviewText(content) {
  const builtins = getBuiltinsSync(state.pageContext);
  const values = { ...builtins, ...state.variables };
  const preview = applyTemplate(content, values, "placeholder");
  return preview.length > 240 ? (preview.slice(0, 240) + "…") : preview;
}

function updatePreviewForEditor() {
  const s = getEditingSnippet();
  const content = s?.id ? (s.content || "") : ($("#content").value || "");
  const builtins = getBuiltinsSync(state.pageContext);
  const values = { ...builtins, ...state.variables };
  $("#preview").textContent = applyTemplate(content, values, "placeholder");
}

function isValidVarKey(key) {
  return /^[a-zA-Z0-9_]+$/.test(key) && key.length <= 40;
}

// ===== Persist =====
async function persistSnippets() {
  state.snippets = normalizeSnippets(state.snippets);
  await chrome.storage.local.set({ snippets: state.snippets });
}
async function persistVariables() {
  await chrome.storage.local.set({ variables: state.variables });
}

// ===== Insert =====
async function insertSnippetById(id) {
  const snippet = state.snippets.find(s => s.id === id);
  if (!snippet) return;

  const ensure = await chrome.runtime.sendMessage({ type: "TS_ENSURE_CONTENT" });
  if (!ensure?.ok) {
    alert("current tab not found. please navigate to the page you want to insert and try again.");
    return;
  }
  state.lastActiveTabId = ensure.tabId;

  const ctx = await sendToTab(state.lastActiveTabId, { type: "TS_GET_CONTEXT" });
  const context = ctx?.ok ? (ctx.context || {}) : {};
  state.pageContext = context || state.pageContext;

  const builtins = await getBuiltinsForInsert(context);
  const values = { ...builtins, ...state.variables };

  const vars = extractVariables(snippet.content || "");
  const unknown = vars.filter(v => !Object.prototype.hasOwnProperty.call(values, v));

  if (unknown.length > 0) {
    state.pendingInsert = { snippet, builtins, unknownKeys: unknown };
    openModal(unknown);
    return;
  }

  const text = applyTemplate(snippet.content || "", values, "empty");
  await doInsertText(snippet, text);
}

async function doInsertText(snippet, text) {
  const res = await sendToTab(state.lastActiveTabId, {
    type: "TS_INSERT_TEXT",
    text,
    snippetId: snippet.id
  });

  if (!res?.ok) {
    alert("input field not found. please click the input field on the page and try again.");
    return;
  }

  // usage count updated by content script; refresh
  const data = await chrome.storage.local.get({ snippets: [] });
  state.snippets = normalizeSnippets(Array.isArray(data.snippets) ? data.snippets : state.snippets);

  renderLists();
  highlightActive(state.editingId);
  updatePreviewForEditor();
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content/content.js"] });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      return null;
    }
  }
}

// ===== Modal =====
function openModal(keys) {
  const modal = $("#modal");
  const fields = $("#varFields");
  fields.innerHTML = "";

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const row = document.createElement("div");
    row.className = "varRow";

    const key = document.createElement("div");
    key.className = "varKey";
    key.textContent = k;

    const input = document.createElement("input");
    input.className = "varInput";
    input.placeholder = `{{${k}}}`;
    input.dataset.key = k;
    if (Object.prototype.hasOwnProperty.call(state.variables, k)) input.value = state.variables[k] || "";

    row.appendChild(key);
    row.appendChild(input);
    fields.appendChild(row);

    if (i === 0) setTimeout(() => input.focus(), 0);
  }

  modal.style.display = "block";
}

function closeModal() {
  $("#modal").style.display = "none";
  state.pendingInsert = null;
}

async function submitModalAndInsert() {
  if (!state.pendingInsert) return;

  const inputs = Array.from(document.querySelectorAll("#varFields input.varInput"));
  const user = {};
  for (const inp of inputs) user[inp.dataset.key] = inp.value || "";

  const { snippet, builtins } = state.pendingInsert;
  const values = { ...builtins, ...state.variables, ...user };
  const text = applyTemplate(snippet.content || "", values, "empty");

  closeModal();
  await doInsertText(snippet, text);
}

// ===== Variables UI =====
function renderVariables() {
  const list = $("#varList");
  list.innerHTML = "";

  const entries = Object.entries(state.variables).sort((a,b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "no registered variables. please add them above.";
    list.appendChild(empty);
    return;
  }

  for (const [k,v] of entries) {
    const card = document.createElement("div");
    card.className = "varItem";

    const top = document.createElement("div");
    top.className = "varItemTop";

    const key = document.createElement("div");
    key.className = "varKeyText";
    key.textContent = k;

    const btns = document.createElement("div");
    btns.className = "varBtns";

    const edit = document.createElement("button");
    edit.className = "smallBtn";
    edit.textContent = "edit";
    edit.addEventListener("click", () => {
      $("#varKey").value = k;
      $("#varValue").value = v || "";
      $("#varKey").focus();
    });

    const del = document.createElement("button");
    del.className = "smallBtn";
    del.textContent = "delete";
    del.addEventListener("click", async () => {
      if (!confirm(`are you sure you want to delete the variable "${k}"?`)) return;
      delete state.variables[k];
      await persistVariables();
      renderVariables();
      renderAll();
    });

    btns.appendChild(edit);
    btns.appendChild(del);

    top.appendChild(key);
    top.appendChild(btns);

    const val = document.createElement("div");
    val.className = "varValText";
    val.textContent = v || "";

    card.appendChild(top);
    card.appendChild(val);

    list.appendChild(card);
  }
}

// ===== Import/Export =====
async function onExport() {
  const data = await chrome.storage.local.get({ snippets: [], variables: {}, settings: { theme: "dark" } });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "today-snippet-backup.json";
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const txt = await file.text();
    const json = JSON.parse(txt);

    const snippets = normalizeSnippets(Array.isArray(json.snippets) ? json.snippets : []);
    const variables = (json.variables && typeof json.variables === "object") ? json.variables : {};
    const settings = json.settings || state.settings;

    if (!confirm(`if you import, the current snippets will be changed to ${snippets.length}. do you want to proceed?`)) return;

    state.snippets = snippets;
    state.variables = variables;
    state.settings = settings;

    await chrome.storage.local.set({ snippets, variables, settings });

    const importedTheme = normalizeTheme(state.settings.theme);
    state.settings.theme = importedTheme;
    $("#theme").value = importedTheme;
    applyTheme(importedTheme);

    state.editingId = firstSnippetId() || null;
    fillForm(getEditingSnippet() || blankSnippet());
    renderAll();
  } catch {
    alert("import failed: please check the JSON file.");
  } finally {
    $("#filePicker").value = "";
  }
}

// ===== Demo =====
function makeDemoSnippets() {
  const now = Date.now();
  const mk = (title, content, tags = [], pinned = false) => ({
    id: crypto.randomUUID ? crypto.randomUUID() : String(now) + "-" + Math.random().toString(16).slice(2),
    title,
    content,
    tags,
    enabled: true,
    pinned,
    order: 0,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now
  });

  const snippets = [
    mk("CS: 환불 안내",
      "안녕하세요 {{name}}님,\n\n요청하신 환불 절차 안내드립니다.\n- 처리 소요: 영업일 기준 3~5일\n- 확인 항목: 주문번호, 결제수단\n\n추가로 확인이 필요하면 말씀해 주세요.\n\n감사합니다.\n({{date}})",
      ["CS","환불","FAQ"],
      true
    ),
    mk("메일: 회신(확인 중)",
      "안녕하세요.\n말씀 주신 내용은 확인 중이며, 확인되는 즉시 다시 안내드리겠습니다.\n\n감사합니다.\n—\n{{company}} / {{date}} {{time}}",
      ["메일","회신"]
    ),
    mk("Jira: 재현 요청",
      "재현을 위해 아래 정보를 부탁드립니다.\n1) 발생 시각(대략)\n2) 사용자/매장/주문번호\n3) 스크린샷 또는 영상\n4) 재현 스텝\n\n감사합니다.",
      ["Jira","버그"]
    ),
    mk("서명",
      "감사합니다.\n{{name}} 드림\n(문의: {{phone_number}})",
      ["서명"]
    )
  ];

  const pinned = snippets.filter(s => s.pinned);
  const normal = snippets.filter(s => !s.pinned);
  pinned.forEach((s,i) => s.order = i);
  normal.forEach((s,i) => s.order = i);
  return pinned.concat(normal);
}
