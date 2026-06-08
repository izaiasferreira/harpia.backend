const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', '..', 'docs');

// API: list markdown files
router.get('/api/files', (req, res) => {
    try {
        const files = fs.readdirSync(DOCS_DIR)
            .filter(f => f.endsWith('.md'))
            .map(f => ({
                name: f,
                label: f.replace(/\.md$/, '').replace(/_/g, ' '),
                path: `/raw-md/${f}`
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve rendered markdown viewer
router.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cenos - Documentação</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
    --sidebar: #1a1a2e;
    --sidebar-hover: #16213e;
    --accent: #0f3460;
    --text: #e0e0e0;
    --bg: #f5f5f5;
    --card: #fff;
}
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    height: 100vh;
    background: var(--bg);
    color: #333;
}
.sidebar {
    width: 280px;
    background: var(--sidebar);
    color: var(--text);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
}
.sidebar-header {
    padding: 20px;
    border-bottom: 1px solid rgba(255,255,255,.1);
}
.sidebar-header h1 { font-size: 18px; font-weight: 700; }
.sidebar-header p { font-size: 12px; opacity: .6; margin-top: 4px; }
.sidebar-search {
    padding: 12px;
    border-bottom: 1px solid rgba(255,255,255,.1);
}
.sidebar-search input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 6px;
    background: rgba(255,255,255,.08);
    color: #fff;
    font-size: 13px;
    outline: none;
}
.sidebar-search input::placeholder { color: rgba(255,255,255,.4); }
.file-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}
.file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all .15s;
    color: rgba(255,255,255,.7);
}
.file-item:hover { background: var(--sidebar-hover); color: #fff; }
.file-item.active { background: var(--accent); color: #fff; font-weight: 600; }
.file-item .icon { font-size: 16px; opacity: .7; }
.file-item .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    background: var(--card);
    border-bottom: 1px solid #e0e0e0;
}
.toolbar h2 { font-size: 16px; font-weight: 600; }
.toolbar .meta { font-size: 12px; color: #888; }
.content {
    flex: 1;
    overflow-y: auto;
    padding: 32px 48px;
    background: var(--card);
    margin: 16px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
    line-height: 1.7;
}
.content h1 { font-size: 28px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--accent); }
.content h2 { font-size: 22px; margin: 28px 0 12px; }
.content h3 { font-size: 18px; margin: 20px 0 8px; }
.content p { margin: 12px 0; }
.content code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.content pre { background: #1e1e2e; color: #cdd6f4; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 16px 0; }
.content pre code { background: none; padding: 0; color: inherit; }
.content table { border-collapse: collapse; width: 100%; margin: 16px 0; }
.content th, .content td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
.content th { background: #f8f8f8; font-weight: 600; }
.content tr:nth-child(even) { background: #fafafa; }
.content ul, .content ol { margin: 12px 0; padding-left: 24px; }
.content li { margin: 4px 0; }
.content blockquote { border-left: 4px solid var(--accent); padding: 8px 16px; margin: 16px 0; background: #f8f8ff; color: #555; }
.content a { color: var(--accent); text-decoration: none; }
.content a:hover { text-decoration: underline; }
.content img { max-width: 100%; border-radius: 8px; margin: 16px 0; }
.content hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }
.welcome { display: flex; align-items: center; justify-content: center; height: 100%; color: #999; font-size: 18px; flex-direction: column; gap: 12px; }
.welcome .big-icon { font-size: 64px; opacity: .3; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.25); }
@media (max-width: 768px) {
    .sidebar { width: 60px; }
    .sidebar-header p, .sidebar-search, .file-item .label { display: none; }
    .content { padding: 16px; margin: 8px; }
}
</style>
</head>
<body>
<nav class="sidebar">
    <div class="sidebar-header">
        <h1>📄 Cenos Docs</h1>
        <p>Documentação da API</p>
    </div>
    <div class="sidebar-search">
        <input type="text" id="searchInput" placeholder="Buscar docs..." oninput="filterFiles(this.value)">
    </div>
    <div class="file-list" id="fileList"></div>
</nav>
<div class="main">
    <div class="toolbar">
        <h2 id="docTitle">Documentação</h2>
        <span class="meta" id="docMeta"></span>
    </div>
    <div class="content" id="content">
        <div class="welcome">
            <div class="big-icon">📚</div>
            <div>Selecione um documento na sidebar</div>
        </div>
    </div>
</div>
<script>
let allFiles = [];
async function loadFiles() {
    const res = await fetch('/docsmd/api/files');
    allFiles = await res.json();
    renderFiles(allFiles);
    const hash = location.hash.slice(1);
    if (hash) {
        const match = allFiles.find(f => f.name === hash);
        if (match) loadDoc(match);
    }
}
function renderFiles(files) {
    const el = document.getElementById('fileList');
    el.innerHTML = files.map(f => \`
        <div class="file-item" onclick="loadDoc(this.__data)" data-name="\${f.name}">
            <span class="icon">📄</span>
            <span class="label">\${f.label}</span>
        </div>
    \`).join('');
    files.forEach((f, i) => { el.children[i].__data = f; });
}
function filterFiles(q) {
    const lower = q.toLowerCase();
    renderFiles(allFiles.filter(f => f.label.toLowerCase().includes(lower) || f.name.toLowerCase().includes(lower)));
}
async function loadDoc(file) {
    document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(\`.file-item[data-name="\${file.name}"]\`);
    if (activeEl) activeEl.classList.add('active');
    document.getElementById('docTitle').textContent = file.label;
    document.getElementById('docMeta').textContent = file.name;
    const res = await fetch('/raw-md/' + file.name);
    const md = await res.text();
    document.getElementById('content').innerHTML = marked.parse(md);
    location.hash = file.name;
    // Scroll to top
    document.querySelector('.content').scrollTop = 0;
}
loadFiles();
</script>
</body>
</html>`);
});

module.exports = router;
