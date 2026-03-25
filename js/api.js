// API 调用封装
const API = {
    async getAssociations() {
        const res = await fetch('/api/associations');
        return await res.json();
    },

    async verifyAssociations() {
        const res = await fetch('/api/associations/verify');
        return await res.json();
    },

    async deleteAssociation(id) {
        const res = await fetch(`/api/associations/${id}`, { method: 'DELETE' });
        return await res.json();
    },

    async saveAssociation(id, folderName, type) {
        const res = await fetch('/api/associations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId: id, folderName, type })
        });
        return await res.json();
    },

    async batchSaveAssociations(list) {
        const res = await fetch('/api/associations/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ list })
        });
        return await res.json();
    },

    async searchChatHistory(title) {
        const res = await fetch(`/api/chat-history/search?title=${encodeURIComponent(title)}`);
        return await res.json();
    },

    async renameChatHistory(oldName, newName, type) {
        const res = await fetch('/api/chat-history/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldName, newName, type })
        });
        return await res.json();
    },

    async readChatHistory(name, type) {
        const res = await fetch(`/api/chat-history/read?name=${encodeURIComponent(name)}&type=${type}`);
        return await res.json();
    },

    async globalSearch(query) {
        const res = await fetch(`/api/search-messages?q=${encodeURIComponent(query)}`);
        return await res.json();
    },

    async getLatestData() {
        const res = await fetch('/api/latest-data');
        return await res.json();
    },

    async getMarkers() {
        const res = await fetch('/api/markers');
        return await res.json();
    },

    async saveMarkers(markers) {
        const res = await fetch('/api/markers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(markers)
        });
        return await res.json();
    },

    async unzipChats() {
        const res = await fetch('/api/unzip-chats', { method: 'POST' });
        return await res.json();
    }
};
