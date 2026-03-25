// UI 渲染逻辑

function renderAll() {
    if (!store.rawData) return;
    updateNavButtons();
    renderSidebar();
    if (store.currentView === 'markers') {
        renderMarkersPage();
    } else {
        renderMainContent();
    }
}

function renderMarkersPage() {
    const contentGrid = document.getElementById('contentGrid');
    const breadcrumbText = document.getElementById('breadcrumbText');
    const breadcrumbCount = document.getElementById('breadcrumbCount');
    
    contentGrid.innerHTML = '';
    breadcrumbText.textContent = '划词与收藏管理';
    
    const hlCount = store.markers.highlights.length;
    const bmCount = store.markers.bookmarks.length;
    breadcrumbCount.textContent = `(共 ${hlCount} 个划词, ${bmCount} 个收藏)`;

    const container = document.createElement('div');
    container.className = 'markers-manager-container';
    container.style.width = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '24px';

    // 划词部分 (全局强调)
    const hlSection = document.createElement('div');
    hlSection.innerHTML = `<h3 style="margin-bottom:12px; display:flex; align-items:center; gap:8px; font-size:16px;"><span>✨</span> 全局划词关键词 (${hlCount})</h3>`;
    const hlList = document.createElement('div');
    hlList.className = 'marker-list';
    hlList.style.display = 'flex';
    hlList.style.flexWrap = 'wrap';
    hlList.style.gap = '10px';

    if (hlCount === 0) {
        hlList.innerHTML = '<div class="empty-state" style="padding:10px; text-align:left;">暂无划词关键词</div>';
    } else {
        store.markers.highlights.forEach((h, index) => {
            const item = document.createElement('div');
            item.className = 'marker-page-item highlight';
            item.style.background = 'var(--surface)';
            item.style.border = '1px solid var(--border)';
            item.style.padding = '6px 14px';
            item.style.borderRadius = '20px';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '8px';
            item.style.fontSize = '14px';
            
            item.innerHTML = `
                <mark class="hl-highlight">${escapeHTML(h.text)}</mark>
                <button class="action-icon" style="opacity:0.5; font-size:10px;" onclick="deleteHighlight(${index})">✕</button>
            `;
            hlList.appendChild(item);
        });
    }
    hlSection.appendChild(hlList);

    // 收藏部分 (局部句子)
    const bmSection = document.createElement('div');
    bmSection.innerHTML = `<h3 style="margin-bottom:12px; display:flex; align-items:center; gap:8px; font-size:16px;"><span>🔖</span> 对话句子收藏 (${bmCount})</h3>`;
    const bmList = document.createElement('div');
    bmList.className = 'marker-list-vertical';
    bmList.style.display = 'flex';
    bmList.style.flexDirection = 'column';
    bmList.style.gap = '12px';

    if (bmCount === 0) {
        bmList.innerHTML = '<div class="empty-state" style="padding:10px; text-align:left;">暂无收藏句子</div>';
    } else {
        store.markers.bookmarks.forEach((b, index) => {
            let convoTitle = "未知对话";
            const contents = getFolderContents();
            for (const fId in contents) {
                const found = contents[fId].find(f => f.conversationId === b.conversationId);
                if (found) { convoTitle = found.title; break; }
            }

            const item = document.createElement('div');
            item.className = 'marker-page-item bookmark';
            item.style.background = 'var(--surface)';
            item.style.border = '1px solid var(--border)';
            item.style.padding = '12px 16px';
            item.style.borderRadius = '8px';
            item.style.cursor = 'pointer';
            item.style.transition = 'all 0.2s';
            
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">
                    <div style="font-size:12px; color:var(--primary); font-weight:500;">📄 ${escapeHTML(convoTitle)}</div>
                    <button class="action-icon" style="font-size:11px;" onclick="event.stopPropagation(); deleteBookmark(${index})">✕ 移除</button>
                </div>
                <div style="font-size:14px; line-height:1.6; color:var(--text-main);">
                    <mark class="hl-bookmark">${escapeHTML(b.text)}</mark>
                </div>
            `;
            
            item.onclick = () => {
                const assoc = store.chatAssociations[b.conversationId];
                if (assoc) openChatViewer(b.conversationId, convoTitle, assoc);
                else alert("该对话尚未关联本地文件，无法跳转");
            };
            
            bmList.appendChild(item);
        });
    }
    bmSection.appendChild(bmList);

    container.appendChild(hlSection);
    container.appendChild(bmSection);
    contentGrid.appendChild(container);
}

function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = '';
    const rootWrapper = document.createElement('div');
    rootWrapper.className = 'tree-node';

    const rootItem = document.createElement('div');
    rootItem.className = `tree-item ${store.currentFolderId === null ? 'active' : ''}`;

    const rootContent = document.createElement('div');
    rootContent.className = 'tree-item-content';
    rootContent.innerHTML = `<span class="tree-icon">🏠</span> 根目录`;

    const rootActions = document.createElement('div');
    rootActions.className = 'tree-item-actions';
    const rootAddBtn = document.createElement('button');
    rootAddBtn.className = 'tree-action-btn';
    rootAddBtn.title = '新建文件夹';
    rootAddBtn.innerHTML = '➕';
    rootAddBtn.onclick = (e) => { e.stopPropagation(); promptCreateFolder(null); };
    rootActions.appendChild(rootAddBtn);

    rootItem.appendChild(rootContent);
    rootItem.appendChild(rootActions);

    rootItem.ondragover = handleDragOver;
    rootItem.ondragleave = handleDragLeave;
    rootItem.ondrop = (e) => { e.stopPropagation(); handleDrop(e, null); };
    rootItem.onclick = () => navigateToFolder(null);

    rootWrapper.appendChild(rootItem);
    sidebar.appendChild(rootWrapper);

    const renderTreeNodes = (parentId, container) => {
        const children = getChildrenFolders(parentId);
        if (children.length === 0) return;

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        container.appendChild(childrenContainer);

        children.forEach(folder => {
            const el = document.createElement('div');
            el.className = 'tree-node';

            const item = document.createElement('div');
            item.className = `tree-item ${store.currentFolderId === folder.id ? 'active' : ''}`;

            const content = document.createElement('div');
            content.className = 'tree-item-content';
            content.innerHTML = `<span class="tree-icon">📁</span> <span class="item-title" title="${escapeHTML(folder.name)}">${escapeHTML(folder.name)}</span>`;

            const actions = document.createElement('div');
            actions.className = 'tree-item-actions';

            const btnUp = document.createElement('button');
            btnUp.className = 'tree-action-btn';
            btnUp.title = '上移';
            btnUp.innerHTML = '↑';
            btnUp.onclick = (e) => { e.stopPropagation(); reorderFolder(folder.id, 'up'); };

            const btnDown = document.createElement('button');
            btnDown.className = 'tree-action-btn';
            btnDown.title = '下移';
            btnDown.innerHTML = '↓';
            btnDown.onclick = (e) => { e.stopPropagation(); reorderFolder(folder.id, 'down'); };

            const btnAdd = document.createElement('button');
            btnAdd.className = 'tree-action-btn';
            btnAdd.title = '新建子文件夹';
            btnAdd.innerHTML = '➕';
            btnAdd.onclick = (e) => { e.stopPropagation(); promptCreateFolder(folder.id); };

            actions.appendChild(btnUp);
            actions.appendChild(btnDown);
            actions.appendChild(btnAdd);

            item.appendChild(content);
            item.appendChild(actions);

            item.ondragover = handleDragOver;
            item.ondragleave = handleDragLeave;
            item.ondrop = (e) => { e.stopPropagation(); handleDrop(e, folder.id); };
            item.onclick = (e) => { e.stopPropagation(); navigateToFolder(folder.id); };

            el.appendChild(item);
            childrenContainer.appendChild(el);
            renderTreeNodes(folder.id, el);
        });
    };
    renderTreeNodes(null, rootWrapper);
}

function renderMainContent() {
    const contentGrid = document.getElementById('contentGrid');
    const breadcrumbText = document.getElementById('breadcrumbText');
    const breadcrumbCount = document.getElementById('breadcrumbCount');
    
    contentGrid.innerHTML = '';
    let itemsToRender = [];

    // 如果有全局搜索结果，优先渲染全局搜索视图
    if (store.globalSearchResults) {
        breadcrumbText.textContent = `全局全文搜索结果: "${store.searchQuery}"`;
        breadcrumbCount.textContent = `(共 ${store.globalSearchResults.length} 处匹配)`;
        
        const list = document.createElement('div');
        list.className = 'search-results-list';
        list.style.width = '100%';
        
        if (store.globalSearchResults.length === 0) {
            contentGrid.innerHTML = `<div class="empty-state">未在任何对话内容中找到关键词 "${escapeHTML(store.searchQuery)}"</div>`;
            return;
        }

        store.globalSearchResults.forEach(res => {
            let convoTitle = "未知对话";
            const contents = getFolderContents();
            for (const fId in contents) {
                const found = contents[fId].find(f => f.conversationId === res.conversationId);
                if (found) { convoTitle = found.title; break; }
            }

            const item = document.createElement('div');
            item.className = 'search-result-item';
            
            const safeKeyword = escapeHTML(res.keyword);
            const regex = new RegExp(`(${safeKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            const highlightedSnippet = escapeHTML(res.snippet).replace(regex, '<span class="search-result-keyword">$1</span>');

            item.innerHTML = `
                <div class="search-result-title">📄 ${escapeHTML(convoTitle)}</div>
                <div class="search-result-snippet">${highlightedSnippet}</div>
            `;
            
            item.onclick = () => {
                const assoc = store.chatAssociations[res.conversationId];
                openChatViewer(res.conversationId, convoTitle, assoc, res.keyword);
            };
            
            list.appendChild(item);
        });
        
        contentGrid.appendChild(list);
        return;
    }

    if (store.searchQuery) {
        breadcrumbText.textContent = `搜索结果: "${store.searchQuery}"`;
        const q = store.searchQuery.toLowerCase();
        getFolders().forEach(f => { if (f.name.toLowerCase().includes(q)) itemsToRender.push({ type: 'folder', data: f }); });
        Object.entries(getFolderContents()).forEach(([fId, files]) => {
            files.forEach(file => { if (file.title.toLowerCase().includes(q)) itemsToRender.push({ type: 'file', data: file, parentId: fId }); });
        });

        const folderCount = itemsToRender.filter(i => i.type === 'folder').length;
        const fileCount = itemsToRender.filter(i => i.type === 'file').length;
        breadcrumbCount.textContent = `(${folderCount} 个文件夹, ${fileCount} 个文件)`;

    } else {
        if (store.currentFolderId === null) breadcrumbText.textContent = '根目录';
        else {
            const f = getFolderById(store.currentFolderId);
            breadcrumbText.textContent = f ? `📁 ${f.name}` : '未知目录';
        }
        getChildrenFolders(store.currentFolderId).forEach(f => itemsToRender.push({ type: 'folder', data: f }));
        getFiles(store.currentFolderId).forEach(file => itemsToRender.push({ type: 'file', data: file, parentId: store.currentFolderId }));

        const totalRecursiveFiles = getRecursiveFileCount(store.currentFolderId);
        breadcrumbCount.textContent = `(共 ${totalRecursiveFiles} 个文件)`;
    }

    if (itemsToRender.length === 0) contentGrid.innerHTML = `<div class="empty-state">此文件夹为空</div>`;

    itemsToRender.forEach(item => {
        const isFolder = item.type === 'folder';
        const id = isFolder ? item.data.id : item.data.conversationId;
        const title = isFolder ? item.data.name : item.data.title;
        const date = new Date(isFolder ? item.data.createdAt : item.data.addedAt).toLocaleDateString();
        const itemIdKey = `${item.type}:${id}`;
        const isSelected = store.selectedItems.has(itemIdKey);

        const parentIdForPath = isFolder ? item.data.parentId : item.parentId;
        const pathHtml = store.searchQuery ? `<div class="item-path" title="${escapeHTML(getFolderPath(parentIdForPath))}">${escapeHTML(getFolderPath(parentIdForPath))}</div>` : '';

        const metaBtnHtml = `<button class="action-icon" title="查看JSON元数据" onclick='openMetaModal(event, ${JSON.stringify(item.data).replace(/'/g, "&apos;")})'>{}</button>`;
        const jumpLinkHtml = (!isFolder && item.data.url) ? `<a href="${item.data.url}" target="_blank" class="action-icon" title="在浏览器中打开">↗️</a>` : '';

        let chatBtnHtml = '';
        if (!isFolder) {
            const assoc = store.chatAssociations[id];
            const isImported = !!assoc;
            const statusClass = isImported ? 'imported' : 'not-imported';
            const statusTitle = isImported ? '查看对话记录' : '导入对话记录';
            chatBtnHtml = `<button class="action-icon chat-import-btn ${statusClass}" title="${statusTitle}" onclick="handleChatClick(event, '${id}', '${escapeHTML(title)}')">💬</button>`;
        }

        const card = document.createElement('div');
        card.className = `item-card ${isSelected ? 'selected' : ''}`;
        card.draggable = true;

        card.innerHTML = `
            <div class="checkbox-wrapper">
                <input type="checkbox" value="${itemIdKey}" ${isSelected ? 'checked' : ''}>
            </div>
            <div class="item-header">
                <div class="item-icon ${item.type}" title="${isFolder ? '点击进入文件夹' : '点击打开对话'}">${isFolder ? '📁' : '📄'}</div>
            </div>
            <div class="item-title-wrapper">
                <div class="item-title" title="${escapeHTML(title)}">${escapeHTML(title)}</div>
                <div class="icon-group">
                    ${chatBtnHtml}
                    ${metaBtnHtml}
                    ${jumpLinkHtml}
                </div>
            </div>
            <div class="item-meta">
                <div>${date}</div>
                ${pathHtml}
            </div>
        `;

        if (isFolder) {
            card.ondragover = handleDragOver;
            card.ondragleave = handleDragLeave;
            card.ondrop = (e) => { e.stopPropagation(); handleDrop(e, id); };
        }

        card.ondragstart = (e) => {
            let dragPayload = [];
            if (store.selectedItems.has(itemIdKey)) dragPayload = getTopLevelSelectedItems();
            else dragPayload.push({ type: item.type, id: id, sourceId: isFolder ? item.data.parentId : item.parentId });
            e.dataTransfer.setData('text/plain', JSON.stringify(dragPayload));
        };

        const checkbox = card.querySelector('input');
        const toggleCheckbox = () => {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) store.selectedItems.add(itemIdKey);
            else store.selectedItems.delete(itemIdKey);

            if (isFolder) cascadeSelectionDown(id, checkbox.checked);
            evaluateFolderSelection();
            updateSelectionBadge();
            renderMainContent();
        };

        checkbox.onclick = (e) => {
            e.stopPropagation();
            checkbox.checked = !checkbox.checked;
            toggleCheckbox();
        };

        card.onclick = (e) => {
            if (e.target.tagName.toLowerCase() === 'input' ||
                e.target.closest('a') ||
                e.target.closest('button') ||
                e.target.closest('.item-icon')) return;

            toggleCheckbox();
        };

        const iconEl = card.querySelector('.item-icon');
        iconEl.onclick = (e) => {
            e.stopPropagation();
            if (isFolder) navigateToFolder(id);
            else if (item.data.url) window.open(item.data.url, '_blank');
        };

        card.oncontextmenu = (e) => {
            e.preventDefault();
            if (!store.selectedItems.has(itemIdKey)) {
                store.selectedItems.clear();
                store.selectedItems.add(itemIdKey);
                if (isFolder) cascadeSelectionDown(id, true);
                evaluateFolderSelection();
                updateSelectionBadge();
                renderMainContent();
            }
            showContextMenu(e.clientX, e.clientY);
        };

        contentGrid.appendChild(card);
    });

    updateSelectionBadge();
}

function updateNavButtons() {
    document.getElementById('btnBack').disabled = navIndex === 0;
    document.getElementById('btnForward').disabled = navIndex === navHistory.length - 1;
}

function updateTotalFileCount() {
    if (!store.rawData) return;
    let total = 0;
    const contents = getFolderContents();
    for (const key in contents) total += contents[key].length;
    document.getElementById('totalFileCount').textContent = total;
}

function updateSelectionBadge() {
    let fileCount = 0;
    store.selectedItems.forEach(itemKey => { if (itemKey.startsWith('file:')) fileCount++; });
    document.getElementById('fileCount').textContent = fileCount;
    document.getElementById('clearSelectionBtn').disabled = store.selectedItems.size === 0;
}

function updateDataTimeDisplay(filename) {
    const display = document.getElementById('dataTimeDisplay');
    if (!display) return;
    const match = filename.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    if (match) {
        display.textContent = `${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
    } else {
        const shortName = filename.length > 20 ? filename.substring(0, 10) + '...' : filename;
        display.textContent = `${shortName}`;
    }
    display.style.display = 'block';
}

function renderChatSelectList(items) {
    const list = document.getElementById('chatSelectList');
    list.innerHTML = '';
    if (items.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">未找到匹配的对话记录</div>';
        return;
    }
    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'chat-select-item';
        const icon = item.type === 'folder' ? '📁' : '📄';
        const badge = item.type === 'folder' ? '文件夹' : '文件';
        el.innerHTML = `
        <div style="font-size: 18px;">${icon}</div>
        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div>
        <div class="chat-type-badge">${badge}</div>
    `;
        el.onclick = () => {
            if (confirm(`是否确认将该记录重命名为：\n"${currentBindingChatTitle}"\n并关联？`)) {
                confirmAndAssociateChat(currentBindingChatId, item.name, item.type, currentBindingChatTitle, currentBindingChatTitle);
            }
        };
        list.appendChild(el);
    });
}
