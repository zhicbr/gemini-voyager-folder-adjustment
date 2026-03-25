// 对话查看与关联管理逻辑

let currentViewingChatId = null;
let chatSelectItemsData = [];
let currentBindingChatId = null;
let currentBindingChatTitle = '';

async function handleChatClick(event, id, title) {
    event.stopPropagation();
    const assoc = store.chatAssociations[id];
    if (assoc) {
        openChatViewer(id, title, assoc);
    } else {
        try {
            const data = await API.searchChatHistory(title);
            if (data.success && data.matches && data.matches.length > 0) {
                if (data.matches.length === 1) {
                    await confirmAndAssociateChat(id, data.matches[0].name, data.matches[0].type, title, title);
                } else {
                    openChatSelectModal(id, title, data.matches);
                }
            } else {
                openChatSelectModal(id, title, data.all || []);
            }
        } catch (err) {
            alert("请求后端搜索失败: " + err.message);
        }
    }
}

async function confirmAndAssociateChat(id, entryName, type, uiTitle, newName) {
    const pureEntry = getPureName(entryName);
    const pureNew = getPureName(newName);

    try {
        // 如果纯文本名称已匹配，则无需重命名（避免 Windows 非法字符问题）
        if (pureEntry !== pureNew) {
            const sanitizedNewName = sanitizeFileName(newName);
            const data1 = await API.renameChatHistory(entryName, sanitizedNewName, type);
            if (!data1.success) throw new Error(data1.error || "重命名失败");
            entryName = sanitizedNewName;
        }

        const data2 = await API.saveAssociation(id, entryName, type);
        if (data2.success) {
            store.chatAssociations[id] = { folderName: entryName, type, importedAt: Date.now() };
            renderMainContent();
            closeModal('chatSelectModal');
        } else {
            throw new Error("保存关联失败");
        }
    } catch (err) {
        alert("关联失败: " + err.message);
    }
}

function openChatSelectModal(id, title, items) {
    currentBindingChatId = id;
    currentBindingChatTitle = title;
    chatSelectItemsData = items;
    renderChatSelectList(items);
    document.getElementById('chatSelectSearch').value = '';
    document.getElementById('chatSelectModal').style.display = 'flex';
}

function filterChatSelectList(query) {
    const filtered = chatSelectItemsData.filter(i => i.name.toLowerCase().includes(query.toLowerCase()));
    renderChatSelectList(filtered);
}

