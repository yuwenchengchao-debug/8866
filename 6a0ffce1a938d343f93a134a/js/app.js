/* ============================================
   AI 多模型对话 - 主逻辑
   ============================================ */

// ==================== 状态管理 ====================
const state = {
    settings: {
        globalApiKey: '',
        globalBaseUrl: 'https://api.openai.com/v1',
        systemPrompt: '',
        models: [
            { type: 'openai', name: 'gpt-4o-mini', apiKey: '', baseUrl: '' },
            { type: 'openai', name: 'gpt-4o-mini', apiKey: '', baseUrl: '' },
            { type: 'openai', name: 'gpt-4o-mini', apiKey: '', baseUrl: '' },
        ],
        translate: { apiKey: '', baseUrl: '', modelName: 'doubao-pro-32k' },
    },
    isSending: false,
    abortControllers: [null, null, null],
    currentMode: 'chat',
    currentTheme: 'dark', // dark | auto | white | orange-white | gray | green
    translateDirection: 'zh2en', // zh2en | en2zh
    isTranslating: false,
    modelCount: 3, // 1, 2, or 3
    currentImages: [], // { id, dataUrl, name }
};

const MODEL_TYPE_LABELS = { openai: 'GPT/OpenAI', deepseek: 'DeepSeek', doubao: '豆包' };

// ==================== DOM 引用 ====================
const $ = id => document.getElementById(id);

const dom = {
    // 设置
    settingsBtn: $('settingsBtn'),
    settingsOverlay: $('settingsOverlay'),
    closeSettingsBtn: $('closeSettingsBtn'),
    saveSettingsBtn: $('saveSettingsBtn'),
    resetSettingsBtn: $('resetSettingsBtn'),
    globalApiKey: $('globalApiKey'),
    globalBaseUrl: $('globalBaseUrl'),
    systemPrompt: $('systemPrompt'),
    translateApiKey: $('translateApiKey'),
    translateBaseUrl: $('translateBaseUrl'),
    translateModelName: $('translateModelName'),

    // 聊天
    chatInput: $('chatInput'),
    sendBtn: $('sendBtn'),
    fileInput: $('fileInput'),
    uploadBtn: $('uploadBtn'),
    magicBtn: $('magicBtn'),
    clearMsgBtn: $('clearMsgBtn'),
    imagePreviewArea: $('imagePreviewArea'),

    // 主题
    themeModeBtn: $('themeModeBtn'),
    themeSelectBar: $('themeSelectBar'),

    // 翻译
    translateSource: $('translateSource'),
    translateResult: $('translateResult'),
    translateSwitchBtn: $('translateSwitchBtn'),
    translateSubmitBtn: $('translateSubmitBtn'),
    translateCopySourceBtn: $('translateCopySourceBtn'),
    translateCopyTargetBtn: $('translateCopyTargetBtn'),

    // 收藏
    bookmarkTitle: $('bookmarkTitle'),
    bookmarkUrl: $('bookmarkUrl'),
    bookmarkAddBtn: $('bookmarkAddBtn'),
    bookmarkList: $('bookmarkList'),
    bookmarkCount: $('bookmarkCount'),

    // 备忘
    noteInput: $('noteInput'),
    noteAddBtn: $('noteAddBtn'),
    noteList: $('noteList'),
    noteCount: $('noteCount'),

    toast: $('toast'),

    // 聊天会话
    sessionToggleBtn: $('sessionToggleBtn'),
    sessionToggleText: $('sessionToggleText'),
    sessionSidebar: $('sessionSidebar'),
    sessionSidebarClose: $('sessionSidebarClose'),
    sessionNewBtn: $('sessionNewBtn'),
    sessionList: $('sessionList'),
    sessionOverlay: $('sessionOverlay'),
};

const panels = [0, 1, 2].map(i => ({
    messages: $(`panelMessages${i}`),
    status: $(`panelStatus${i}`),
    name: $(`panelName${i}`),
    modelType: $(`modelType${i}`),
    modelName: $(`modelName${i}`),
    modelKey: $(`modelKey${i}`),
    modelUrl: $(`modelUrl${i}`),
}));

let bookmarkData = [];
let noteData = [];
let autoThemeTimer = null;

// ==================== 聊天会话管理 ====================

let chatSessions = [];
let currentSessionId = null;

