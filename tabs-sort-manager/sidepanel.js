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
  theme: "dark",             // "dark" | "light" | "purple" | "blue" | "teal" | "green" | "orange" | "pink" | "magenta"
  pinnedTabs: new Set()      // 고정된 탭 ID들
};

init();

async function init() {
  const win = await chrome.windows.getCurrent();
  state.windowId = win.id;

  // Load saved settings
  const saved = await chrome.storage.local.get(["theme", "pinnedTabs"]);
  
  // theme load
  const validThemes = ["dark", "light", "purple", "blue", "teal", "green", "orange", "pink", "magenta"];
  state.theme = validThemes.includes(saved.theme) ? saved.theme : "dark";
  applyTheme();

  $("#themeSelect").value = state.theme;
  $("#themeSelect").addEventListener("change", async (e) => {
    state.theme = e.target.value;
    applyTheme();
    await chrome.storage.local.set({ theme: state.theme });
  });

  // 고정된 탭 로드
  if (Array.isArray(saved.pinnedTabs)) {
    state.pinnedTabs = new Set(saved.pinnedTabs);
  }

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
  const themeSelect = $("#themeSelect");
  if (themeSelect) {
    themeSelect.value = state.theme;
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

  // 원본 탭 순서 (크롬의 실제 순서)
  const sortedTabs = [...state.tabs].sort((a, b) => a.index - b.index);
  
  // pin된 탭들을 먼저 분리하고, pin된 순서를 유지
  const pinnedTabsList = Array.from(state.pinnedTabs);
  const pinnedTabs = sortedTabs.filter(t => state.pinnedTabs.has(t.id));
  const unpinnedTabs = sortedTabs.filter(t => !state.pinnedTabs.has(t.id));
  
  // pin된 탭들을 pin된 순서대로 정렬 (먼저 pin된 것이 앞에)
  pinnedTabs.sort((a, b) => {
    const aIdx = pinnedTabsList.indexOf(a.id);
    const bIdx = pinnedTabsList.indexOf(b.id);
    return aIdx - bIdx;
  });
  
  // pin된 탭 먼저, 그 다음 일반 탭 (크롬 순서 유지)
  const sortedTabsWithPin = [...pinnedTabs, ...unpinnedTabs];
  
  // 그룹별로 탭 분류
  const tabsByGroup = new Map();
  const ungroupedTabs = [];
  const processedGroups = new Set();
  
  // 크롬의 실제 탭 순서대로 처리
  for (const tab of sortedTabsWithPin) {
    if (tab.groupId !== -1) {
      if (!tabsByGroup.has(tab.groupId)) {
        tabsByGroup.set(tab.groupId, []);
      }
      tabsByGroup.get(tab.groupId).push(tab);
    } else {
      ungroupedTabs.push(tab);
    }
  }
  
  // 각 그룹의 첫 번째 탭 인덱스를 원본 순서에서 찾기
  const groupFirstTabIndex = new Map();
  for (const tab of sortedTabs) {
    if (tab.groupId !== -1) {
      if (!groupFirstTabIndex.has(tab.groupId)) {
        groupFirstTabIndex.set(tab.groupId, tab.index);
      }
    }
  }
  
  // 크롬의 실제 순서대로 그룹과 일반 탭을 함께 렌더링
  const processedGroupIds = new Set();
  
  for (const tab of sortedTabsWithPin) {
    // 검색 필터링
    const domain = normalizeDomain(tab.url);
    const groupTitle = tab.groupId !== -1 ? getGroupTitle(tab.groupId) : "";
    if (!matchesSearch(tab, groupTitle, domain)) continue;
    
    if (tab.groupId !== -1) {
      // 그룹에 속한 탭
      if (!processedGroupIds.has(tab.groupId)) {
        processedGroupIds.add(tab.groupId);
        const groupTabs = tabsByGroup.get(tab.groupId);
        renderGroupSection(tab.groupId, groupTabs, list);
      }
    } else {
      // 그룹 없는 탭
      list.appendChild(renderTabItem(tab));
    }
  }
}

function renderGroupSection(gid, groupTabs, list) {
  const g = getGroup(gid);
  const groupTitle = g?.title || `Group ${gid}`;
  const visibleTabs = groupTabs.filter(t => {
    const domain = normalizeDomain(t.url);
    return matchesSearch(t, groupTitle, domain);
  });

  if (state.search && visibleTabs.length === 0) return;
  
  // 그룹 내에서도 pin된 탭을 먼저 정렬
  const pinnedTabsList = Array.from(state.pinnedTabs);
  const pinnedInGroup = visibleTabs.filter(t => state.pinnedTabs.has(t.id));
  const unpinnedInGroup = visibleTabs.filter(t => !state.pinnedTabs.has(t.id));
  
  pinnedInGroup.sort((a, b) => {
    const aIdx = pinnedTabsList.indexOf(a.id);
    const bIdx = pinnedTabsList.indexOf(b.id);
    return aIdx - bIdx;
  });
  
  const sortedVisibleTabs = [...pinnedInGroup, ...unpinnedInGroup];

  list.appendChild(renderSection({
    id: `sec-group-${gid}`,
    key: sectionKeyForGroup(gid),
    title: groupTitle,
    badge: `${visibleTabs.length}/${groupTabs.length}`,
    subtitle: null,  // subtitle 제거
    groupColor: g?.color || "grey",  // 그룹 색상 전달
    isGroup: true,  // 그룹 섹션임을 표시
    groupId: gid,  // 그룹 ID 전달
    showSelectAll: false,
    onSelectAll: null,
    selectAllChecked: false,
    onDropHeader: async (tabId) => {
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
    items: isCollapsed(sectionKeyForGroup(gid)) ? [] : sortedVisibleTabs
  }));
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
  groupColor, isGroup, groupId,
  showSelectAll, selectAllChecked, selectAllIndeterminate, onSelectAll,
  onDropHeader,
  headerExtraButtons,
  items
}) {
  const section = document.createElement("div");
  section.className = "section";
  if (isGroup) {
    section.classList.add("groupSection");
  }
  section.id = id;
  

  const header = document.createElement("div");
  header.className = "sectionHeader";
  header.dataset.sectionKey = key;
  
  // 그룹 색상 표시
  if (isGroup && groupColor) {
    const colorMap = {
      blue: "#4285f4",
      grey: "#9aa0a6",
      red: "#ea4335",
      yellow: "#fbbc04",
      green: "#34a853",
      pink: "#f06292",
      purple: "#9c27b0",
      cyan: "#00bcd4",
      orange: "#ff9800"
    };
    const color = colorMap[groupColor] || colorMap.grey;
    header.classList.add("groupHeader");
    // 섹션 전체에 그룹 색상 적용
    section.dataset.groupColor = groupColor;
  }

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
  
  // 그룹인 경우 편집 가능한 타이틀
  if (isGroup && groupId) {
    const titleSpan = document.createElement("span");
    titleSpan.style.minWidth = "0";
    titleSpan.style.overflow = "hidden";
    titleSpan.style.textOverflow = "ellipsis";
    titleSpan.style.whiteSpace = "nowrap";
    titleSpan.style.cursor = "pointer";
    titleSpan.style.flex = "1";
    titleSpan.textContent = title;
    titleSpan.title = "Click to edit group name";
    
    const badgeSpan = document.createElement("span");
    badgeSpan.className = "badge";
    badgeSpan.textContent = badge;
    
    titleSpan.addEventListener("click", async (e) => {
      e.stopPropagation();
      await editGroupTitle(groupId, titleSpan, badgeSpan);
    });
    
    titleWrap.appendChild(titleSpan);
    titleWrap.appendChild(badgeSpan);
  } else {
    titleWrap.innerHTML = `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(title)}</span> <span class="badge">${escapeHtml(badge)}</span>`;
  }
  
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
  collapseBtn.className = "btn icon-btn collapseBtn";
  collapseBtn.title = isCollapsed(key) ? "Expand" : "Collapse";
  const isCollapsedState = isCollapsed(key);
  collapseBtn.innerHTML = isCollapsedState ? `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m6 9 6 6 6-6"></path>
    </svg>
  ` : `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m18 15-6-6-6 6"></path>
    </svg>
  `;
  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCollapse(key);
    render();
  });
  actions.appendChild(collapseBtn);

  header.appendChild(left);
  header.appendChild(actions);

  const itemsWrap = document.createElement("div");
  itemsWrap.className = "items";
  
  // itemsWrap도 드롭 가능하게 설정 (빈 공간에 드롭할 때)
  itemsWrap.addEventListener("dragover", (e) => {
    if (state.draggingTabId) {
      const sourceIsPinned = state.pinnedTabs.has(state.draggingTabId);
      // pin된 탭은 itemsWrap에 드롭 불가
      if (sourceIsPinned) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      itemsWrap.classList.add("dropTarget");
    }
  });
  
  itemsWrap.addEventListener("dragleave", (e) => {
    if (!itemsWrap.contains(e.relatedTarget)) {
      itemsWrap.classList.remove("dropTarget");
    }
  });
  
  itemsWrap.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    itemsWrap.classList.remove("dropTarget");
    
    const sourceId = Number(e.dataTransfer.getData("text/tabId"));
    if (!Number.isFinite(sourceId)) return;
    
    // pin된 탭은 itemsWrap에 드롭 불가
    if (state.pinnedTabs.has(sourceId)) {
      return;
    }
    
    // itemsWrap의 마지막 탭 뒤에 드롭
    if (items.length > 0) {
      const lastTab = items[items.length - 1];
      // 마지막 탭이 pin된 탭이면 드롭 불가
      if (state.pinnedTabs.has(lastTab.id)) {
        return;
      }
      // 마지막 탭 다음 위치로 이동
      const tabs = await chrome.tabs.query({ windowId: state.windowId });
      const sorted = tabs.sort((a, b) => a.index - b.index);
      const lastTabIndex = sorted.findIndex(t => t.id === lastTab.id);
      if (lastTabIndex !== -1 && lastTabIndex < sorted.length - 1) {
        const nextTab = sorted[lastTabIndex + 1];
        // 다음 탭이 pin된 탭이면 드롭 불가
        if (!state.pinnedTabs.has(nextTab.id)) {
          await chrome.tabs.move(sourceId, { windowId: state.windowId, index: nextTab.index });
        }
      } else {
        // 마지막이면 그냥 마지막으로
        await chrome.tabs.move(sourceId, { windowId: state.windowId, index: -1 });
      }
      await load();
      render();
    }
  });
  
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
    e.stopPropagation();
  });
  
  row.addEventListener("dragend", (e) => {
    state.draggingTabId = null;
    row.classList.remove("dragging");
    // 모든 dropTarget 클래스 제거
    document.querySelectorAll(".dropTarget").forEach(el => el.classList.remove("dropTarget"));
  });

  row.addEventListener("dragover", (e) => {
    if (state.draggingTabId && state.draggingTabId !== tab.id) {
      const sourceIsPinned = state.pinnedTabs.has(state.draggingTabId);
      const targetIsPinned = state.pinnedTabs.has(tab.id);
      
      // pin된 탭과 unpin된 탭 간 드래그는 허용하지 않음
      if (sourceIsPinned !== targetIsPinned) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      row.classList.add("dropTarget");
    }
  });
  
  row.addEventListener("dragleave", (e) => {
    // 자식 요소로 이동하는 경우는 제외
    if (!row.contains(e.relatedTarget)) {
      row.classList.remove("dropTarget");
    }
  });

  row.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.classList.remove("dropTarget");

    const sourceId = Number(e.dataTransfer.getData("text/tabId"));
    const targetId = tab.id;
    if (!Number.isFinite(sourceId) || sourceId === targetId) return;

    const sourceIsPinned = state.pinnedTabs.has(sourceId);
    const targetIsPinned = state.pinnedTabs.has(targetId);
    
    // pin된 탭과 unpin된 탭 간 드롭은 허용하지 않음
    if (sourceIsPinned !== targetIsPinned) {
      return;
    }
    
    // pin된 탭끼리 드래그 시 pin 순서 유지
    if (sourceIsPinned && targetIsPinned) {
      await movePinnedTabBefore(sourceId, targetId);
    } else {
      // unpin된 탭끼리 드래그
      await moveTabBefore(sourceId, targetId);
    }
    
    await load();
    render();
  });

  // selection checkbox (그룹에 속한 탭은 체크박스 숨김)
  const isInGroup = tab.groupId !== -1;
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = state.selected.has(tab.id);
  if (isInGroup) {
    cb.style.display = "none";
    row.classList.add("inGroup");
  }
  cb.addEventListener("click", (e) => e.stopPropagation());
  cb.addEventListener("change", () => {
    if (cb.checked) state.selected.add(tab.id);
    else state.selected.delete(tab.id);
  });

  // 고정 아이콘 (pin)
  const isPinned = state.pinnedTabs.has(tab.id);
  const pinIcon = document.createElement("div");
  pinIcon.className = "pinIcon";
  pinIcon.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" x2="12" y1="17" y2="22"></line>
      <path d="M5 17h14v-3.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 13.24Z"></path>
    </svg>
  `;
  pinIcon.title = isPinned ? "고정 해제" : "고정";
  if (isPinned) {
    pinIcon.classList.add("pinned");
  }
  pinIcon.addEventListener("click", async (e) => {
    e.stopPropagation();
    await togglePinTab(tab.id);
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

  // 도메인 복사 버튼 (copy link 아이콘)
  const copyDomainBtn = document.createElement("button");
  copyDomainBtn.className = "copyDomainBtn";
  copyDomainBtn.title = "Copy domain";
  copyDomainBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  `;
  copyDomainBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    
    if (!tab.url) return;
    
    try {
      // URL에서 도메인(origin) 추출
      let domainUrl = "";
      try {
        const urlObj = new URL(tab.url);
        domainUrl = urlObj.origin;
      } catch {
        // URL 파싱 실패 시 원본 URL 사용
        domainUrl = tab.url;
      }
      
      if (domainUrl) {
        // 클립보드에 도메인 복사
        await navigator.clipboard.writeText(domainUrl);
        
        // Copy complete 효과
        const originalTitle = copyDomainBtn.title;
        copyDomainBtn.title = "Copy complete!";
        copyDomainBtn.classList.add("copied");
        
        setTimeout(() => {
          copyDomainBtn.title = originalTitle;
          copyDomainBtn.classList.remove("copied");
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to copy domain:", error);
    }
  });

  // 새 탭 생성 버튼 (copy 아이콘)
  const newTabBtn = document.createElement("button");
  newTabBtn.className = "newTabBtn";
  newTabBtn.title = "Create new tab with domain";
  newTabBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
      <path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"></path>
    </svg>
  `;
  newTabBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    
    if (!tab.url) return;
    
    try {
      // URL에서 도메인(origin) 추출
      let domainUrl = "";
      try {
        const urlObj = new URL(tab.url);
        domainUrl = urlObj.origin;
      } catch {
        // URL 파싱 실패 시 원본 URL 사용
        domainUrl = tab.url;
      }
      
      if (domainUrl) {
        // 새 탭 생성 (현재 탭 다음에 생성)
        await chrome.tabs.create({ 
          url: domainUrl,
          index: tab.index + 1
        });
      }
    } catch (error) {
      console.error("Failed to create new tab:", error);
    }
  });

  // close button
  const close = document.createElement("button");
  close.className = "close";
  close.textContent = "×";
  close.title = "탭 닫기";
  close.addEventListener("click", async (e) => {
    e.stopPropagation();
    await chrome.tabs.remove(tab.id);
    state.selected.delete(tab.id);
    state.pinnedTabs.delete(tab.id);
    await savePinnedTabs();
    await load();
    render();
  });

  // activate
  row.addEventListener("click", async () => {
    await chrome.tabs.update(tab.id, { active: true });
  });

  row.appendChild(cb);
  row.appendChild(pinIcon);
  row.appendChild(img);
  row.appendChild(titleCol);
  row.appendChild(copyDomainBtn);
  row.appendChild(newTabBtn);
  row.appendChild(close);

  return row;
}

async function moveTabBefore(sourceId, targetId) {
  const tabs = await chrome.tabs.query({ windowId: state.windowId });
  const sorted = tabs.sort((a, b) => a.index - b.index);
  const target = sorted.find(t => t.id === targetId);
  if (!target) return;
  
  // pin된 탭 영역을 건드리지 않도록 확인
  const sourceIsPinned = state.pinnedTabs.has(sourceId);
  const targetIsPinned = state.pinnedTabs.has(targetId);
  
  // pin된 탭과 unpin된 탭 간 이동은 허용하지 않음
  if (sourceIsPinned !== targetIsPinned) {
    return;
  }
  
  await chrome.tabs.move(sourceId, { windowId: state.windowId, index: target.index });
}

// pin된 탭끼리 순서 변경 (pin 순서 유지)
async function movePinnedTabBefore(sourceId, targetId) {
  const tabs = await chrome.tabs.query({ windowId: state.windowId });
  const sorted = tabs.sort((a, b) => a.index - b.index);
  const target = sorted.find(t => t.id === targetId);
  if (!target) return;
  
  // pin된 탭들을 순서대로 수집
  const pinnedTabsList = Array.from(state.pinnedTabs);
  const pinnedTabIds = pinnedTabsList.map(id => {
    const tab = sorted.find(t => t.id === id);
    return tab ? tab.id : null;
  }).filter(id => id !== null);
  
  // pin되지 않은 탭들
  const unpinnedTabIds = sorted
    .filter(t => !state.pinnedTabs.has(t.id))
    .map(t => t.id);
  
  // 드래그한 pin된 탭의 위치 변경
  const sourceIdx = pinnedTabIds.indexOf(sourceId);
  const targetIdx = pinnedTabIds.indexOf(targetId);
  
  if (sourceIdx !== -1 && targetIdx !== -1) {
    pinnedTabIds.splice(sourceIdx, 1);
    pinnedTabIds.splice(targetIdx, 0, sourceId);
    
    // pin된 순서 업데이트
    state.pinnedTabs = new Set(pinnedTabIds);
    await savePinnedTabs();
    
    // 실제 탭 순서 변경 (pin된 탭들 먼저, 그 다음 일반 탭들)
    const desiredOrder = [...pinnedTabIds, ...unpinnedTabIds];
    await reorderTabsInWindow(state.windowId, desiredOrder);
  }
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

  // 그룹 생성 (Chrome이 자동으로 위치 결정)
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

  // Chrome 기본 pinned 탭
  const chromePinned = sorted.filter(t => t.pinned);
  
  // 우리가 pin한 탭들 (Chrome pinned와 별개)
  const ourPinned = sorted.filter(t => state.pinnedTabs.has(t.id) && !t.pinned);
  
  // pin된 탭들 (Chrome pinned + 우리가 pin한 것)
  const allPinned = [...chromePinned, ...ourPinned];
  const pinnedIds = new Set(allPinned.map(t => t.id));
  
  // 그룹된 탭 (pin되지 않은 것만)
  const grouped = sorted.filter(t => !pinnedIds.has(t.id) && t.groupId !== -1);
  
  // 그룹되지 않은 탭 (pin되지 않은 것만)
  const ungrouped = sorted.filter(t => !pinnedIds.has(t.id) && t.groupId === -1);

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

  // pin된 탭들을 pin된 순서대로 유지
  const pinnedTabsList = Array.from(state.pinnedTabs);
  allPinned.sort((a, b) => {
    const aIsOurPin = state.pinnedTabs.has(a.id);
    const bIsOurPin = state.pinnedTabs.has(b.id);
    
    // Chrome pinned는 맨 앞
    if (!aIsOurPin && bIsOurPin) return -1;
    if (aIsOurPin && !bIsOurPin) return 1;
    
    // 둘 다 우리가 pin한 경우 순서 유지
    if (aIsOurPin && bIsOurPin) {
      const aIdx = pinnedTabsList.indexOf(a.id);
      const bIdx = pinnedTabsList.indexOf(b.id);
      return aIdx - bIdx;
    }
    
    // 둘 다 Chrome pinned인 경우 원래 순서 유지
    return a.index - b.index;
  });

  const desiredIds = [
    ...allPinned.map(t => t.id),
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

// 개별 탭 고정 기능 (여러 개 고정 가능)
async function togglePinTab(tabId) {
  if (state.pinnedTabs.has(tabId)) {
    // 이미 고정된 탭이면 해제
    state.pinnedTabs.delete(tabId);
    await savePinnedTabs();
    await load();
    render();
  } else {
    // 고정 추가
    state.pinnedTabs.add(tabId);
    await savePinnedTabs();
    
    // pin된 탭을 실제 Chrome 탭 순서에서 맨 앞으로 이동
    await movePinnedTabToFront(tabId);
    await load();
    render();
  }
}

// pin된 탭을 맨 앞으로 이동
async function movePinnedTabToFront(tabId) {
  const tabs = await chrome.tabs.query({ windowId: state.windowId });
  const sorted = tabs.sort((a, b) => a.index - b.index);
  
  // pin된 탭들을 순서대로 수집
  const pinnedTabsList = Array.from(state.pinnedTabs);
  const pinnedTabIds = pinnedTabsList.map(id => {
    const tab = sorted.find(t => t.id === id);
    return tab ? tab.id : null;
  }).filter(id => id !== null);
  
  // pin되지 않은 탭들
  const unpinnedTabIds = sorted
    .filter(t => !state.pinnedTabs.has(t.id))
    .map(t => t.id);
  
  // pin된 탭들을 맨 앞에, 그 다음 일반 탭들
  const desiredOrder = [...pinnedTabIds, ...unpinnedTabIds];
  
  // 실제 탭 순서 변경
  await reorderTabsInWindow(state.windowId, desiredOrder);
}

async function savePinnedTabs() {
  await chrome.storage.local.set({ 
    pinnedTabs: Array.from(state.pinnedTabs) 
  });
}


// 그룹명 편집 기능
async function editGroupTitle(groupId, titleSpan, badgeSpan) {
  const currentTitle = titleSpan.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentTitle;
  input.style.cssText = `
    border: 1px solid var(--accent);
    background: var(--card);
    color: var(--text);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 650;
    outline: none;
    min-width: 100px;
    flex: 1;
  `;
  
  // 기존 타이틀을 input으로 교체
  const titleWrap = titleSpan.parentElement;
  const originalDisplay = titleWrap.style.display;
  titleWrap.style.display = "flex";
  titleWrap.style.alignItems = "center";
  titleWrap.style.gap = "8px";
  titleWrap.style.width = "100%";
  
  titleSpan.style.display = "none";
  badgeSpan.style.display = "none";
  
  titleWrap.insertBefore(input, titleSpan);
  input.focus();
  input.select();
  
  const finishEdit = async () => {
    const newTitle = input.value.trim() || currentTitle;
    
    if (newTitle !== currentTitle) {
      try {
        await chrome.tabGroups.update(groupId, { title: newTitle });
        await load();
        render();
      } catch (error) {
        console.error("Failed to update group title:", error);
        // 실패해도 원래대로 복구
        titleSpan.textContent = currentTitle;
      }
    } else {
      titleSpan.textContent = currentTitle;
    }
    
    input.remove();
    titleSpan.style.display = "";
    badgeSpan.style.display = "";
    titleWrap.style.display = originalDisplay;
  };
  
  input.addEventListener("blur", finishEdit);
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await finishEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.remove();
      titleSpan.style.display = "";
      badgeSpan.style.display = "";
      titleWrap.style.display = originalDisplay;
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