async function openChatViewer(id, title, assoc, highlightKeyword = null) {
    currentViewingChatId = id;
    document.getElementById('chatViewerTitle').textContent = title;
    document.getElementById('chatViewerDate').textContent = new Date(assoc.importedAt).toLocaleString();
    document.getElementById('chatViewerTurns').textContent = '';
    document.getElementById('chatViewerSource').textContent = '';
    document.getElementById('chatViewerBody').innerHTML = '<div style="text-align:center; padding: 40px;">加载中...</div>';
    document.getElementById('chatViewerModal').style.display = 'flex';

    try {
        const data = await API.readChatHistory(assoc.folderName, assoc.type);
        if (data.success) {
            parseAndRenderMarkdown(data.content, data.basePath, highlightKeyword);
            if (highlightKeyword) {
                setTimeout(() => {
                    const firstMark = document.querySelector('#chatViewerBody mark');
                    if (firstMark) {
                        firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }
        } else {
            document.getElementById('chatViewerBody').innerHTML = `<div style="text-align:center; padding: 40px; color: red;">加载失败: ${escapeHTML(data.error)}</div>`;
        }
    } catch (err) {
        document.getElementById('chatViewerBody').innerHTML = `<div style="text-align:center; padding: 40px; color: red;">网络错误: ${err.message}</div>`;
    }
}

async function removeChatAssociation() {
    if (!currentViewingChatId) return;
    if (confirm("确定解除此对话的关联吗？（不会删除本地文件）")) {
        try {
            const data = await API.deleteAssociation(currentViewingChatId);
            if (data.success) {
                delete store.chatAssociations[currentViewingChatId];
                renderMainContent();
                closeModal('chatViewerModal');
            }
        } catch (err) {
            alert("解除关联失败: " + err.message);
        }
    }
}

// =====================================
// 划词与收藏 (Markers) 系统
// =====================================

document.getElementById('chatViewerBody').addEventListener('mouseup', handleMouseUp);

// 全局监听点击，清除页面上的模拟高亮和划词菜单
document.addEventListener('mousedown', (e) => {
    if (window.CSS && CSS.highlights) {
        CSS.highlights.delete("my-custom-highlight");
    }
    const oldMenu = document.querySelector('.marker-menu');
    if (oldMenu && !oldMenu.contains(e.target)) {
        oldMenu.remove();
    }
});

// 全局监听右键菜单，针对对话查看器进行强制屏蔽
window.addEventListener('contextmenu', e => {
    const modal = document.getElementById('chatViewerModal');
    if (modal && modal.style.display === 'flex') {
        if (e.target.closest('#chatViewerBody')) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }
}, true);

function handleMouseUp(e) {
    const selection = window.getSelection();
    if (selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text || text.length < 2) return;

    // 1. 获取原生的 Range 范围和位置
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // 2. 尝试阻止事件冒泡，减少部分浏览器插件的划词弹出干扰
    e.stopPropagation();

    // 3. 使用 CSS Highlight API 维持视觉上的高亮效果 (屏蔽 Edge 菜单的核心)
    if (window.CSS && CSS.highlights) {
        const highlight = new Highlight(range.cloneRange());
        CSS.highlights.set("my-custom-highlight", highlight);
    }
    
    // 4. 立即清除原生选区，让浏览器认为没有选词（从而屏蔽原生菜单）
    selection.removeAllRanges();

    // 5. 显示自定义菜单
    showMarkerMenu(rect.left + rect.width / 2, rect.top - 10, text);
}

function showMarkerMenu(x, y, text) {
    const menu = document.createElement('div');
    menu.className = 'marker-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.transform = 'translate(-50%, -100%)';

    const hlBtn = document.createElement('button');
    hlBtn.className = 'marker-menu-btn highlight';
    hlBtn.innerHTML = '<span>✨</span> 划词';
    hlBtn.onclick = () => { addHighlight(text); menu.remove(); };

    const div = document.createElement('div');
    div.className = 'marker-menu-divider';

    const bmBtn = document.createElement('button');
    bmBtn.className = 'marker-menu-btn bookmark';
    bmBtn.innerHTML = '<span>🔖</span> 收藏';
    bmBtn.onclick = () => { addBookmark(text); menu.remove(); };

    menu.appendChild(hlBtn);
    menu.appendChild(div);
    menu.appendChild(bmBtn);

    document.body.appendChild(menu);
}

async function addHighlight(text) {
    if (store.markers.highlights.some(h => h.text === text)) return;
    store.markers.highlights.push({ text, color: 'yellow', addedAt: Date.now() });
    await API.saveMarkers(store.markers);
    refreshChatViewer();
}

async function addBookmark(text) {
    if (store.markers.bookmarks.some(b => b.text === text && b.conversationId === currentViewingChatId)) return;
    store.markers.bookmarks.push({ 
        text, 
        conversationId: currentViewingChatId, 
        color: 'green', 
        addedAt: Date.now() 
    });
    await API.saveMarkers(store.markers);
    refreshChatViewer();
}

function refreshChatViewer() {
    const body = document.getElementById('chatViewerBody');
    const scrollPos = body.scrollTop;
    const assoc = store.chatAssociations[currentViewingChatId];
    if (!assoc) return;
    API.readChatHistory(assoc.folderName, assoc.type).then(data => {
        if (data.success) {
            parseAndRenderMarkdown(data.content, data.basePath);
            body.scrollTop = scrollPos;
        }
    });
}

function applyMarkers(html, conversationId, highlightKeyword = null) {
    let result = html;

    // 1. 全局划词 (Highlights) - 黄色
    store.markers.highlights.forEach(h => {
        const regex = new RegExp(`(${h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        result = result.replace(regex, '<mark class="hl-highlight">$1</mark>');
    });

    // 2. 局部收藏 (Bookmarks) - 绿色
    store.markers.bookmarks.forEach(b => {
        if (b.conversationId === conversationId) {
            const regex = new RegExp(`(${b.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            result = result.replace(regex, '<mark class="hl-bookmark">$1</mark>');
        }
    });

    // 3. 全局搜索关键词 (Search) - 默认高亮
    if (highlightKeyword) {
        const regex = new RegExp(`(${highlightKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        result = result.replace(regex, '<mark class="keyword">$1</mark>');
    }

    return result;
}

function parseAndRenderMarkdown(markdownText, basePath, highlightKeyword = null) {
    const bodyEl = document.getElementById('chatViewerBody');
    bodyEl.innerHTML = '';

    const topMatch = markdownText.match(/\*\*Date\*\*: (.*?)\n\*\*Turns\*\*: (.*?)\n\*\*Source\*\*: \[(.*?)\]\((.*?)\)/s);
    if (topMatch) {
        document.getElementById('chatViewerTurns').textContent = `Turns: ${topMatch[2]}`;
        document.getElementById('chatViewerSource').innerHTML = `Source: <a href="${escapeHTML(topMatch[4])}" target="_blank" style="color:var(--primary)">${escapeHTML(topMatch[3])}</a>`;
    }

    const parts = markdownText.split(/## Turn \d+/);
    for (let i = 1; i < parts.length; i++) {
        const turnText = parts[i];
        const divider = document.createElement('div');
        divider.className = 'chat-turn-divider';
        divider.textContent = `— Turn ${i} —`;
        bodyEl.appendChild(divider);

        const rolesRegex = /### 👤 User(.*?)### 🤖 Assistant(.*?)$/s;
        const match = turnText.match(rolesRegex);

        let userContent = '';
        let assistantContent = '';
        if (match) {
            userContent = match[1].trim();
            assistantContent = match[2].trim();
        } else {
            if (turnText.includes('### 👤 User')) userContent = turnText.split('### 👤 User')[1].trim();
            else userContent = turnText.trim();
        }

        if (userContent) bodyEl.appendChild(createChatBubble('user', userContent, basePath, highlightKeyword, currentViewingChatId));
        if (assistantContent) bodyEl.appendChild(createChatBubble('assistant', assistantContent, basePath, highlightKeyword, currentViewingChatId));
    }
}

function createChatBubble(role, contentMarkdown, basePath, highlightKeyword, conversationId) {
    const row = document.createElement('div');
    row.className = `chat-bubble-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-bubble-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    let processedMarkdown = contentMarkdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        let imgUrl = src.trim();
        if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
            imgUrl = `${basePath}/${imgUrl}`;
        }
        return `![${alt}](${imgUrl})`;
    });

    let htmlContent = '';
    if (typeof marked !== 'undefined') {
        htmlContent = marked.parse(processedMarkdown, { breaks: true });
    } else {
        htmlContent = escapeHTML(processedMarkdown);
    }

    // 应用标记系统
    htmlContent = applyMarkers(htmlContent, conversationId, highlightKeyword);

    bubble.innerHTML = htmlContent;
    bubble.querySelectorAll('img').forEach(img => {
        img.style.cursor = 'pointer';
        img.onclick = () => window.open(img.src, '_blank');
    });

    row.appendChild(avatar);
    row.appendChild(bubble);
    return row;
}

async function deleteHighlight(index) {
    if (confirm("确定要删除这条划词关键词吗？")) {
        store.markers.highlights.splice(index, 1);
        await API.saveMarkers(store.markers);
        if (store.currentView === 'markers') renderMarkersPage();
        else {
            // 如果在查看器中，尝试刷新
            if (currentViewingChatId) refreshChatViewer();
        }
    }
}

async function deleteBookmark(index) {
    if (confirm("确定要删除这条收藏句子吗？")) {
        store.markers.bookmarks.splice(index, 1);
        await API.saveMarkers(store.markers);
        if (store.currentView === 'markers') renderMarkersPage();
        else {
            if (currentViewingChatId) refreshChatViewer();
        }
    }
}