function generateId() {
    return 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function getSession(id) {
    return chatSessions.find(s => s.id === id);
}

function createNewSession() {
    // 从现有会话中提取第一条消息作为标题
    const session = {
        id: generateId(),
        title: '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        modelCount: state.modelCount,
        messages: [], // { panel, role, text, images[] }
    };
    chatSessions.unshift(session);
    currentSessionId = session.id;
    saveSessions();
    return session;
}

function loadSessions() {
    try {
        const saved = localStorage.getItem('ai-chat-sessions');
        if (saved) {
            const data = JSON.parse(saved);
            chatSessions = data.sessions || [];
            currentSessionId = data.currentId || null;
        }
    } catch (e) { console.warn('加载聊天记录失败:', e); }

    // 如果没有会话，创建一个默认的
    if (chatSessions.length === 0) {
        createNewSession();
    } else if (currentSessionId && !getSession(currentSessionId)) {
        // 当前会话ID无效，用第一个
        currentSessionId = chatSessions[0].id;
    } else if (!currentSessionId) {
        currentSessionId = chatSessions[0].id;
    }
}

function saveSessions() {
    try {
        localStorage.setItem('ai-chat-sessions', JSON.stringify({
            sessions: chatSessions,
            currentId: currentSessionId,
        }));
    } catch (e) { console.warn('保存聊天记录失败:', e); }
}

/** 保存单条消息到当前会话 */
function saveMessage(role, panelIndex, text, images = []) {
    const session = getSession(currentSessionId);
    if (!session) return;

    session.messages.push({ panel: panelIndex, role, text, images });
    session.updatedAt = Date.now();

    // 更新标题：从第一条用户消息取前10个字
    if (role === 'user') {
        const firstUserMsg = session.messages.find(m => m.role === 'user');
        if (firstUserMsg && firstUserMsg.text) {
            const t = firstUserMsg.text.trim();
            session.title = t.length > 10 ? t.slice(0, 10) + '...' : t;
        }
    }

    saveSessions();
    renderSessionList();
    updateSessionToggleText();
}

/** 将某会话的消息加载到面板DOM */
function loadSessionToDOM(sessionId) {
    const session = getSession(sessionId);
    if (!session) return;

    currentSessionId = sessionId;

    // 先清空所有面板
    for (let i = 0; i < 3; i++) {
        panels[i].messages.innerHTML = '';
    }

    // 应用模型数量
    switchModelCount(session.modelCount || 3);

    // 填充消息
    if (!session.messages || session.messages.length === 0) {
        // 空会话显示欢迎消息
        const welcomeTexts = [
            '你好！我是 AI 助手 1，请问有什么可以帮助你的？',
            '你好！我是 AI 助手 2，请问有什么可以帮助你的？',
            '你好！我是 AI 助手 3，请问有什么可以帮助你的？',
        ];
        for (let i = 0; i < 3; i++) {
            const w = document.createElement('div');
            w.className = 'welcome-message';
            w.innerHTML = `<p>${welcomeTexts[i]}</p>`;
            panels[i].messages.appendChild(w);
        }
    } else {
        for (const msg of session.messages) {
            const p = msg.panel;
            if (p < 0 || p > 2) continue;
            const div = document.createElement('div');
            div.className = 'message ' + msg.role;
            if (msg.text) {
                const span = document.createElement('span');
                span.textContent = msg.text;
                div.appendChild(span);
            }
            for (const imgSrc of (msg.images || [])) {
                const img = document.createElement('img');
                img.className = 'message-image';
                img.src = imgSrc;
                div.appendChild(img);
            }
            panels[p].messages.appendChild(div);
        }
    }

    // 恢复状态
    updateSendButton();
    renderSessionList();
}

/** 切换会话 */
function switchSession(sessionId) {
    if (state.isSending) {
        showToast('请等待当前对话完成', '');
        return;
    }
    // 加载目标会话（消息已逐条保存）
    loadSessionToDOM(sessionId);
    showToast('已切换对话', 'success');
}

/** 新建会话 */
function startNewSession() {
    if (state.isSending) {
        showToast('请等待当前对话完成', '');
        return;
    }
    const session = createNewSession();
    loadSessionToDOM(session.id);
    updateSessionToggleText();
    showToast('已创建新对话', 'success');
}

/** 删除会话 */
function deleteSession(sessionId) {
    if (chatSessions.length <= 1) {
        showToast('至少保留一个对话', '');
        return;
    }
    if (!confirm('确定要删除这个对话吗？')) return;

    chatSessions = chatSessions.filter(s => s.id !== sessionId);
    if (currentSessionId === sessionId) {
        // 切换到第一个会话
        const next = chatSessions[0];
        currentSessionId = next.id;
        loadSessionToDOM(next.id);
    }
    saveSessions();
    renderSessionList();
    updateSessionToggleText();
    showToast('对话已删除', 'success');
}

/** 渲染会话列表 */
function renderSessionList() {
    const list = dom.sessionList;
    if (chatSessions.length === 0) {
        list.innerHTML = '<div class="session-list-empty">暂无聊天记录</div>';
        return;
    }
    list.innerHTML = chatSessions.map(s => {
        const isActive = s.id === currentSessionId;
        const time = new Date(s.updatedAt).toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        return `
            <div class="session-item ${isActive ? 'active' : ''}" data-id="${s.id}">
                <div class="session-item-icon">💬</div>
                <div class="session-item-info">
                    <div class="session-item-title">${escapeHtml(s.title)}</div>
                    <div class="session-item-time">${time}</div>
                </div>
                <button class="session-item-del" onclick="deleteSession('${s.id}')" title="删除">✕</button>
            </div>
        `;
    }).join('');

    // 点击项切换会话
    list.querySelectorAll('.session-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.session-item-del')) return;
            switchSession(item.dataset.id);
        });
    });
}

