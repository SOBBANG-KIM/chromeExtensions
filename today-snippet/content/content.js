  // content/content.js
  // 인페이지 오버레이 팔레트(커맨드 팔레트) + 입력칸 삽입 로직
  // NOTE: 요청사항에 따라 "스코프/도메인 제한" 로직은 제거했습니다.

  (() => {
    if (window.__TODAY_SNIPPET__) return;
    window.__TODAY_SNIPPET__ = true;

    const state = {
      isOpen: false,
      host: null,
      root: null,
      lastFocusEl: null,
      lastSelectionText: "",
      snippets: [],
      filtered: [],
      cursor: 0,
      theme: "dark",
      variables: null,
      userVars: {}
    };

    // ====== Focus/Selection tracking (for Side Panel insertion) ======
    document.addEventListener("focusin", (e) => {
      const el = e.target;
      if (!el) return;
      if (isTextLikeInput(el) || isTextArea(el) || isContentEditable(el)) {
        state.lastFocusEl = el;
      }
    }, true);

    const updateSelection = () => { state.lastSelectionText = captureSelectionText(); };
    document.addEventListener("mouseup", updateSelection, true);
    document.addEventListener("keyup", updateSelection, true);

    // ====== Message handlers ======
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      (async () => {
        if (!msg?.type) return;

        if (msg.type === "TS_TOGGLE_PALETTE") {
          await togglePalette();
          return;
        }

        if (msg.type === "TS_GET_CONTEXT") {
          sendResponse({
            ok: true,
            context: {
              url: location.href,
              title: document.title,
              hostname: location.hostname,
              selectedText: state.lastSelectionText || ""
            }
          });
          return;
        }

        if (msg.type === "TS_INSERT_TEXT") {
          const text = String(msg.text ?? "");
          const snippetId = msg.snippetId ? String(msg.snippetId) : null;

          const ok = insertIntoBestTarget(text);
          if (!ok) {
            toast("입력 가능한 영역을 찾지 못했어요. 페이지에서 입력칸을 클릭한 뒤 다시 시도해 주세요.");
            sendResponse({ ok: false, reason: "no_target" });
            return;
          }

          if (snippetId) await bumpUsage(snippetId);
          sendResponse({ ok: true });
          return;
        }
      })();

      return true;
    });

    // ====== Palette open/close ======
    async function togglePalette() {
      if (state.isOpen) closePalette();
      else await openPalette();
    }

    function nowISODate() {
      return new Date().toISOString().slice(0, 10);
    }
    function nowTimeHHMM() {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }

    function captureSelectionText() {
      try {
        const s = window.getSelection();
        return (s && s.toString()) ? s.toString() : "";
      } catch {
        return "";
      }
    }

    async function openPalette() {
      const ae = document.activeElement;
      if (ae && (isTextLikeInput(ae) || isTextArea(ae) || isContentEditable(ae))) {
        state.lastFocusEl = ae;
      }
      state.lastSelectionText = captureSelectionText();

      await loadSettingsAndSnippets();
      buildUIIfNeeded();
      applyTheme();

      state.isOpen = true;
      state.variables = null;
      updateMode("palette");

      showHost(true);
      const input = qs("#ts-q");
      input.value = "";
      input.focus();
      filterAndRender("");
      bindGlobalKeys(true);
    }

    function closePalette() {
      state.isOpen = false;
      state.variables = null;
      bindGlobalKeys(false);
      showHost(false);

      try { state.lastFocusEl?.focus?.(); } catch {}
    }

    function buildUIIfNeeded() {
      if (state.host) return;

      const host = document.createElement("div");
      host.id = "today-snippet-host";
      host.style.position = "fixed";
      host.style.inset = "0";
      host.style.zIndex = "2147483647";
      host.style.display = "none";
      host.style.pointerEvents = "none";
      document.documentElement.appendChild(host);

      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = templateHTML();

      state.host = host;
      state.root = root;

      qs("#ts-backdrop").addEventListener("click", closePalette);
      qs("#ts-close").addEventListener("click", closePalette);

      qs("#ts-clear").addEventListener("click", () => {
        const input = qs("#ts-q");
        input.value = "";
        input.focus();
        filterAndRender("");
      });

      qs("#ts-q").addEventListener("input", (e) => filterAndRender(e.target.value));

      qs("#ts-q").addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); moveCursor(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); moveCursor(-1); }
        else if (e.key === "Enter") { e.preventDefault(); chooseCurrent(); }
        else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
      });

      qs("#ts-var-cancel").addEventListener("click", () => {
        state.variables = null;
        updateMode("palette");
        qs("#ts-q").focus();
      });

      qs("#ts-var-ok").addEventListener("click", async () => {
        await submitVariablesAndInsert();
      });

      qs("#ts-var-form").addEventListener("keydown", async (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          state.variables = null;
          updateMode("palette");
          qs("#ts-q").focus();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          await submitVariablesAndInsert();
        }
      });
    }

    function showHost(show) {
      state.host.style.display = show ? "block" : "none";
      state.host.style.pointerEvents = show ? "auto" : "none";
    }

    function bindGlobalKeys(on) {
      if (on) document.addEventListener("keydown", onGlobalKeyDown, true);
      else document.removeEventListener("keydown", onGlobalKeyDown, true);
    }

    function onGlobalKeyDown(e) {
      if (!state.isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
      }
    }

    // ====== Load snippets ======
    async function loadSettingsAndSnippets() {
      const data = await chrome.storage.local.get({
        snippets: [],
        variables: {},
        settings: { theme: "dark" }
      });
      state.theme = normalizeTheme(data.settings?.theme);
      state.userVars = (data.variables && typeof data.variables === "object") ? data.variables : {};

      const all = Array.isArray(data.snippets) ? data.snippets : [];
      state.snippets = all
        .filter(s => s && s.enabled !== false)
        .sort((a,b) => (b.lastUsedAt||0) - (a.lastUsedAt||0) || (b.usageCount||0) - (a.usageCount||0));
    }

    const THEME_SET = new Set(["dark","light","purple","blue","teal","green","orange","pink","magenta"]);

    function normalizeTheme(theme) {
      if (!theme || theme === "system") {
        return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
      }
      return THEME_SET.has(theme) ? theme : "dark";
    }

    function applyTheme() {
      qs("#ts-wrap").dataset.theme = normalizeTheme(state.theme);
    }

    function filterAndRender(q) {
      const query = (q || "").trim().toLowerCase();

      state.filtered = state.snippets.filter(s => {
        if (!query) return true;
        const hay = [s.title || "", (s.tags || []).join(","), s.content || ""].join(" ").toLowerCase();
        return hay.includes(query);
      });

      state.cursor = 0;
      renderList();
      renderPreview();
    }

    function moveCursor(delta) {
      if (state.filtered.length === 0) return;
      state.cursor = clamp(state.cursor + delta, 0, state.filtered.length - 1);
      renderList();
      renderPreview();
      scrollIntoViewIfNeeded();
    }

    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

    function scrollIntoViewIfNeeded() {
      const list = qs("#ts-items");
      const active = list.querySelector('[data-active="true"]');
      if (!active) return;
      const r = active.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      if (r.top < lr.top) active.scrollIntoView({ block: "nearest" });
      else if (r.bottom > lr.bottom) active.scrollIntoView({ block: "nearest" });
    }

    function renderList() {
      const list = qs("#ts-items");
      list.innerHTML = "";
      const items = state.filtered;

      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "검색 결과가 없습니다.";
        list.appendChild(empty);
        return;
      }

      items.forEach((s, idx) => {
        const row = document.createElement("div");
        row.className = "item";
        row.dataset.index = String(idx);
        row.dataset.active = (idx === state.cursor) ? "true" : "false";

        row.addEventListener("mouseenter", () => {
          state.cursor = idx;
          renderList();
          renderPreview();
        });
        row.addEventListener("click", () => {
          state.cursor = idx;
          chooseCurrent();
        });

        const title = document.createElement("div");
        title.className = "itemTitle";
        title.textContent = s.title || "(제목 없음)";

        const meta = document.createElement("div");
        meta.className = "itemMeta";
        const tags = (s.tags && s.tags.length) ? `#${s.tags.join(" #")}` : "";
        const stat = (s.usageCount || 0) ? ` · ${(s.usageCount||0)}회` : "";
        meta.textContent = `${tags}${stat}`.trim();

        row.appendChild(title);
        row.appendChild(meta);
        list.appendChild(row);
      });
    }

    function renderPreview() {
      const box = qs("#ts-preview");
      const s = state.filtered[state.cursor];
      if (!s) { box.textContent = ""; return; }
      const txt = (s.content || "");
      box.textContent = txt.length > 800 ? (txt.slice(0, 800) + "\n…") : txt;
    }

    // ====== Choose & variable prompt ======
    async function chooseCurrent() {
      const s = state.filtered[state.cursor];
      if (!s) return;

      const vars = extractVariables(s.content || "");
      const builtins = getBuiltinVarSet();
      const unknown = vars.filter(v => !builtins.has(v) && !(v in (state.userVars || {})));

      if (unknown.length > 0) {
        state.variables = { snippet: s, missingKeys: unknown, values: new Map() };
        showVariableForm(unknown);
        updateMode("vars");
        return;
      }

      await insertSnippetFromPalette(s, new Map());
    }

    function extractVariables(content) {
      const set = new Set();
      const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
      let m;
      while ((m = re.exec(content)) !== null) set.add(m[1]);
      return Array.from(set);
    }

    function getBuiltinVarSet() {
      return new Set(["date", "time", "datetime", "clipboard", "selectedText", "url", "title", "hostname"]);
    }

    function showVariableForm(keys) {
      const container = qs("#ts-var-fields");
      container.innerHTML = "";
      keys.forEach((k, idx) => {
        const row = document.createElement("div");
        row.className = "fieldRow";

        const label = document.createElement("label");
        label.className = "fieldLabel";
        label.textContent = k;

        const input = document.createElement("input");
        input.className = "fieldInput";
        input.placeholder = `{{${k}}}`;
        input.dataset.key = k;

        row.appendChild(label);
        row.appendChild(input);
        container.appendChild(row);

        if (idx === 0) setTimeout(() => input.focus(), 0);
      });
      qs("#ts-var-hint").textContent = "Ctrl/Cmd + Enter로 바로 삽입할 수 있어요.";
    }

    async function submitVariablesAndInsert() {
      if (!state.variables) return;
      const inputs = Array.from(qsa("#ts-var-fields input.fieldInput"));
      const values = new Map();
      inputs.forEach(inp => values.set(inp.dataset.key, inp.value || ""));
      await insertSnippetFromPalette(state.variables.snippet, values);
      state.variables = null;
    }

    async function insertSnippetFromPalette(snippet, userValuesMap) {
      const expanded = await expandTemplate(snippet.content || "", userValuesMap);
      const ok = insertIntoBestTarget(expanded);
      if (!ok) { toast("입력 가능한 영역을 찾지 못했어요. 입력칸을 클릭한 뒤 다시 시도해 주세요."); return; }
      await bumpUsage(snippet.id);
      closePalette();
    }

    async function expandTemplate(content, userValuesMap) {
      const vars = extractVariables(content);
      const builtins = getBuiltinVarSet();
      const built = await getBuiltinValues();

      const map = new Map();
      userValuesMap?.forEach((v,k) => map.set(k, v));
      vars.forEach(k => { if (builtins.has(k) && !map.has(k)) map.set(k, built[k] ?? ""); });
      // user variables from storage
      vars.forEach(k => { if (!(builtins.has(k)) && (state.userVars && Object.prototype.hasOwnProperty.call(state.userVars, k)) && !map.has(k)) map.set(k, state.userVars[k] ?? ""); });
      vars.forEach(k => { if (!map.has(k)) map.set(k, ""); });

      return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const v = map.get(key);
        return (v === undefined || v === null) ? "" : String(v);
      });
    }

    async function getBuiltinValues() {
      const date = nowISODate();
      const time = nowTimeHHMM();
      const datetime = `${date} ${time}`;

      let clipboard = "";
      try { clipboard = await navigator.clipboard.readText(); } catch {}

      return {
        date, time, datetime,
        clipboard,
        selectedText: state.lastSelectionText || "",
        url: location.href,
        title: document.title,
        hostname: location.hostname
      };
    }

    // ====== Insertion engine (shared: palette + side panel) ======
    function insertIntoBestTarget(text) {
      const preferred = state.lastFocusEl;
      if (preferred && tryInsert(preferred, text)) return true;

      const ae = document.activeElement;
      if (ae && tryInsert(ae, text)) return true;

      return false;
    }

    function tryInsert(el, text) {
      if (!el) return false;
      if (isTextArea(el) || isTextLikeInput(el)) return insertIntoInput(el, text);
      if (isContentEditable(el)) return insertIntoContentEditable(el, text);
      return false;
    }

    function isTextArea(el) { return el?.tagName === "TEXTAREA"; }

    function isTextLikeInput(el) {
      if (!el || el.tagName !== "INPUT") return false;
      const t = (el.type || "text").toLowerCase();
      return ["text","search","email","url","tel","password"].includes(t);
    }

    function insertIntoInput(input, text) {
      try {
        input.focus();
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.setRangeText(text, start, end, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      } catch {
        try {
          input.value = (input.value || "") + text;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        } catch { return false; }
      }
    }

    function isContentEditable(el) {
      try { return el.isContentEditable || el.getAttribute?.("contenteditable") === "true"; }
      catch { return false; }
    }

    function insertIntoContentEditable(el, text) {
      try {
        el.focus();
        const ok = document.execCommand && document.execCommand("insertText", false, text);
        if (ok) return true;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;

        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);

        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
        return true;
      } catch { return false; }
    }

    async function bumpUsage(id) {
      if (!id) return;
      const data = await chrome.storage.local.get({ snippets: [] });
      const snippets = Array.isArray(data.snippets) ? data.snippets : [];
      const idx = snippets.findIndex(s => s.id === id);
      if (idx < 0) return;

      const now = Date.now();
      const prev = snippets[idx];
      snippets[idx] = { ...prev, usageCount: (prev.usageCount || 0) + 1, lastUsedAt: now, updatedAt: now };
      await chrome.storage.local.set({ snippets });
    }

    function updateMode(mode) {
      qs("#ts-palette").style.display = (mode === "palette") ? "block" : "none";
      qs("#ts-vars").style.display = (mode === "vars") ? "block" : "none";
    }

    function toast(message) {
      if (!state.root) { console.warn("[today-snippet]", message); return; }
      const el = qs("#ts-toast");
      el.textContent = message;
      el.style.opacity = "1";
      setTimeout(() => { el.style.opacity = "0"; }, 2200);
    }

    function qs(sel) { return state.root.querySelector(sel); }
    function qsa(sel) { return Array.from(state.root.querySelectorAll(sel)); }

    // ====== UI template ======
    function templateHTML() {
      return `
  <style>
    :host { all: initial; }
    #ts-wrap{
      position: fixed;
      inset: 0;
      display: block;
      pointer-events: auto;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Apple SD Gothic Neo", "Noto Sans KR";
    }

    #ts-wrap[data-theme="dark"]{
      --bg: #0b0b0f;
      --card: #12121a;
      --muted: #a7a7b3;
      --text: #e8e8ef;
      --line: rgba(255,255,255,0.08);
      --accent: #5b8cff;
      --accentBg: rgba(91,140,255,0.12);
      --overlay: rgba(0,0,0,0.55);
    }
    #ts-wrap[data-theme="light"]{
      --bg: #f6f7fb;
      --card: #ffffff;
      --muted: #5b5f6b;
      --text: #12131a;
      --line: rgba(10,10,10,0.10);
      --accent: #2b63ff;
      --accentBg: rgba(43,99,255,0.10);
      --overlay: rgba(10,10,10,0.22);
    }
    #ts-wrap[data-theme="purple"]{
      --bg: #0f0b15;
      --card: #1a1325;
      --muted: #b8a7c3;
      --text: #e8dff0;
      --line: rgba(255,255,255,0.08);
      --accent: #a855f7;
      --accentBg: rgba(168,85,247,0.15);
      --overlay: rgba(0,0,0,0.55);
    }
    #ts-wrap[data-theme="blue"]{
      --bg: #0b0f15;
      --card: #121825;
      --muted: #a7b8c3;
      --text: #dfe8f0;
      --line: rgba(255,255,255,0.08);
      --accent: #3b82f6;
      --accentBg: rgba(59,130,246,0.15);
      --overlay: rgba(0,0,0,0.55);
    }
    #ts-wrap[data-theme="teal"]{
      --bg: #0b1515;
      --card: #122525;
      --muted: #a7c3c3;
      --text: #dff0f0;
      --line: rgba(255,255,255,0.08);
      --accent: #14b8a6;
      --accentBg: rgba(20,184,166,0.15);
      --overlay: rgba(0,0,0,0.55);
    }
    #ts-wrap[data-theme="green"]{
      --bg: #0b150f;
      --card: #122518;
      --muted: #a7c3b8;
      --text: #dff0e8;
      --line: rgba(255,255,255,0.08);
      --accent: #22c55e;
      --accentBg: rgba(34,197,94,0.15);
      --overlay: rgba(0,0,0,0.55);
    }
    #ts-wrap[data-theme="orange"]{
      --bg: #15100b;
      --card: #251812;
      --muted: #c3b8a7;
      --text: #f0e8df;
      --line: rgba(255,255,255,0.08);
      --accent: #f97316;
      --accentBg: rgba(249,115,22,0.15);
      --overlay: rgba(0,0,0,0.55);
    }
    #ts-wrap[data-theme="pink"]{
      --bg: #150b12;
      --card: #251218;
      --muted: #c3a7b8;
      --text: #f0dfe8;
      --line: rgba(255,255,255,0.08);
      --accent: #ec4899;
      --accentBg: rgba(236,72,153,0.15);
      --overlay: rgba(0,0,0,0.55);
    }
    #ts-wrap[data-theme="magenta"]{
      --bg: #150b15;
      --card: #251225;
      --muted: #c3a7c3;
      --text: #f0dff0;
      --line: rgba(255,255,255,0.08);
      --accent: #d946ef;
      --accentBg: rgba(217,70,239,0.15);
      --overlay: rgba(0,0,0,0.55);
    }

    #ts-backdrop{ position: fixed; inset: 0; background: var(--overlay); }

    #ts-card{
      position: fixed;
      left: 50%;
      top: 14%;
      transform: translateX(-50%);
      width: min(900px, calc(100vw - 24px));
      border: 1px solid var(--line);
      border-radius: 18px;
      background: color-mix(in srgb, var(--card) 92%, transparent);
      backdrop-filter: blur(10px);
      overflow: hidden;
      box-shadow: 0 12px 48px rgba(0,0,0,0.35);
    }

    .top{ display:flex; align-items:center; gap: 8px; padding: 12px; border-bottom: 1px solid var(--line); }
    .qWrap{ position: relative; flex: 1; }
    .q{
      width: 100%;
      padding: 12px 40px 12px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--card);
      color: var(--text);
      outline: none;
      font-size: 14px;
    }
    .iconBtn{
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 28px; height: 28px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      display:grid; place-items:center;
      font-size: 16px;
    }
    .iconBtn:hover{ color: var(--text); }

    .btn{
      border: 1px solid var(--line);
      background: transparent;
      color: var(--muted);
      border-radius: 12px;
      padding: 10px 10px;
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
    }
    .btn:hover{ color: var(--text); }

    .body{ display:grid; grid-template-columns: 360px 1fr; min-height: 420px; }
    .left{ border-right: 1px solid var(--line); max-height: 520px; overflow: auto; }
    .right{ padding: 12px; max-height: 520px; overflow: auto; }

    .item{ padding: 10px 12px; border-bottom: 1px solid var(--line); cursor: pointer; }
    .item[data-active="true"]{
      background: var(--accentBg);
      outline: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
      outline-offset: -1px;
    }
    .item:hover{ background: rgba(255,255,255,0.04); }
    #ts-wrap[data-theme="light"] .item:hover{ background: rgba(10,10,10,0.04); }

    .itemTitle{
      font-size: 13px;
      font-weight: 750;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .itemMeta{
      margin-top: 6px;
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty{ padding: 16px 12px; color: var(--muted); font-size: 12px; }

    .preview{
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.45;
      color: var(--text);
    }

    .footer{
      padding: 10px 12px;
      border-top: 1px solid var(--line);
      display:flex;
      justify-content: space-between;
      align-items:center;
      color: var(--muted);
      font-size: 12px;
    }

    /* Vars mode */
    .varsWrap{ padding: 12px; }
    .varsTitle{ font-weight: 800; font-size: 14px; margin-bottom: 8px; color: var(--text); }
    .varsHint{ color: var(--muted); font-size: 12px; margin-bottom: 12px; line-height: 1.35; }
    .fieldRow{
      display:grid;
      grid-template-columns: 160px 1fr;
      gap: 10px;
      align-items:center;
      margin-bottom: 10px;
    }
    .fieldLabel{ color: var(--muted); font-size: 12px; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fieldInput{
      width: 100%;
      padding: 10px 10px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--card);
      color: var(--text);
      outline:none;
      font-size: 13px;
    }
    .varsActions{ display:flex; gap: 8px; justify-content:flex-end; margin-top: 12px; }
    .primary{
      border-color: color-mix(in srgb, var(--accent) 45%, transparent);
      background: var(--accentBg);
      color: var(--text);
    }

    #ts-toast{
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      background: color-mix(in srgb, var(--card) 92%, transparent);
      border: 1px solid var(--line);
      color: var(--text);
      padding: 10px 12px;
      border-radius: 999px;
      font-size: 12px;
      opacity: 0;
      transition: opacity 180ms ease;
      pointer-events: none;
      max-width: min(90vw, 900px);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (max-width: 720px){
      .body{ grid-template-columns: 1fr; }
      .left{ border-right:none; border-bottom: 1px solid var(--line); max-height: 260px; }
      .right{ max-height: 260px; }
      .fieldRow{ grid-template-columns: 1fr; }
    }
  </style>

  <div id="ts-wrap" data-theme="dark">
    <div id="ts-backdrop"></div>

    <div id="ts-card" role="dialog" aria-modal="true">
      <div id="ts-palette">
        <div class="top">
          <div class="qWrap">
            <input id="ts-q" class="q" placeholder="스니펫 검색… (↑↓ 이동, Enter 삽입, Esc 닫기)" />
            <button id="ts-clear" class="iconBtn" title="Clear" aria-label="Clear">×</button>
          </div>
          <button id="ts-close" class="btn" title="Close">Esc</button>
        </div>

        <div class="body">
          <div class="left" id="ts-items"></div>
          <div class="right">
            <div class="preview" id="ts-preview"></div>
          </div>
        </div>

        <div class="footer">
          <div>Today Snippet</div>
          <div>Ctrl/Cmd+Shift+K</div>
        </div>
      </div>

      <div id="ts-vars" style="display:none;">
        <div class="top">
          <div style="font-weight:800;color:var(--text);">변수 입력</div>
          <div style="flex:1;"></div>
          <button id="ts-close" class="btn" title="Close">Esc</button>
        </div>

        <div class="varsWrap" id="ts-var-form">
          <div class="varsTitle">필수 변수를 입력해 주세요</div>
          <div class="varsHint" id="ts-var-hint"></div>
          <div id="ts-var-fields"></div>
          <div class="varsActions">
            <button class="btn" id="ts-var-cancel">Back</button>
            <button class="btn primary" id="ts-var-ok">Insert (Ctrl/Cmd+Enter)</button>
          </div>
        </div>
      </div>
    </div>

    <div id="ts-toast"></div>
  </div>
      `;
    }
  })();
