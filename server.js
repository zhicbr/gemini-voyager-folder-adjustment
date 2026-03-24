const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const CHAT_HISTORY_DIR = path.join(__dirname, 'chat_history');
const ASSOCIATIONS_FILE = path.join(__dirname, 'chat_associations.json');

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
        const data = readAssociations();
        delete data.associations[req.params.conversationId];
        writeAssociations(data);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============ 启动 ============

app.listen(PORT, () => {
    ensureAssociationsFile();
    console.log(`\n  🚀 Gemini Voyager 数据管理器已启动！`);
    console.log(`  📂 打开浏览器访问: http://localhost:${PORT}\n`);
});