function updateSessionToggleText() {
    const session = getSession(currentSessionId);
    if (session) {
        dom.sessionToggleText.textContent = session.title.length > 8
            ? session.title.slice(0, 8) + '…'
            : session.title;
    }
}

function toggleSessionSidebar() {
    dom.sessionSidebar.classList.toggle('open');
    dom.sessionOverlay.classList.toggle('open');
}

function closeSessionSidebar() {
    dom.sessionSidebar.classList.remove('open');
    dom.sessionOverlay.classList.remove('open');
}

// ==================== 工具函数 ====================

function showToast(message, type = '') {
    const t = dom.toast;
    t.textContent = message;
    t.className = 'toast ' + type;
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function getModelConfig(panelIndex) {
    const m = state.settings.models[panelIndex];
    return {
        type: m.type,
        modelName: m.name,
        apiKey: m.apiKey || state.settings.globalApiKey,
        baseUrl: (m.baseUrl || state.settings.globalBaseUrl).replace(/\/+$/, ''),
    };
}

function getTranslateConfig() {
    const t = state.settings.translate;
    return {
        apiKey: t.apiKey || state.settings.globalApiKey,
        baseUrl: (t.baseUrl || state.settings.globalBaseUrl).replace(/\/+$/, ''),
        modelName: t.modelName || 'doubao-pro-32k',
    };
}

// ==================== 模式切换 ====================

function switchMode(mode) {
    state.currentMode = mode;

    // 隐藏所有页面
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));

    // 显示选中页面
    const pageMap = { chat: 'page-chat', translate: 'page-translate', bookmarks: 'page-bookmarks' };
    const target = document.querySelector('.' + pageMap[mode]);
    if (target) target.classList.add('active');

    // 更新 mode-btn
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // 关闭主题选择栏
    dom.themeSelectBar.classList.remove('open');
}

// ==================== 背景主题 ====================

/** 根据时间获取自动主题 */
function getAutoTheme() {
    const h = new Date().getHours();
    if (h >= 6 && h < 12) return 'white';      // 早上
    if (h >= 12 && h < 18) return 'orange-white'; // 下午
    return 'gray';                               // 晚上
}

function applyTheme(theme) {
    state.currentTheme = theme;
    document.body.className = '';

    if (theme === 'auto') {
        const autoTheme = getAutoTheme();
        document.body.classList.add('theme-' + autoTheme);
        // 每小时自动更新
        if (autoThemeTimer) clearInterval(autoThemeTimer);
        autoThemeTimer = setInterval(() => {
            if (state.currentTheme === 'auto') {
                document.body.className = '';
                document.body.classList.add('theme-' + getAutoTheme());
            }
        }, 3600000); // 1小时
    } else if (theme === 'dark') {
        // 默认深色，不加 class
    } else {
        document.body.classList.add('theme-' + theme);
        if (autoThemeTimer) { clearInterval(autoThemeTimer); autoThemeTimer = null; }
    }

    // 更新选择栏选中状态
    document.querySelectorAll('.theme-bar-btn').forEach(el => {
        el.classList.toggle('active', el.dataset.theme === theme);
    });

    // 更新弹窗按钮文字
    const themeLabels = {
        dark: '背景选择',
        auto: '自动变化',
        white: '固定白',
        'orange-white': '橘白',
        gray: '灰色',
        green: '绿色',
    };
    dom.themeModeBtn.textContent = `🎨 ${themeLabels[theme] || '背景选择'}`;

    // 保存到 localStorage
    try { localStorage.setItem('ai-chat-theme', theme); } catch (e) {}

    showToast(`已切换到「${themeLabels[theme] || theme}」主题`);
}

function toggleThemeBar() {
    dom.themeSelectBar.classList.toggle('open');
}

// ==================== 翻译 ====================

function updateTranslateUI() {
    const isZh2En = state.translateDirection === 'zh2en';
    const sourceLabel = dom.translateSource.parentElement.querySelector('.lang-name');
    const targetLabel = dom.translateResult.parentElement.querySelector('.lang-name');

    document.querySelectorAll('.translate-col .lang-name').forEach((el, idx) => {
        el.textContent = idx === 0 ? (isZh2En ? '中文' : '英文') : (isZh2En ? '英文' : '中文');
    });

    const placeholder = isZh2En ? '请输入要翻译的中文内容...' : 'Please enter English text...';
    dom.translateSource.placeholder = placeholder;

    const resultPlaceholder = isZh2En ? '英文翻译结果将显示在这里...' : '中文翻译结果将显示在这里...';
    dom.translateResult.innerHTML = `<span class="translate-result-placeholder">${resultPlaceholder}</span>`;

    // 清空输入和结果
    dom.translateSource.value = '';
    updateTranslateButtons();
}

