const store = {
    rawData: null,
    currentFolderId: null,
    searchQuery: '',
    selectedItems: new Set(),
    chatAssociations: {}, // 新增对话内容关联数据
    globalSearchResults: null, // 新增全局全文搜索结果
    markers: { highlights: [], bookmarks: [] }, // 新增：划词与收藏标记
    currentView: 'explorer' // 新增：当前视图 ('explorer' | 'markers')
};
