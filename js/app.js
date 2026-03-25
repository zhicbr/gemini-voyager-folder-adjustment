// 应用程序初始化与事件监听

let navHistory = [null];
let navIndex = 0;
let globalMissingAssociations = [];

// =====================================
// 初始化
// =====================================

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadInitialData();
    setupEventListeners();
});

function initTheme() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const savedTheme = localStorage.getItem('gv-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

    themeToggleBtn.onclick = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('gv-theme', newTheme);
        themeToggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    };
}

async function loadInitialData() {
    // 加载关联数据
    try {
        const data = await API.getAssociations();
        if (data.success) {
            store.chatAssociations = data.data.associations || {};
            renderMainContent();
            verifyAssociations();
        }
    } catch (err) {
        console.error("加载关联数据失败", err);
    }

    // 加载标记数据
    try {
        const data = await API.getMarkers();
        if (data.success) {
            store.markers = data.data || { highlights: [], bookmarks: [] };
        }
    } catch (err) {
        console.error("加载标记数据失败", err);
    }

    // 加载最新文件数据
    try {
        const data = await API.getLatestData();
        if (data.success && data.data && data.data.format === 'gemini-voyager.folders.v1') {
            store.rawData = data.data;
            store.currentFolderId = null;
            store.selectedItems.clear();

            navHistory = [null];
            navIndex = 0;

            document.getElementById('exportBtn').style.display = 'inline-block';
            document.getElementById('createRootBtn').style.display = 'inline-block';
            document.getElementById('headerSelectionBadge').style.visibility = 'visible';

            updateTotalFileCount();
            updateSelectionBadge();
            renderAll();

            const emptyState = document.querySelector('.sidebar .empty-state');
            if (emptyState) emptyState.style.display = 'none';

            updateDataTimeDisplay(data.filename);
        }
    } catch (err) {
        console.log('未自动定位到本地数据', err);
    }
}

function setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileImport);

    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        store.searchQuery = e.target.value.trim();
        store.globalSearchResults = null;
        renderMainContent();
    });

    searchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (!query) return;
            performGlobalSearch(query);
        }
    });

    document.getElementById('chatSelectSearch').addEventListener('input', (e) => {
        filterChatSelectList(e.target.value);
    });

    document.getElementById('contextMoveBtn').onclick = () => {
        if (store.selectedItems.size === 0) return;
        const folderSelect = document.getElementById('folderSelect');
        folderSelect.innerHTML = `<option value="null">🏠 根目录</option>`;
        getFolders().forEach(f => folderSelect.innerHTML += `<option value="${f.id}">📁 ${escapeHTML(f.name)}</option>`);
        document.getElementById('moveModal').style.display = 'flex';
    };

    document.addEventListener('click', () => {
        document.getElementById('context-menu').style.display = 'none';
    });
}

// =====================================
// 核心逻辑函数
// =====================================

async function verifyAssociations() {
    const badge = document.getElementById('assocCheckBadge');
    const icon = document.getElementById('assocCheckIcon');
    const text = document.getElementById('assocCheckText');
    badge.style.display = 'flex';
    icon.textContent = '🟡';
    text.textContent = '校验关联中...';

    try {
        const data = await API.verifyAssociations();
        if (data.success) {
            globalMissingAssociations = data.missing;
            if (data.total === 0) {
                badge.style.display = 'none';
            } else if (data.missing.length === 0) {
                icon.textContent = '🟢';
                text.innerHTML = `已关联 <span>${data.total}</span> 个`;
            } else {
                icon.textContent = '🔴';
                text.innerHTML = `缺失 <span>${data.missing.length}</span> 个`;
            }
        } else {
            icon.textContent = '❌';
            text.textContent = '校验失败';
        }
    } catch (err) {
        icon.textContent = '⚠️';
        text.textContent = '网络错误';
    }
}

function openMissingAssocModal() {
    if (!globalMissingAssociations || globalMissingAssociations.length === 0) {
        verifyAssociations();
        return;
    }
    const list = document.getElementById('missingAssocList');
    list.innerHTML = '';
    globalMissingAssociations.forEach(m => {
        const el = document.createElement('div');
        el.style.padding = "10px 14px";
        el.style.borderBottom = "1px solid var(--border)";
        el.style.fontSize = "13px";

        let foundTitle = "未知对话标题";
        const contents = getFolderContents();
        for (const fId in contents) {
            const f = contents[fId].find(file => file.conversationId === m.conversationId);
            if (f) { foundTitle = f.title; break; }
        }

        el.innerHTML = `<div style="font-weight: 500; margin-bottom: 4px;">${escapeHTML(foundTitle)} <span style="font-size: 11px; background: var(--hover-bg); padding: 1px 4px; border-radius: 3px;">ID: ${escapeHTML(m.conversationId)}</span></div>
                        <div style="color: #ea4335;">缺失路径: /chat_history/${escapeHTML(m.folderName)}${m.type === 'file' ? '.md' : ''}</div>`;
        list.appendChild(el);
    });
    document.getElementById('missingAssocModal').style.display = 'flex';
}