function updateTranslateButtons() {
    const hasText = dom.translateSource.value.trim().length > 0;
    dom.translateSubmitBtn.disabled = !hasText || state.isTranslating;
    dom.translateCopySourceBtn.disabled = !hasText;
}

async function doTranslate() {
    const text = dom.translateSource.value.trim();
    if (!text || state.isTranslating) return;

    state.isTranslating = true;
    dom.translateSubmitBtn.disabled = true;
    dom.translateSubmitBtn.textContent = '翻译中...';

    const isZh2En = state.translateDirection === 'zh2en';
    const sourceLang = isZh2En ? '中文' : '英文';
    const targetLang = isZh2En ? '英文' : '中文';

    const systemPrompt = `你是一个专业的翻译助手。请将用户输入的${sourceLang}内容翻译成${targetLang}。只返回翻译结果，不要有任何额外说明。`;

    const config = getTranslateConfig();
    if (!config.apiKey) {
        showToast('请先在设置中配置翻译 API Key', 'error');
        state.isTranslating = false;
        dom.translateSubmitBtn.textContent = '翻译';
        return;
    }

    dom.translateResult.innerHTML = '<span style="color: var(--text-muted)">翻译中...</span>';

    try {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text },
                ],
                stream: true,
                temperature: 0.3,
                max_tokens: 4096,
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '未知错误');
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        dom.translateResult.innerHTML = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

            for (const line of lines) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content || '';
                    if (delta) {
                        fullContent += delta;
                        dom.translateResult.textContent = fullContent;
                    }
                } catch (e) {}
            }
        }

        dom.translateCopyTargetBtn.disabled = false;

    } catch (err) {
        dom.translateResult.innerHTML = `<span style="color: #ef4444">⚠️ 翻译失败: ${err.message}</span>`;
        showToast('翻译失败: ' + err.message, 'error');
    }

    state.isTranslating = false;
    dom.translateSubmitBtn.textContent = '翻译';
    updateTranslateButtons();
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('已复制到剪贴板', 'success');
    } catch {
        showToast('复制失败', 'error');
    }
}

// ==================== 收藏夹 ====================

function loadBookmarks() {
    try {
        const saved = localStorage.getItem('ai-chat-bookmarks');
        if (saved) bookmarkData = JSON.parse(saved);
    } catch (e) {}
    renderBookmarks();
}

function saveBookmarks() {
    try { localStorage.setItem('ai-chat-bookmarks', JSON.stringify(bookmarkData)); } catch (e) {}
}

