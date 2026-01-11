// sidepanel.js
const $ = (sel) => document.querySelector(sel);

const state = {
  windowId: null,
  tabs: [],
  groups: [],
  collapsed: new Set(),      // "group:ID" or "domain:xxx"
  selected: new Set(),       // tabIds
  search: "",
  draggingTabId: null,
  theme: "dark"              // "dark" | "light"
};

init();

async function init() {
  const win = await chrome.windows.getCurrent();
  state.windowId = win.id;

  // theme load
  const saved = await chrome.storage.local.get(["theme"]);
  state.theme = saved.theme === "light" ? "light" : "dark";
  applyTheme();

  $("#themeToggle").addEventListener("click", async () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    await chrome.storage.local.set({ theme: state.theme });
  });

  $("#search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  });

  $("#clearSearch").addEventListener("click", () => {
    $("#search").value = "";
    state.search = "";
    render();
    $("#search").focus();
  });

  $("#refresh").addEventListener("click", async () => {
    await load();
    render();
  });

  $("#sortDomain").addEventListener("click", async () => {
    await load();
    await sortUngroupedByDomainOnce();
    await load();
    render();
  });

  $("#makeGroup").addEventListener("click", async () => {
    await makeGroupFromSelected();
    await load();
    render();
  });

  await load();
  render();

  // 탭/그룹 변화 감지(사이드 패널 열려있는 동안 UI 자동 갱신)
  chrome.tabs.onCreated.addListener(onTabsChanged);
  chrome.tabs.onRemoved.addListener(onTabsChanged);
  chrome.tabs.onUpdated.addListener(onTabsChanged);
  chrome.tabs.onMoved.addListener(onTabsChanged);
  chrome.tabs.onActivated.addListener(onTabsChanged);
  chrome.tabGroups.onUpdated.addListener(onTabsChanged);
  chrome.tabGroups.onRemoved.addListener(onTabsChanged);
}

function applyTheme() {
  document.body.dataset.theme = state.theme;
  const themeBtn = $("#themeToggle");
  if (themeBtn) {
    themeBtn.textContent = state.theme === "dark" ? "Dark" : "Light";
  }
}

let tabsChangedTimer = null;
function onTabsChanged() {
  clearTimeout(tabsChangedTimer);
  tabsChangedTimer = setTimeout(async () => {
    await load();
    render();
  }, 120);
}

async function load() {
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({ windowId: state.windowId }),
    chrome.tabGroups.query({ windowId: state.windowId })
  ]);

  state.tabs = tabs.sort((a, b) => a.index - b.index);
  state.groups = groups;
}

function normalizeDomain(url) {
  if (!url) return "__other__";
  try {
    const u = new URL(url);
    return (u.hostname || u.protocol.replace(":", "") || "__other__").toLowerCase();
  } catch {
    return "__other__";
  }
}

function matchesSearch(tab, groupTitle, domainKey) {
  if (!state.search) return true;
  const hay = [
    tab.title || "",
    tab.url || "",
    domainKey || "",
    groupTitle || ""
  ].join(" ").toLowerCase();
  return hay.includes(state.search);
}

function getGroup(groupId) {
  return state.groups.find(x => x.id === groupId);
}

function getGroupTitle(groupId) {
  return getGroup(groupId)?.title || `Group ${groupId}`;
}

function sectionKeyForGroup(groupId) { return `group:${groupId}`; }
function sectionKeyForDomain(domain) { return `domain:${domain}`; }

function isCollapsed(sectionKey) { return state.collapsed.has(sectionKey); }

function toggleCollapse(sectionKey) {
  if (state.collapsed.has(sectionKey)) state.collapsed.delete(sectionKey);
  else state.collapsed.add(sectionKey);
}

