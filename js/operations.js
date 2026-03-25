// 数据核心操作

function getFolders() { return store.rawData?.data?.folders || []; }
function getFolderContents() { return store.rawData?.data?.folderContents || {}; }
function getChildrenFolders(parentId) { return getFolders().filter(f => f.parentId === parentId).sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0)); }
function getFiles(folderId) { return getFolderContents()[folderId] || []; }
function getFolderById(id) { return getFolders().find(f => f.id === id); }

function getRecursiveFileCount(folderId) {
    let count = 0;
    if (folderId === null) {
        count += (getFolderContents()[null] || []).length;
        count += (getFolderContents()['__root_conversations__'] || []).length;
    } else {
        count += getFiles(folderId).length;
    }
    getChildrenFolders(folderId).forEach(sub => {
        count += getRecursiveFileCount(sub.id);
    });
    return count;
}

function findSourceId(type, id) {
    if (type === 'folder') return getFolderById(id)?.parentId;
    for (const [fId, files] of Object.entries(getFolderContents())) {
        if (files.some(f => f.conversationId === id)) return fId;
    }
    return null;
}

function getFolderPath(folderId) {
    if (!folderId) return '根目录';
    let path = [];
    let currentId = folderId;
    let depth = 0;
    while (currentId && depth < 20) {
        const f = getFolderById(currentId);
        if (f) {
            path.unshift(f.name);
            currentId = f.parentId;
        } else break;
        depth++;
    }
    return '根目录 / ' + path.join(' / ');
}

function promptCreateFolder(parentId) {
    const title = parentId ? "请输入新建子文件夹的名称：" : "请输入新建根文件夹的名称：";
    const name = prompt(title);
    if (!name || !name.trim()) return;

    const siblings = getChildrenFolders(parentId);
    const maxSortIndex = siblings.reduce((max, f) => Math.max(max, f.sortIndex || 0), -1);

    const newFolder = {
        id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: name.trim(),
        parentId: parentId,
        isExpanded: true,
        pinned: false,
        color: "default",
        sortIndex: maxSortIndex + 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    store.rawData.data.folders.push(newFolder);
    store.rawData.data.folderContents[newFolder.id] = [];
    renderAll();
}

function reorderFolder(folderId, direction) {
    const folder = getFolderById(folderId);
    if (!folder) return;

    let siblings = getChildrenFolders(folder.parentId);
    const index = siblings.findIndex(f => f.id === folderId);

    if (direction === 'up' && index > 0) {
        [siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]];
    } else if (direction === 'down' && index < siblings.length - 1) {
        [siblings[index], siblings[index + 1]] = [siblings[index + 1], siblings[index]];
    } else {
        return;
    }

    siblings.forEach((f, i) => {
        f.sortIndex = i;
        f.updatedAt = Date.now();
    });

    renderSidebar();
    if (store.currentFolderId === folder.parentId) {
        renderMainContent();
    }
}

function cascadeSelectionDown(folderId, isSelected) {
    getChildrenFolders(folderId).forEach(f => {
        if (isSelected) store.selectedItems.add(`folder:${f.id}`);
        else store.selectedItems.delete(`folder:${f.id}`);
        cascadeSelectionDown(f.id, isSelected);
    });
    getFiles(folderId).forEach(file => {
        if (isSelected) store.selectedItems.add(`file:${file.conversationId}`);
        else store.selectedItems.delete(`file:${file.conversationId}`);
    });
}

function evaluateFolderSelection() {
    const checkFolder = (folderId) => {
        const subfolders = getChildrenFolders(folderId);
        const files = getFiles(folderId);
        if (subfolders.length === 0 && files.length === 0) return store.selectedItems.has(`folder:${folderId}`);
        let allSelected = true;
        for (const sub of subfolders) if (!checkFolder(sub.id)) allSelected = false;
        for (const file of files) if (!store.selectedItems.has(`file:${file.conversationId}`)) allSelected = false;
        const folderKey = `folder:${folderId}`;
        if (allSelected && !store.selectedItems.has(folderKey)) store.selectedItems.add(folderKey);
        else if (!allSelected && store.selectedItems.has(folderKey)) store.selectedItems.delete(folderKey);
        return allSelected;
    };
    getChildrenFolders(null).forEach(f => checkFolder(f.id));
}

function getTopLevelSelectedItems() {
    let topLevelItems = [];
    store.selectedItems.forEach(itemKey => {
        const [type, id] = itemKey.split(':');
        let parentId = findSourceId(type, id);
        let isAncestorSelected = false;
        while (parentId) {
            if (store.selectedItems.has(`folder:${parentId}`)) { isAncestorSelected = true; break; }
            parentId = findSourceId('folder', parentId);
        }
        if (!isAncestorSelected) topLevelItems.push({ type, id, sourceId: findSourceId(type, id) });
    });
    return topLevelItems;
}

function moveItem(type, id, sourceFolderId, targetFolderId) {
    if (sourceFolderId === targetFolderId) return;
    if (type === 'folder') {
        if (id === targetFolderId) return;
        if (targetFolderId && isDescendant(targetFolderId, id)) {
            alert("非法操作：不能将文件夹移动到它的子文件夹中！");
            return;
        }
        const folderIndex = store.rawData.data.folders.findIndex(f => f.id === id);
        if (folderIndex > -1) {
            store.rawData.data.folders[folderIndex].parentId = targetFolderId;
            store.rawData.data.folders[folderIndex].updatedAt = Date.now();
        }
    } else if (type === 'file') {
        if (!store.rawData.data.folderContents[targetFolderId]) store.rawData.data.folderContents[targetFolderId] = [];
        const sourceArr = store.rawData.data.folderContents[sourceFolderId] || [];
        const fileIndex = sourceArr.findIndex(f => f.conversationId === id);
        if (fileIndex > -1) {
            const [fileObj] = sourceArr.splice(fileIndex, 1);
            store.rawData.data.folderContents[targetFolderId].push(fileObj);
        }
    }
}