function addBookmark() {
    const title = dom.bookmarkTitle.value.trim();
    const url = dom.bookmarkUrl.value.trim();
    if (!title || !url) { showToast('请填写网站名称和地址', ''); return; }

    let finalUrl = url;
    if (!/^https?:\/\//i.test(url)) finalUrl = 'https://' + url;

    // 获取网站图标
    let icon = '🌐';
    try {
        const hostname = new URL(finalUrl).hostname;
        icon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    } catch (e) {}

    bookmarkData.unshift({ id: Date.now(), title, url: finalUrl, icon });
    saveBookmarks();
    renderBookmarks();

    dom.bookmarkTitle.value = '';
    dom.bookmarkUrl.value = '';
    showToast('已添加收藏', 'success');
}

function deleteBookmark(id) {
    bookmarkData = bookmarkData.filter(b => b.id !== id);
    saveBookmarks();
    renderBookmarks();
}

function renderBookmarks() {
    dom.bookmarkCount.textContent = `${bookmarkData.length} 个`;
    if (bookmarkData.length === 0) {
        dom.bookmarkList.innerHTML = '<div class="bkm-empty">暂无收藏，添加一个网站吧</div>';
        return;
    }

    dom.bookmarkList.innerHTML = bookmarkData.map(b => `
        <div class="bkm-item">
            <div class="bkm-item-icon">
                ${b.icon && b.icon.startsWith('http')
                    ? `<img src="${b.icon}" width="16" height="16" style="border-radius:2px" onerror="this.style.display='none';this.parentElement.textContent='🌐'">`
                    : '🌐'}
            </div>
            <div class="bkm-item-info">
                <div class="bkm-item-title">${escapeHtml(b.title)}</div>
                <div class="bkm-item-url">${escapeHtml(b.url)}</div>
            </div>
            <a class="bkm-item-link" href="${b.url}" target="_blank" rel="noopener">打开</a>
            <button class="bkm-item-delete" onclick="deleteBookmark(${b.id})" title="删除">✕</button>
        </div>
    `).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== 备忘录 ====================

function loadNotes() {
    try {
        const saved = localStorage.getItem('ai-chat-notes');
        if (saved) noteData = JSON.parse(saved);
    } catch (e) {}
    renderNotes();
}

function saveNotes() {
    try { localStorage.setItem('ai-chat-notes', JSON.stringify(noteData)); } catch (e) {}
}

function addNote() {
    const content = dom.noteInput.value.trim();
    if (!content) { showToast('请输入备忘内容', ''); return; }

    noteData.unshift({
        id: Date.now(),
        content,
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
    });
    saveNotes();
    renderNotes();
    dom.noteInput.value = '';
    showToast('已添加备忘', 'success');
}

function deleteNote(id) {
    noteData = noteData.filter(n => n.id !== id);
    saveNotes();
    renderNotes();
}

function renderNotes() {
    dom.noteCount.textContent = `${noteData.length} 条`;
    if (noteData.length === 0) {
        dom.noteList.innerHTML = '<div class="bkm-empty">暂无备忘，添加一条吧</div>';
        return;
    }

    dom.noteList.innerHTML = noteData.map(n => `
        <div class="note-item">
            <div class="note-item-header">
                <span class="note-item-time">${n.time}</span>
                <div class="note-item-actions">
                    <button class="note-item-delete" onclick="deleteNote(${n.id})" title="删除">✕</button>
                </div>
            </div>
            <div class="note-item-content">${escapeHtml(n.content)}</div>
        </div>
    `).join('');
}

// ==================== 设置管理 ====================

function loadSettings() {
    try {
        const saved = localStorage.getItem('ai-chat-settings');
        if (saved) {
            const p = JSON.parse(saved);
            state.settings = { ...state.settings, ...p, models: p.models || state.settings.models, translate: { ...state.settings.translate, ...(p.translate || {}) } };
        }
    } catch (e) { console.warn('加载设置失败:', e); }

    // 加载主题
    try {
        const theme = localStorage.getItem('ai-chat-theme');
        if (theme) applyTheme(theme);
    } catch (e) {}
}

function applySettingsToUI() {
    dom.globalApiKey.value = state.settings.globalApiKey;
    dom.globalBaseUrl.value = state.settings.globalBaseUrl;
    dom.systemPrompt.value = state.settings.systemPrompt;
    dom.translateApiKey.value = state.settings.translate.apiKey || '';
    dom.translateBaseUrl.value = state.settings.translate.baseUrl || '';
    dom.translateModelName.value = state.settings.translate.modelName || 'doubao-pro-32k';

    for (let i = 0; i < 3; i++) {
        const m = state.settings.models[i];
        panels[i].modelType.value = m.type;
        panels[i].modelName.value = m.name;
        panels[i].modelKey.value = m.apiKey;
        panels[i].modelUrl.value = m.baseUrl;
    }
    updatePanelNames();
}

function saveSettingsToState() {
    state.settings.globalApiKey = dom.globalApiKey.value.trim();
    state.settings.globalBaseUrl = dom.globalBaseUrl.value.trim();
    state.settings.systemPrompt = dom.systemPrompt.value.trim();

    state.settings.translate = {
        apiKey: dom.translateApiKey.value.trim(),
        baseUrl: dom.translateBaseUrl.value.trim(),
        modelName: dom.translateModelName.value.trim() || 'doubao-pro-32k',
    };

    for (let i = 0; i < 3; i++) {
        state.settings.models[i] = {
            type: panels[i].modelType.value,
            name: panels[i].modelName.value.trim(),
            apiKey: panels[i].modelKey.value.trim(),
            baseUrl: panels[i].modelUrl.value.trim(),
        };
    }
}

function persistSettings() {
    try { localStorage.setItem('ai-chat-settings', JSON.stringify(state.settings)); } catch (e) { console.warn('保存设置失败:', e); }
}

function updatePanelNames() {
    const labels = ['AI 助手 1', 'AI 助手 2', 'AI 助手 3'];
    for (let i = 0; i < 3; i++) {
        const m = state.settings.models[i];
        const typeLabel = MODEL_TYPE_LABELS[m.type] || m.type;
        panels[i].name.textContent = m.name ? `${typeLabel}: ${m.name}` : labels[i];
    }
}

function openSettings() { applySettingsToUI(); dom.settingsOverlay.classList.add('open'); }
function closeSettings() { dom.settingsOverlay.classList.remove('open'); }

function saveSettings() {
    saveSettingsToState();
    persistSettings();
    updatePanelNames();
    closeSettings();
    showToast('设置已保存', 'success');
}

function resetSettings() {
    state.settings = {
        globalApiKey: '', globalBaseUrl: 'https://api.openai.com/v1', systemPrompt: '',
        models: [
            { type: 'openai', name: 'gpt-4o-mini', apiKey: '', baseUrl: '' },
            { type: 'openai', name: 'gpt-4o-mini', apiKey: '', baseUrl: '' },
            { type: 'openai', name: 'gpt-4o-mini', apiKey: '', baseUrl: '' },
        ],
        translate: { apiKey: '', baseUrl: '', modelName: 'doubao-pro-32k' },
    };
    applySettingsToUI();
    persistSettings();
    showToast('已恢复默认设置', 'success');
}

// ==================== 模型数量切换 ====================

function switchModelCount(count) {
    state.modelCount = count;

    // 更新按钮状态
    document.querySelectorAll('.count-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.count) === count);
    });

    // 更新面板可见性
    const grid = document.getElementById('chatGrid');
    grid.className = 'chat-grid panel-count-' + count;

    for (let i = 0; i < 3; i++) {
        const panel = document.querySelector(`.chat-panel[data-panel="${i}"]`);
        if (i < count) {
            panel.removeAttribute('data-hidden');
        } else {
            panel.setAttribute('data-hidden', 'true');
        }
    }
}

// ==================== 聊天功能 ====================

function addUserMessage(panelIndex, text, images = []) {
    const div = document.createElement('div');
    div.className = 'message user';
    if (text) {
        const textEl = document.createElement('span');
        textEl.textContent = text;
        div.appendChild(textEl);
    }
    // 显示图片
    for (const img of images) {
        const imgEl = document.createElement('img');
        imgEl.className = 'message-image';
        imgEl.src = img.dataUrl;
        imgEl.alt = img.name;
        div.appendChild(imgEl);
    }
    panels[panelIndex].messages.appendChild(div);
    scrollPanelBottom(panelIndex);
}

function addAssistantMessage(panelIndex) {
    const div = document.createElement('div');
    div.className = 'message assistant streaming';
    panels[panelIndex].messages.appendChild(div);
    scrollPanelBottom(panelIndex);
    return div;
}

function updateAssistantMessage(element, text) {
    const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    element.innerHTML = '<p>' + html + '</p>';
    const container = element.closest('.panel-messages');
    if (container) container.scrollTop = container.scrollHeight;
}

function finishAssistantMessage(element) { element.classList.remove('streaming'); }

function scrollPanelBottom(index) {
    const el = panels[index].messages;
    if (el) el.scrollTop = el.scrollHeight;
}

function setPanelStatus(index, text, cls = '') {
    panels[index].status.textContent = text;
    panels[index].status.className = 'panel-status' + (cls ? ' ' + cls : '');
}

function clearWelcomeMessage(index) {
    const w = panels[index].messages.querySelector('.welcome-message');
    if (w) w.remove();
}

async function streamChat(panelIndex, userMessage, images = [], signal) {
    const config = getModelConfig(panelIndex);
    const { apiKey, baseUrl, modelName } = config;

    if (!apiKey) { setPanelStatus(panelIndex, '缺少 API Key', 'error'); showToast(`助手 ${panelIndex + 1}: 请设置 API Key`, 'error'); return; }
    if (!modelName) { setPanelStatus(panelIndex, '缺少模型名称', 'error'); showToast(`助手 ${panelIndex + 1}: 请设置模型名称`, 'error'); return; }

    const messages = [];
    if (state.settings.systemPrompt) messages.push({ role: 'system', content: state.settings.systemPrompt });

    // 历史消息
    const msgElements = panels[panelIndex].messages.querySelectorAll('.message');
    const history = [];
    msgElements.forEach(el => {
        if (el.classList.contains('user')) {
            history.push({ role: 'user', content: el.textContent || '(图片消息)' });
        } else if (el.classList.contains('assistant') && !el.classList.contains('streaming')) {
            history.push({ role: 'assistant', content: el.textContent });
        }
    });
    messages.push(...history.slice(-10));

    // 构建当前用户消息（含图片）
    let userContent;
    if (images.length > 0) {
        userContent = [];
        if (userMessage) {
            userContent.push({ type: 'text', text: userMessage });
        }
        for (const img of images) {
            userContent.push({
                type: 'image_url',
                image_url: { url: img.dataUrl },
            });
        }
    } else {
        userContent = userMessage || '(图片消息)';
    }
    messages.push({ role: 'user', content: userContent });

    setPanelStatus(panelIndex, '思考中...', 'loading');

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: modelName, messages, stream: true, temperature: 0.7, max_tokens: 4096 }),
            signal,
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '未知错误');
            let errMsg;
            try { const j = JSON.parse(errText); errMsg = j.error?.message || j.message || errText; } catch { errMsg = errText; }
            throw new Error(`HTTP ${response.status}: ${errMsg}`);
        }

        setPanelStatus(panelIndex, '回复中...', 'loading');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const el = addAssistantMessage(panelIndex);
        let content = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
            for (const line of lines) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;
                try {
                    const p = JSON.parse(data);
                    const d = p.choices?.[0]?.delta?.content || '';
                    if (d) { content += d; updateAssistantMessage(el, content); }
                } catch (e) {}
            }
        }

        finishAssistantMessage(el);
        setPanelStatus(panelIndex, '已完成', 'done');
        saveMessage('assistant', panelIndex, content);

    } catch (err) {
        if (err.name === 'AbortError') { setPanelStatus(panelIndex, '已停止', ''); return; }
        setPanelStatus(panelIndex, '出错了', 'error');
        console.error(`助手 ${panelIndex + 1} 错误:`, err);
        const errorEl = document.createElement('div');
        errorEl.className = 'message assistant';
        errorEl.style.color = '#ef4444';
        errorEl.textContent = `⚠️ 请求失败: ${err.message}`;
        panels[panelIndex].messages.appendChild(errorEl);
        scrollPanelBottom(panelIndex);
    }
}

