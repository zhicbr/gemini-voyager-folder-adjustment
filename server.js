const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const CHAT_HISTORY_DIR = path.join(__dirname, 'chat_history');
const ASSOCIATIONS_FILE = path.join(__dirname, 'chat_associations.json');
const MARKERS_FILE = path.join(__dirname, 'markers.json');

app.use(express.json({ limit: '50mb' }));

// 静态文件服务：index.html 等根目录文件
app.use(express.static(__dirname, { index: 'index.html' }));

// 静态文件服务：chat_history 目录（用于图片等资源访问）
app.use('/chat_history', express.static(CHAT_HISTORY_DIR));

// ============ 工具函数 ============

function ensureAssociationsFile() {
    if (!fs.existsSync(ASSOCIATIONS_FILE)) {
        fs.writeFileSync(ASSOCIATIONS_FILE, JSON.stringify({ version: '1.0', associations: {} }, null, 2), 'utf-8');
    }
}

function readAssociations() {
    ensureAssociationsFile();
    try {
        return JSON.parse(fs.readFileSync(ASSOCIATIONS_FILE, 'utf-8'));
    } catch {
        return { version: '1.0', associations: {} };
    }
}

function writeAssociations(data) {
    fs.writeFileSync(ASSOCIATIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function ensureMarkersFile() {
    if (!fs.existsSync(MARKERS_FILE)) {
        fs.writeFileSync(MARKERS_FILE, JSON.stringify({ highlights: [], bookmarks: [] }, null, 2), 'utf-8');
    }
}

function readMarkers() {
    ensureMarkersFile();
    try {
        return JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf-8'));
    } catch {
        return { highlights: [], bookmarks: [] };
    }
}

function writeMarkers(data) {
    fs.writeFileSync(MARKERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 列出 chat_history 下所有对话条目
 * 返回: [{ name, type: 'folder'|'file', hasAssets }]
 */
function listChatEntries() {
    if (!fs.existsSync(CHAT_HISTORY_DIR)) return [];
    const entries = fs.readdirSync(CHAT_HISTORY_DIR, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const chatMdPath = path.join(CHAT_HISTORY_DIR, entry.name, 'chat.md');
            if (fs.existsSync(chatMdPath)) {
                const hasAssets = fs.existsSync(path.join(CHAT_HISTORY_DIR, entry.name, 'assets'));
                result.push({ name: entry.name, type: 'folder', hasAssets });
            }
        } else if (entry.name.endsWith('.md')) {
            result.push({ name: entry.name.replace(/\.md$/, ''), type: 'file', hasAssets: false, fileName: entry.name });
        }
    }
    return result;
}

// ============ API 路由 ============

// 列出 chat_history 下所有对话
app.get('/api/chat-history/list', (req, res) => {
    try {
        res.json({ success: true, data: listChatEntries() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 按标题搜索匹配对话
app.get('/api/chat-history/search', (req, res) => {
    try {
        const { title } = req.query;
        if (!title) return res.status(400).json({ success: false, error: 'title is required' });
        
        const entries = listChatEntries();
        
        // 1. 完全精确匹配
        let exactMatches = entries.filter(e => e.name === title);
        
        // 2. 将空格替换为-的匹配
        const dashedTitle = title.replace(/\s+/g, '-');
        let dashMatches = entries.filter(e => e.name === dashedTitle && !exactMatches.includes(e));
        
        // 3. 冲突重命名匹配，如 "Title (1)", "Title-with-dashes (2)"
        const isConflictMatch = (entryName, baseName) => {
            if (entryName.startsWith(baseName + ' (')) {
                const suffix = entryName.slice(baseName.length).trim();
                return /^\(\d+\)$/.test(suffix);
            }
            return false;
        };
        
        let conflictMatches = entries.filter(e => 
            (isConflictMatch(e.name, title) || isConflictMatch(e.name, dashedTitle)) &&
            !exactMatches.includes(e) && !dashMatches.includes(e)
        );
        
        const potentialMatches = [...exactMatches, ...dashMatches, ...conflictMatches];
        
        res.json({ success: true, matches: potentialMatches, all: entries });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 读取指定对话的内容
app.get('/api/chat-history/read', (req, res) => {
    try {
        const { name, type } = req.query;
        if (!name) return res.status(400).json({ success: false, error: 'name is required' });
        
        let content = '';
        let basePath = '';
        
        if (type === 'file') {
            // 独立 md 文件
            const filePath = path.join(CHAT_HISTORY_DIR, name + '.md');
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ success: false, error: 'File not found' });
            }
            content = fs.readFileSync(filePath, 'utf-8');
            basePath = '/chat_history';
        } else {
            // 文件夹形式
            const chatMdPath = path.join(CHAT_HISTORY_DIR, name, 'chat.md');
            if (!fs.existsSync(chatMdPath)) {
                return res.status(404).json({ success: false, error: 'chat.md not found' });
            }
            content = fs.readFileSync(chatMdPath, 'utf-8');
            basePath = `/chat_history/${encodeURIComponent(name)}`;
        }
        
        res.json({ success: true, content, basePath });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 重命名 chat_history 中的文件夹/文件
app.post('/api/chat-history/rename', (req, res) => {
    try {
        const { oldName, newName, type } = req.body;
        if (!oldName || !newName) return res.status(400).json({ success: false, error: 'oldName and newName are required' });
        
        if (type === 'file') {
            const oldPath = path.join(CHAT_HISTORY_DIR, oldName + '.md');
            const newPath = path.join(CHAT_HISTORY_DIR, newName + '.md');
            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, newPath);
            }
        } else {
            const oldPath = path.join(CHAT_HISTORY_DIR, oldName);
            const newPath = path.join(CHAT_HISTORY_DIR, newName);
            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, newPath);
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 读取关联数据
app.get('/api/associations', (req, res) => {
    try {
        res.json({ success: true, data: readAssociations() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 保存单条关联
app.post('/api/associations', (req, res) => {
    try {
        const { conversationId, folderName, type } = req.body;
        if (!conversationId || !folderName) {
            return res.status(400).json({ success: false, error: 'conversationId and folderName are required' });
        }
        const data = readAssociations();
        data.associations[conversationId] = {
            folderName,
            type: type || 'folder',
            importedAt: Date.now()
        };
        writeAssociations(data);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 删除单条关联
app.delete('/api/associations/:conversationId', (req, res) => {
    try {
        const id = req.params.conversationId;
        const data = readAssociations();
        if (data.associations[id]) {
            delete data.associations[id];
            writeAssociations(data);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 校验所有的关联数据是否存在
app.get('/api/associations/verify', (req, res) => {
    try {
        const data = readAssociations();
        const missing = [];
        let total = 0;
        
        for (const [conversationId, assoc] of Object.entries(data.associations)) {
            total++;
            const name = assoc.folderName;
            const type = assoc.type || 'folder';
            
            let exists = false;
            if (type === 'file') {
                exists = fs.existsSync(path.join(CHAT_HISTORY_DIR, name + '.md'));
            } else {
                exists = fs.existsSync(path.join(CHAT_HISTORY_DIR, name));
            }
            
            if (!exists) {
                missing.push({
                    conversationId,
                    folderName: name,
                    type
                });
            }
        }
        
        res.json({ success: true, total, missing });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 获取本地最新的数据 JSON
app.get('/api/latest-data', (req, res) => {
    try {
        const rootDir = process.cwd();
        const files = fs.readdirSync(rootDir);
        const dataFiles = files.filter(f => f.startsWith('gemini-voyager-folders-') && f.endsWith('.json'));
        
        if (dataFiles.length === 0) {
            return res.json({ success: false, message: '未找到数据文件' });
        }
        
        // 按照文件名排序（因为文件名带有时间戳，越晚的字典序排在越后）
        dataFiles.sort();
        const latestFile = dataFiles[dataFiles.length - 1]; // 最后一条就是最新的
        
        const filePath = path.join(rootDir, latestFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ success: true, filename: latestFile, data: JSON.parse(content) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 全局对话消息搜索接口
app.get('/api/search-messages', (req, res) => {
    try {
        const query = (req.query.q || '').toLowerCase();
        if (!query) return res.json({ success: true, results: [] });

        const data = readAssociations();
        const results = [];
        
        for (const [conversationId, assoc] of Object.entries(data.associations)) {
            const name = assoc.folderName;
            const type = assoc.type || 'folder';
            
            let filePath = '';
            if (type === 'file') {
                filePath = path.join(CHAT_HISTORY_DIR, name + '.md');
            } else {
                filePath = path.join(CHAT_HISTORY_DIR, name, 'chat.md');
            }
            
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lowerContent = content.toLowerCase();
                const idx = lowerContent.indexOf(query);
                
                if (idx !== -1) {
                    // 提取关键词前后的上下文摘要 (前后各取 40 个字符)
                    const snippetStart = Math.max(0, idx - 40);
                    const snippetEnd = Math.min(content.length, idx + query.length + 40);
                    let snippet = content.substring(snippetStart, snippetEnd).replace(/[\r\n]+/g, ' ').trim();
                    
                    if (snippetStart > 0) snippet = '...' + snippet;
                    if (snippetEnd < content.length) snippet = snippet + '...';
                    
                    results.push({
                        conversationId,
                        folderName: name,
                        snippet,
                        type,
                        keyword: req.query.q
                    });
                }
            }
        }
        
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 获取所有标记 (划词与收藏)
app.get('/api/markers', (req, res) => {
    try {
        res.json({ success: true, data: readMarkers() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 保存标记数据
app.post('/api/markers', (req, res) => {
    try {
        writeMarkers(req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============ 启动 ============

app.listen(PORT, () => {
    ensureAssociationsFile();
    ensureMarkersFile();
    console.log(`\n  🚀 Gemini Voyager 数据管理器已启动！`);
    console.log(`  📂 打开浏览器访问: http://localhost:${PORT}\n`);
});