function safeId(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function render() {
  const list = $("#list");
  list.innerHTML = "";

  // === Group overview (요약 리스트 + ungroup) ===
  list.appendChild(renderGroupOverview());

  // 1) 그룹 섹션(탭 인덱스 순)
  const groupIdsInOrder = [];
  for (const t of state.tabs) {
    if (t.groupId !== -1 && !groupIdsInOrder.includes(t.groupId)) groupIdsInOrder.push(t.groupId);
  }

  for (const gid of groupIdsInOrder) {
    const g = getGroup(gid);
    const groupTitle = g?.title || `Group ${gid}`;
    const groupTabs = state.tabs.filter(t => t.groupId === gid);
    const visibleTabs = groupTabs.filter(t => matchesSearch(t, groupTitle, ""));

    if (state.search && visibleTabs.length === 0) continue;

    list.appendChild(renderSection({
      id: `sec-group-${gid}`,
      key: sectionKeyForGroup(gid),
      title: groupTitle,
      badge: `${visibleTabs.length}/${groupTabs.length}`,
      subtitle: `tab-group • ${g?.color || "grey"}`,
      showSelectAll: false,
      onSelectAll: null,
      selectAllChecked: false,
      onDropHeader: async (tabId) => {
        // 그룹 헤더로 드롭하면 이 그룹으로 편입
        await chrome.tabs.group({ tabIds: [tabId], groupId: gid });
        await load();
        render();
      },
      headerExtraButtons: [
        {
          text: "Ungroup",
          className: "danger",
          onClick: async () => {
            await ungroupByGroupId(gid);
            await load();
            render();
          }
        }
      ],
      items: isCollapsed(sectionKeyForGroup(gid)) ? [] : visibleTabs
    }));
  }

  // 2) ungrouped 탭을 domain 버킷으로
  const ungrouped = state.tabs.filter(t => t.groupId === -1);
  const domainBuckets = new Map();
  for (const t of ungrouped) {
    const d = normalizeDomain(t.url);
    if (!domainBuckets.has(d)) domainBuckets.set(d, []);
    domainBuckets.get(d).push(t);
  }

  const domainsSorted = [...domainBuckets.keys()].sort((a, b) => a.localeCompare(b));

  for (const domain of domainsSorted) {
    const sectionKey = sectionKeyForDomain(domain);
    const domainTabs = domainBuckets.get(domain);
    const visibleTabs = domainTabs.filter(t => matchesSearch(t, "", domain));
    if (state.search && visibleTabs.length === 0) continue;

    const allVisibleIds = visibleTabs.map(t => t.id);
    const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => state.selected.has(id));
    const anySelected = allVisibleIds.some(id => state.selected.has(id));

    list.appendChild(renderSection({
      id: `sec-domain-${safeId(domain)}`,
      key: sectionKey,
      title: domain,
      badge: `${visibleTabs.length}/${domainTabs.length}`,
      subtitle: `domain bucket`,
      showSelectAll: true,
      selectAllChecked: allSelected,
      selectAllIndeterminate: !allSelected && anySelected,
      onSelectAll: (checked) => {
        if (checked) {
          for (const id of allVisibleIds) state.selected.add(id);
        } else {
          for (const id of allVisibleIds) state.selected.delete(id);
        }
        // 체크박스 UI만 갱신하면 되지만 간단히 전체 렌더
        render();
      },
      onDropHeader: async (_tabId) => {
        // 도메인 헤더 드롭은 현재 동작 없음
      },
      headerExtraButtons: [],
      items: isCollapsed(sectionKey) ? [] : visibleTabs
    }));
  }
}