async function sendMessage() {
    if (state.isSending) return;
    const text = dom.chatInput.value.trim();
    const images = [...state.currentImages];
    if (!text && images.length === 0) return;

    state.isSending = true;
    dom.sendBtn.disabled = true;
    dom.chatInput.disabled = true;
    dom.chatInput.value = '';
    state.currentImages = [];
    renderImagePreviews();
    autoResizeInput();

    for (let i = 0; i < 3; i++) {
        clearWelcomeMessage(i);
        addUserMessage(i, text, images);
        // 逐条保存用户消息（含图片dataUrl）
        const imgDataUrls = images.map(img => img.dataUrl);
        saveMessage('user', i, text, imgDataUrls);
    }

    const promises = [0, 1, 2].map(i => {
        const c = new AbortController();
        state.abortControllers[i] = c;
        return streamChat(i, text, images, c.signal);
    });

    try { await Promise.allSettled(promises); }
    finally {
        state.isSending = false;
        dom.sendBtn.disabled = true;
        dom.chatInput.disabled = false;
        dom.chatInput.focus();
        state.abortControllers = [null, null, null];
    }
}

function autoResizeInput() {
    const el = dom.chatInput;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function updateSendButton() {
    const hasContent = dom.chatInput.value.trim().length > 0 || state.currentImages.length > 0;
    dom.sendBtn.disabled = !hasContent || state.isSending;
}

// ==================== 图片上传 ====================

function handleImageUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showToast(`不支持的文件类型: ${file.name}`, '');
            continue;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast(`图片过大 (最大10MB): ${file.name}`, '');
            continue;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            state.currentImages.push({
                id: Date.now() + Math.random(),
                dataUrl: ev.target.result,
                name: file.name,
            });
            renderImagePreviews();
            updateSendButton();
        };
        reader.readAsDataURL(file);
    }

    dom.fileInput.value = '';
}