async function clearAllMissingAssociations() {
    if (!confirm(`确定要移除这 ${globalMissingAssociations.length} 条已失效的本机关联记录吗？此操作不可撤销。`)) return;

    const btn = document.querySelector('#missingAssocModal .btn-outline');
    btn.textContent = '正在清理...';
    btn.disabled = true;

    for (const m of globalMissingAssociations) {
        await API.deleteAssociation(m.conversationId);
        delete store.chatAssociations[m.conversationId];
    }

    btn.textContent = '清空所有无效关联';
    btn.disabled = false;

    closeModal('missingAssocModal');
    renderMainContent();
    verifyAssociations();
}

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target.result);
            if (json.format === 'gemini-voyager.folders.v1') {
                store.rawData = json;
                store.currentFolderId = null;
                store.selectedItems.clear();
                navHistory = [null];
                navIndex = 0;

                document.getElementById('exportBtn').style.display = 'inline-block';
                document.getElementById('createRootBtn').style.display = 'inline-block';
                document.getElementById('headerSelectionBadge').style.visibility = 'visible';

                updateDataTimeDisplay(file.name);
                updateTotalFileCount();
                updateSelectionBadge();
                renderAll();
            } else { alert('不支持的 JSON 格式！'); }
        } catch (err) { alert('解析失败：' + err.message); }
    };
    reader.readAsText(file);
}

function switchToExplorer() {
    store.currentView = 'explorer';
    document.getElementById('tabExplorer').classList.add('active');
    document.getElementById('tabMarkers').classList.remove('active');
    renderAll();
}

function switchToMarkers() {
    store.currentView = 'markers';
    document.getElementById('tabMarkers').classList.add('active');
    document.getElementById('tabExplorer').classList.remove('active');
    renderAll();
}

function navigateToFolder(folderId) {
    if (store.currentView !== 'explorer') switchToExplorer();
    let wasSearching = !!store.searchQuery;
    if (wasSearching) {
        store.searchQuery = '';
        document.getElementById('searchInput').value = '';
    }
    if (store.currentFolderId === folderId) {
        if (wasSearching) renderAll();
        return;
    }
    navHistory = navHistory.slice(0, navIndex + 1);
    navHistory.push(folderId);
    navIndex++;
    store.currentFolderId = folderId;
    renderAll();
}

function goBack() {
    if (store.searchQuery) { store.searchQuery = ''; document.getElementById('searchInput').value = ''; }
    if (navIndex > 0) {
        navIndex--;
        store.currentFolderId = navHistory[navIndex];
        renderAll();
    }
}

function goForward() {
    if (store.searchQuery) { store.searchQuery = ''; document.getElementById('searchInput').value = ''; }
    if (navIndex < navHistory.length - 1) {
        navIndex++;
        store.currentFolderId = navHistory[navIndex];
        renderAll();
    }
}

function clearSelection() {
    store.selectedItems.clear();
    updateSelectionBadge();
    renderMainContent();
}

function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }

function confirmMove() {
    const folderSelect = document.getElementById('folderSelect');
    const targetId = folderSelect.value === 'null' ? null : folderSelect.value;
    const itemsToMove = getTopLevelSelectedItems();
    itemsToMove.forEach(item => moveItem(item.type, item.id, item.sourceId, targetId));
    closeModal('moveModal');
    store.selectedItems.clear();
    updateSelectionBadge();
    renderAll();
}

async function performGlobalSearch(query) {
    document.getElementById('breadcrumbCount').textContent = '(正在全库搜索内容...)';
    try {
        const data = await API.globalSearch(query);
        if (data.success) {
            store.globalSearchResults = data.results;
            renderMainContent();
        }
    } catch (err) {
        console.error("全局搜索失败", err);
        alert("全局搜索请求失败");
    }
}

function exportData() {
    if (!store.rawData) return;
    store.rawData.exportedAt = new Date().toISOString();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store.rawData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "gemini-voyager-export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function openMetaModal(event, dataObj) {
    event.stopPropagation();
    let jsonStr = JSON.stringify(dataObj, null, 2);
    jsonStr = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const highlighted = jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'meta-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) { cls = 'meta-key'; }
            else { cls = 'meta-string'; }
        } else if (/true|false/.test(match)) { cls = 'meta-boolean'; }
        return '<span class="' + cls + '">' + match + '</span>';
    });
    document.getElementById('metaContent').innerHTML = highlighted;
    document.getElementById('metaModal').style.display = 'flex';
}

function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drag-over'); }

function handleDrop(e, targetFolderId) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    try {
        const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (Array.isArray(payload)) {
            payload.forEach(data => moveItem(data.type, data.id, data.sourceId, targetFolderId));
            store.selectedItems.clear();
            updateTotalFileCount();
            updateSelectionBadge();
            renderAll();
        }
    } catch (err) { console.error("Drop failed:", err); }
}

function showContextMenu(x, y) {
    const contextMenu = document.getElementById('context-menu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
}