function renderGroupOverview() {
  const wrap = document.createElement("div");
  wrap.className = "groupOverview";

  const header = document.createElement("div");
  header.className = "groupOverviewHeader";
  header.innerHTML = `<span>Tab Groups</span><span class="badge">${state.groups.length}</span>`;

  const chips = document.createElement("div");
  chips.className = "groupChips";

  const groupIdsInOrder = [];
  for (const t of state.tabs) {
    if (t.groupId !== -1 && !groupIdsInOrder.includes(t.groupId)) groupIdsInOrder.push(t.groupId);
  }

  if (groupIdsInOrder.length === 0) {
    const empty = document.createElement("div");
    empty.style.padding = "10px";
    empty.style.color = "var(--muted)";
    empty.style.fontSize = "12px";
    empty.textContent = "현재 탭 그룹이 없습니다.";
    wrap.appendChild(header);
    wrap.appendChild(empty);
    return wrap;
  }

  for (const gid of groupIdsInOrder) {
    const g = getGroup(gid);
    const title = g?.title || `Group ${gid}`;
    const count = state.tabs.filter(t => t.groupId === gid).length;

    // 검색 걸려있으면, 그룹명/그룹 탭이 하나라도 매칭일 때만 표시
    if (state.search) {
      const groupTabs = state.tabs.filter(t => t.groupId === gid);
      const anyMatch = groupTabs.some(t => matchesSearch(t, title, ""));
      const titleMatch = title.toLowerCase().includes(state.search);
      if (!anyMatch && !titleMatch) continue;
    }

    const chip = document.createElement("div");
    chip.className = "chip";

    const chipTitle = document.createElement("div");
    chipTitle.className = "chipTitle";
    chipTitle.textContent = title;

    const chipCount = document.createElement("div");
    chipCount.className = "chipCount";
    chipCount.textContent = String(count);

    const ungroupBtn = document.createElement("button");
    ungroupBtn.className = "chipBtn";
    ungroupBtn.textContent = "Ungroup";
    ungroupBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await ungroupByGroupId(gid);
      await load();
      render();
    });

    chip.appendChild(chipTitle);
    chip.appendChild(chipCount);
    chip.appendChild(ungroupBtn);

    chip.addEventListener("click", () => {
      // 해당 그룹 섹션으로 스크롤 & 펼치기
      const key = sectionKeyForGroup(gid);
      state.collapsed.delete(key);
      render();
      setTimeout(() => {
        document.getElementById(`sec-group-${gid}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    });

    chips.appendChild(chip);
  }

  wrap.appendChild(header);
  wrap.appendChild(chips);
  return wrap;
}

function renderSection({
  id, key, title, badge, subtitle,
  showSelectAll, selectAllChecked, selectAllIndeterminate, onSelectAll,
  onDropHeader,
  headerExtraButtons,
  items
}) {
  const section = document.createElement("div");
  section.className = "section";
  section.id = id;

  const header = document.createElement("div");
  header.className = "sectionHeader";
  header.dataset.sectionKey = key;

  header.addEventListener("dragover", (e) => {
    e.preventDefault();
    header.classList.add("dropTarget");
  });
  header.addEventListener("dragleave", () => header.classList.remove("dropTarget"));
  header.addEventListener("drop", async (e) => {
    e.preventDefault();
    header.classList.remove("dropTarget");
    const tabId = Number(e.dataTransfer.getData("text/tabId"));
    if (!Number.isFinite(tabId)) return;
    await onDropHeader(tabId);
  });

  const left = document.createElement("div");
  left.className = "sectionHeaderLeft";

  // Select-all (only for domain buckets)
  if (showSelectAll) {
    const label = document.createElement("label");
    label.className = "selectAll";
    label.title = "이 도메인 섹션의 표시된 탭 전체 선택/해제";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!selectAllChecked;
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => onSelectAll?.(cb.checked));

    // indeterminate는 property로만 설정 가능
    setTimeout(() => { cb.indeterminate = !!selectAllIndeterminate; }, 0);

    const txt = document.createElement("span");
    txt.textContent = "전체";

    label.appendChild(cb);
    label.appendChild(txt);
    left.appendChild(label);
  }

  const titleWrap = document.createElement("div");
  titleWrap.className = "title";
  titleWrap.innerHTML = `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(title)}</span> <span class="badge">${escapeHtml(badge)}</span>`;
  left.appendChild(titleWrap);

  const actions = document.createElement("div");
  actions.className = "sectionHeaderActions";

  // Extra buttons (e.g. Ungroup for group sections)
  for (const b of (headerExtraButtons || [])) {
    const btn = document.createElement("button");
    btn.textContent = b.text;
    if (b.className === "danger") btn.classList.add("danger");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await b.onClick();
    });
    actions.appendChild(btn);
  }

  const collapseBtn = document.createElement("button");
  collapseBtn.textContent = isCollapsed(key) ? "펼치기" : "접기";
  collapseBtn.addEventListener("click", () => {
    toggleCollapse(key);
    render();
  });
  actions.appendChild(collapseBtn);

  header.appendChild(left);
  header.appendChild(actions);

  const itemsWrap = document.createElement("div");
  itemsWrap.className = "items";
  for (const tab of items) itemsWrap.appendChild(renderTabItem(tab));

  section.appendChild(header);

  if (subtitle) {
    const meta = document.createElement("div");
    meta.style.padding = "0 10px 10px";
    meta.style.fontSize = "11px";
    meta.style.color = "var(--muted)";
    meta.textContent = subtitle;
    section.appendChild(meta);
  }

  section.appendChild(itemsWrap);
  return section;
}

function renderTabItem(tab) {
  const row = document.createElement("div");
  row.className = "item";
  row.draggable = true;
  row.dataset.tabId = String(tab.id);
  if (tab.active) row.classList.add("active");

  // DnD
  row.addEventListener("dragstart", (e) => {
    state.draggingTabId = tab.id;
    row.classList.add("dragging");
    e.dataTransfer.setData("text/tabId", String(tab.id));
    e.dataTransfer.effectAllowed = "move";
  });
  row.addEventListener("dragend", () => {
    state.draggingTabId = null;
    row.classList.remove("dragging");
  });

  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    row.classList.add("dropTarget");
  });
  row.addEventListener("dragleave", () => row.classList.remove("dropTarget"));

  row.addEventListener("drop", async (e) => {
    e.preventDefault();
    row.classList.remove("dropTarget");

    const sourceId = Number(e.dataTransfer.getData("text/tabId"));
    const targetId = tab.id;
    if (!Number.isFinite(sourceId) || sourceId === targetId) return;

    await moveTabBefore(sourceId, targetId);
    await load();
    render();
  });

  // selection checkbox
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = state.selected.has(tab.id);
  cb.addEventListener("click", (e) => e.stopPropagation());
  cb.addEventListener("change", () => {
    if (cb.checked) state.selected.add(tab.id);
    else state.selected.delete(tab.id);
  });

  // favicon
  const img = document.createElement("img");
  img.className = "favicon";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.src = tab.favIconUrl || "";
  img.onerror = () => { img.removeAttribute("src"); };

  // title column
  const titleCol = document.createElement("div");
  titleCol.className = "titleCol";

  const title = document.createElement("div");
  title.className = "titleText";
  title.textContent = tab.title || "(no title)";

  const sub = document.createElement("div");
  sub.className = "subText";
  sub.textContent = normalizeDomain(tab.url) + " • " + (tab.url || "");

  titleCol.appendChild(title);
  titleCol.appendChild(sub);

  // close button
  const close = document.createElement("button");
  close.className = "close";
  close.textContent = "×";
  close.title = "탭 닫기";
  close.addEventListener("click", async (e) => {
    e.stopPropagation();
    await chrome.tabs.remove(tab.id);
    state.selected.delete(tab.id);
    await load();
    render();
  });

  // activate
  row.addEventListener("click", async () => {
    await chrome.tabs.update(tab.id, { active: true });
  });

  row.appendChild(cb);
  row.appendChild(img);
  row.appendChild(titleCol);
  row.appendChild(close);

  return row;
}

async function moveTabBefore(sourceId, targetId) {
  const tabs = await chrome.tabs.query({ windowId: state.windowId });
  const sorted = tabs.sort((a, b) => a.index - b.index);
  const target = sorted.find(t => t.id === targetId);
  if (!target) return;
  await chrome.tabs.move(sourceId, { windowId: state.windowId, index: target.index });
}

async function makeGroupFromSelected() {
  const tabIds = [...state.selected].filter(Number.isFinite);
  if (tabIds.length < 2) {
    alert("그룹은 최소 2개 탭을 선택해 주세요.");
    return;
  }

  const title = prompt("그룹 이름을 입력해 주세요.", "New Group");
  if (title === null) return;

  const color = $("#groupColor").value;

  const groupId = await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, { title, color });

  state.selected.clear();
}

async function ungroupByGroupId(groupId) {
  const tabs = await chrome.tabs.query({ windowId: state.windowId });
  const ids = tabs.filter(t => t.groupId === groupId).map(t => t.id);
  if (ids.length === 0) return;
  await chrome.tabs.ungroup(ids);
}

async function sortUngroupedByDomainOnce() {
  const tabs = await chrome.tabs.query({ windowId: state.windowId });
  const sorted = tabs.sort((a, b) => a.index - b.index);

  const pinned = sorted.filter(t => t.pinned);
  const grouped = sorted.filter(t => !t.pinned && t.groupId !== -1);
  const ungrouped = sorted.filter(t => !t.pinned && t.groupId === -1);

  const keyed = ungrouped.map(t => ({
    id: t.id,
    domain: normalizeDomain(t.url),
    title: (t.title || "").toLowerCase(),
    origIndex: t.index
  }));

  keyed.sort((a, b) => {
    const d = a.domain.localeCompare(b.domain);
    if (d !== 0) return d;
    const tt = a.title.localeCompare(b.title);
    if (tt !== 0) return tt;
    return a.origIndex - b.origIndex;
  });

  const desiredIds = [
    ...pinned.map(t => t.id),
    ...grouped.map(t => t.id),
    ...keyed.map(x => x.id)
  ];

  await reorderTabsInWindow(state.windowId, desiredIds);
}

async function reorderTabsInWindow(windowId, desiredIds) {
  const tabs = await chrome.tabs.query({ windowId });
  let current = tabs.sort((a, b) => a.index - b.index).map(t => t.id);

  for (let targetIndex = 0; targetIndex < desiredIds.length; targetIndex++) {
    const tabId = desiredIds[targetIndex];
    const curIndex = current.indexOf(tabId);
    if (curIndex === -1) continue;

    if (curIndex !== targetIndex) {
      await chrome.tabs.move(tabId, { windowId, index: targetIndex });
      current.splice(curIndex, 1);
      current.splice(targetIndex, 0, tabId);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