function renderImagePreviews() {
    const area = dom.imagePreviewArea;
    if (state.currentImages.length === 0) {
        area.innerHTML = '';
        return;
    }
    area.innerHTML = state.currentImages.map(img => `
        <div class="image-preview-item" data-id="${img.id}">
            <img src="${img.dataUrl}" alt="${img.name}">
            <button class="image-preview-remove" onclick="removeImage(${img.id})">✕</button>
        </div>
    `).join('');
}

function removeImage(id) {
    state.currentImages = state.currentImages.filter(img => img.id !== id);
    renderImagePreviews();
    updateSendButton();
}

// ==================== 清空聊天 ====================

function clearAllMessages() {
    if (state.isSending) {
        showToast('请等待当前对话完成', '');
        return;
    }

    // 确认
    if (state.currentImages.length > 0 ||
        document.querySelector('.page-chat .message')) {
        if (!confirm('确定要清空所有聊天记录吗？')) return;
    }

    // 清空所有面板
    for (let i = 0; i < 3; i++) {
        const container = panels[i].messages;
        container.innerHTML = '';
        // 恢复欢迎消息
        const welcomeTexts = [
            '你好！我是 AI 助手 1，请问有什么可以帮助你的？',
            '你好！我是 AI 助手 2，请问有什么可以帮助你的？',
            '你好！我是 AI 助手 3，请问有什么可以帮助你的？',
        ];
        const welcome = document.createElement('div');
        welcome.className = 'welcome-message';
        welcome.innerHTML = `<p>${welcomeTexts[i]}</p>`;
        container.appendChild(welcome);
        setPanelStatus(i, '就绪', '');
    }

    // 清空图片
    state.currentImages = [];
    renderImagePreviews();

    // 清空输入
    dom.chatInput.value = '';
    autoResizeInput();
    updateSendButton();

    dom.chatInput.focus();
    showToast('聊天记录已清空', 'success');

    // 清空当前会话存储
    const session = getSession(currentSessionId);
    if (session) {
        session.messages = [];
        session.title = '新对话';
        session.updatedAt = Date.now();
        saveSessions();
        renderSessionList();
        updateSessionToggleText();
    }
}

