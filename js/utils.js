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
