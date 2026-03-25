function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

function isDescendant(potentialDescendantId, ancestorId) {
    let currentParentId = getFolderById(potentialDescendantId)?.parentId;
    while (currentParentId) {
        if (currentParentId === ancestorId) return true;
        currentParentId = getFolderById(currentParentId)?.parentId;
    }
    return false;
}
function sanitizeFileName(name) {
    if (!name) return '';
    // Windows 禁用字符: \ / : * ? " < > |
    // 替换为 - 并移除首尾空格
    return name.replace(/[\\/:*?"<>|]/g, '-').trim();
}

function getPureName(name) {
    if (!name) return '';
    // 使用 Unicode 属性匹配：保留所有语言的字母 (\p{L}) 和数字 (\p{N})，忽略标点符号和空格
    return name.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}