// ==================== 事件绑定 ====================

function initEventListeners() {
    // 设置
    dom.settingsBtn.addEventListener('click', openSettings);
    dom.closeSettingsBtn.addEventListener('click', closeSettings);
    dom.saveSettingsBtn.addEventListener('click', saveSettings);
    dom.resetSettingsBtn.addEventListener('click', resetSettings);
    dom.settingsOverlay.addEventListener('click', e => { if (e.target === dom.settingsOverlay) closeSettings(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dom.settingsOverlay.classList.contains('open')) closeSettings(); });

    // 密码显示切换
    document.querySelectorAll('.toggle-pwd-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrapper = btn.closest('.password-input-wrapper');
            const input = wrapper.querySelector('.form-input');
            if (input.type === 'password') { input.type = 'text'; btn.textContent = '👁‍🗨'; }
            else { input.type = 'password'; btn.textContent = '👁'; }
        });
    });

    // ===== 模式切换 =====
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === 'theme') {
                toggleThemeBar();
                return;
            }
            switchMode(mode);
        });
    });

    // 点击其他模式时关闭主题选择栏
    document.addEventListener('click', (e) => {
        if (dom.themeSelectBar.classList.contains('open') &&
            !dom.themeSelectBar.contains(e.target) &&
            e.target !== dom.themeModeBtn &&
            !dom.themeModeBtn.contains(e.target)) {
            dom.themeSelectBar.classList.remove('open');
        }
    });

    // ===== 主题选择 =====
    document.querySelectorAll('.theme-bar-btn').forEach(el => {
        el.addEventListener('click', () => {
            applyTheme(el.dataset.theme);
            dom.themeSelectBar.classList.remove('open');
        });
    });

    // ===== 聊天 =====
    dom.sendBtn.addEventListener('click', sendMessage);
    dom.chatInput.addEventListener('input', () => { autoResizeInput(); updateSendButton(); });
    dom.chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // 图片上传
    dom.uploadBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleImageUpload);

    // 清空聊天
    dom.clearMsgBtn.addEventListener('click', clearAllMessages);

    // 魔法棒（保持演示）
    dom.magicBtn.addEventListener('click', () => showToast('✨ 图片反推提示词功能（演示中）'));

    // ===== 模型数量选择 =====
    document.querySelectorAll('.count-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchModelCount(parseInt(btn.dataset.count));
            // 保存模型数量到当前会话
            const session = getSession(currentSessionId);
            if (session) {
                session.modelCount = state.modelCount;
                saveSessions();
            }
        });
    });

    // ===== 翻译 =====
    dom.translateSwitchBtn.addEventListener('click', () => {
        state.translateDirection = state.translateDirection === 'zh2en' ? 'en2zh' : 'zh2en';
        updateTranslateUI();
    });
    dom.translateSource.addEventListener('input', updateTranslateButtons);
    dom.translateSubmitBtn.addEventListener('click', doTranslate);
    dom.translateSource.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doTranslate(); }
    });
    dom.translateCopySourceBtn.addEventListener('click', () => copyText(dom.translateSource.value));
    dom.translateCopyTargetBtn.addEventListener('click', () => copyText(dom.translateResult.textContent));

    // ===== 收藏 =====
    dom.bookmarkAddBtn.addEventListener('click', addBookmark);
    dom.bookmarkTitle.addEventListener('keydown', e => { if (e.key === 'Enter') dom.bookmarkUrl.focus(); });
    dom.bookmarkUrl.addEventListener('keydown', e => { if (e.key === 'Enter') addBookmark(); });

    // ===== 备忘 =====
    dom.noteAddBtn.addEventListener('click', addNote);
    dom.noteInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); }
    });

    // ===== 聊天会话侧栏 =====
    dom.sessionToggleBtn.addEventListener('click', toggleSessionSidebar);
    dom.sessionSidebarClose.addEventListener('click', closeSessionSidebar);
    dom.sessionNewBtn.addEventListener('click', startNewSession);
    dom.sessionOverlay.addEventListener('click', closeSessionSidebar);
}

// 挂载删除函数到 window（给内联 onclick 用）
window.deleteBookmark = deleteBookmark;
window.deleteNote = deleteNote;
window.removeImage = removeImage;
window.deleteSession = deleteSession;

// ==================== 初始化 ====================

function init() {
    loadSettings();
    applySettingsToUI();
    // 加载聊天会话并恢复上次会话
    loadSessions();
    loadSessionToDOM(currentSessionId);
    initEventListeners();
    updateSendButton();
    autoResizeInput();
    loadBookmarks();
    loadNotes();
    updateTranslateUI();
    updateTranslateButtons();
    renderSessionList();
    console.log('AI 多模型对话已启动 ✓');
}

document.addEventListener('DOMContentLoaded', init);
