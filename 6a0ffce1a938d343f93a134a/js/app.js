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
            { type: 'doubao', name: 'doubao-seed-2-0-mini-260428', apiKey: '', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
            { type: 'deepseek', name: 'deepseek-chat', apiKey: '', baseUrl: 'https://api.deepseek.com/v1' },
            { type: 'openai', name: 'gpt-4o-mini', apiKey: '', baseUrl: 'https://api.openai.com/v1' },
        ],
        translate: { apiKey: '', baseUrl: '', modelName: 'doubao-pro-32k', source: 'model2' },
    },
    isSending: false,
    followupGeneration: 0,
    abortControllers: [null, null, null],
    currentMode: 'chat',
    currentTheme: 'auto', // auto | white | orange-white | gray | green
    translateDirection: 'zh2en', // zh2en | en2zh
    isTranslating: false,
    enabledModels: [true, true, true], // 独立切换每个模型的启用/禁用
    currentImages: [], // { id, dataUrl, name }
    // 反推提示词偏好
    reversePrefs: {
        language: 'zh',
        platform: 'mj',
    },
    isReversing: false,
    isTranslatingReverse: false,
    reverseResultText: '',
    lastReverseResultHTML: '', // 保存上次反推结果，无图片时复用
    messageBookmarks: [], // { sessionId, panel, msgTime, text, sessionName, panelLabel }
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
    exportDataBtn: $('exportDataBtn'),
    importDataBtn: $('importDataBtn'),
    importFileInput: $('importFileInput'),

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

    // 反推提示词弹窗
    promptReverseOverlay: $('promptReverseOverlay'),
    closeReverseBtn: $('closeReverseBtn'),
    reverseImageArea: $('reverseImageArea'),
    reverseImagePreview: $('reverseImagePreview'),
    reverseResult: $('reverseResult'),
    reverseCopyBtn: $('reverseCopyBtn'),
    reverseTranslateBtn: $('reverseTranslateBtn'),
    reverseSubmitBtn: $('reverseSubmitBtn'),

    // 聊天会话
    sessionToggleBtn: $('sessionToggleBtn'),
    sessionToggleText: $('sessionToggleText'),
    sessionSidebar: $('sessionSidebar'),
    sessionSidebarClose: $('sessionSidebarClose'),
    sessionNewBtn: $('sessionNewBtn'),
    sessionList: $('sessionList'),
    sessionOverlay: $('sessionOverlay'),
    fullscreenBtn: $('fullscreenBtn'),
    searchBtn: $('searchBtn'),
    searchOverlay: $('searchOverlay'),
    globalSearchInput: $('globalSearchInput'),
    globalSearchClear: $('globalSearchClear'),
    globalSearchClose: $('globalSearchClose'),
    globalSearchResults: $('globalSearchResults'),
    // 消息收藏
    bookmarksBtn: $('sessionBookmarksBtn'),
    bookmarksOverlay: $('bookmarksOverlay'),
    bookmarksClose: $('bookmarksClose'),
    bookmarksList: $('bookmarksList'),
    // 对比模式
    compareBtn: $('compareBtn'),
    compareOverlay: $('compareOverlay'),
    compareGrid: $('compareGrid'),
    compareClose: $('compareClose'),
    comparePrev: $('comparePrev'),
    compareNext: $('compareNext'),
    compareRound: $('compareRound'),
    compareDiffToggle: $('compareDiffToggle'),
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

function getSessions() {
    return chatSessions || [];
}

function createNewSession() {
    // 从现有会话中提取第一条消息作为标题
    const session = {
        id: generateId(),
        title: '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        enabledModels: [...state.enabledModels],
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
/** 提取关键词（取内容前 4-10 个有效字符作为标签） */
function extractKeyword(text) {
    if (!text) return '';
    let s = text.replace(/^[\s\S]{0,3}?(你好|好的|当然|可以|没问题|收到|嗨|hello|hi)\s*/i, '').trim();
    // 去掉标点和空格
    s = s.replace(/[，。！？、；：""''（）【】《》\s,.!?;:'"()\[\]{}]/g, '');
    return s.substring(0, 10) || text.substring(0, 6);
}

function saveMessage(role, panelIndex, text, images = [], keyword = '') {
    const session = getSession(currentSessionId);
    if (!session) return;

    session.messages.push({ panel: panelIndex, role, text, images, keyword, time: Date.now() });
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

/** 格式化聊天时间 */
function formatChatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.getFullYear() === now.getFullYear() &&
                   d.getMonth() === now.getMonth() &&
                   d.getDate() === now.getDate();
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (isToday) return `今天 ${time}`;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

/** 创建时间分隔元素 */
function createTimeSeparator(ts) {
    const sep = document.createElement('div');
    sep.className = 'time-separator';
    sep.dataset.time = ts;
    sep.textContent = formatChatTime(ts);
    return sep;
}

/** 检查并添加时间分隔（间隔 >= 1 小时） */
function addTimeSeparatorIfNeeded(panelIndex, timestamp, lastTimesMap) {
    const container = panels[panelIndex].messages;
    const lastChild = container.lastElementChild;

    // 没有消息或只有欢迎语，不添加
    if (!lastChild || lastChild.classList.contains('welcome-message')) return;

    let lastTime = null;

    if (lastTimesMap && lastTimesMap[panelIndex] !== undefined) {
        // 从外部追踪表取时间（用于 loadSessionToDOM）
        lastTime = lastTimesMap[panelIndex];
    } else {
        // 从 DOM 中往前找最后一条 data-time
        let el = lastChild;
        while (el) {
            if (el.dataset && el.dataset.time && !isNaN(parseInt(el.dataset.time))) {
                lastTime = parseInt(el.dataset.time);
                break;
            }
            el = el.previousElementSibling;
        }
    }

    if (lastTime === null) return;

    // 间隔 >= 1 小时则添加分隔
    if (timestamp - lastTime >= 3600000) {
        container.appendChild(createTimeSeparator(timestamp));
    }
}

/** 保存消息收藏到 localStorage */
function saveMessageBookmarks() {
    try { localStorage.setItem('ai-chat-message-bookmarks', JSON.stringify(state.messageBookmarks)); } catch (e) {}
}

/** 加载消息收藏 */
function loadMessageBookmarks() {
    try {
        const data = localStorage.getItem('ai-chat-message-bookmarks');
        if (data) state.messageBookmarks = JSON.parse(data);
    } catch (e) {}
}

/** 切换消息收藏状态 */
function toggleMessageBookmark(sessionId, panelIndex, msgTime, text, sessionName, panelLabel) {
    const idx = state.messageBookmarks.findIndex(b => b.sessionId === sessionId && b.panel === panelIndex && b.msgTime === msgTime);
    if (idx >= 0) {
        state.messageBookmarks.splice(idx, 1);
        saveMessageBookmarks();
        return false;
    }
    state.messageBookmarks.push({
        sessionId, panel: panelIndex, msgTime,
        text: text.substring(0, 300),
        sessionName: sessionName || '未命名',
        panelLabel: panelLabel || `模型${panelIndex + 1}`,
        time: Date.now(),
    });
    saveMessageBookmarks();
    return true;
}

/** 收藏弹窗 */
function openMsgBookmarks() {
    dom.bookmarksOverlay.style.display = '';
    renderMsgBookmarks();
}

function closeMsgBookmarks() {
    dom.bookmarksOverlay.style.display = 'none';
}

function renderMsgBookmarks() {
    const list = dom.bookmarksList;
    if (state.messageBookmarks.length === 0) {
        list.innerHTML = '<div class="search-empty">暂无收藏的消息\n在 AI 回答上点击 ☆ 即可收藏</div>';
        return;
    }
    const items = [...state.messageBookmarks].sort((a, b) => (b.time || 0) - (a.time || 0));
    let html = `<div class="search-result-count">共 ${items.length} 条收藏</div>`;
    items.forEach((b, i) => {
        const snippet = b.text?.substring(0, 100) || '';
        const displayText = snippet.length < (b.text || '').length ? snippet + '...' : snippet;
        html += `
            <div class="search-result-item" data-bm-index="${i}">
                <div class="sr-header">
                    <span class="sr-role-tag sr-assistant">AI · ${b.panelLabel}</span>
                    <span class="sr-session">📄 ${b.sessionName}</span>
                    <button class="bm-remove-btn" data-bm-remove="${i}" title="取消收藏">✕</button>
                </div>
                <div class="sr-text">${displayText}</div>
            </div>
        `;
    });
    list.innerHTML = html;

    // 点击导航到消息
    list.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.bm-remove-btn')) return;
            const bm = items[parseInt(item.dataset.bmIndex)];
            if (bm) navigateToMsgBookmark(bm);
        });
    });

    // 移除收藏
    list.querySelectorAll('.bm-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const bm = items[parseInt(btn.dataset.bmRemove)];
            if (!bm) return;
            const idx = state.messageBookmarks.findIndex(
                b => b.sessionId === bm.sessionId && b.panel === bm.panel && b.msgTime === bm.msgTime
            );
            if (idx >= 0) {
                state.messageBookmarks.splice(idx, 1);
                saveMessageBookmarks();
                renderMsgBookmarks();
                showToast('已取消收藏', 'success');
            }
        });
    });
}

/** 导航到收藏的消息 */
function navigateToMsgBookmark(bm) {
    const session = getSession(bm.sessionId);
    if (!session) { showToast('该会话已不存在', 'error'); return; }

    // 切换会话
    switchSession(bm.sessionId);
    closeMsgBookmarks();

    // 在 DOM 中找到对应的消息
    setTimeout(() => {
        const panel = panels[bm.panel];
        if (!panel) return;
        const msgs = panel.messages.querySelectorAll('.message.assistant');
        // 找匹配的消息：用 msgTime 匹配，或回退到文本匹配
        let targetMsg = null;
        for (const m of msgs) {
            if (m.dataset.msgTime === String(bm.msgTime)) { targetMsg = m; break; }
        }
        // 回退：按文本匹配
        if (!targetMsg && bm.text) {
            const snippet = bm.text.substring(0, 50);
            for (const m of msgs) {
                if (m.textContent?.includes(snippet)) { targetMsg = m; break; }
            }
        }
        if (targetMsg) {
            targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 高亮闪烁
            targetMsg.style.transition = 'background 0.5s';
            targetMsg.style.background = 'var(--accent-blue)';
            targetMsg.style.background = 'rgba(99,102,241,0.15)';
            setTimeout(() => { targetMsg.style.background = ''; }, 1500);
        } else {
            showToast('消息已定位到会话', 'success');
        }
    }, 100);
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

    // 应用模型选择状态
    if (session.enabledModels) {
        state.enabledModels = [...session.enabledModels];
    } else {
        state.enabledModels = [true, true, true];
    }
    applyModelToggleState();

    // 填充消息
    if (!session.messages || session.messages.length === 0) {
        // 空会话显示欢迎消息
        const welcomeTexts = [
            '你好！我是 AI 助手 1，请问有什么可以帮助你的？',
            '你好！我是 AI 助手 2，请问有什么可以帮助你的？',
            '你好！我是 AI 助手 3，请问有什么可以帮助你的？',
        ];
        for (let i = 0; i < 3; i++) {
            if (!state.enabledModels[i]) continue;
            const w = document.createElement('div');
            w.className = 'welcome-message';
            w.innerHTML = `<p>${welcomeTexts[i]}</p>`;
            panels[i].messages.appendChild(w);
        }
    } else {
        const lastTimePerPanel = {};
        for (const msg of session.messages) {
            const p = msg.panel;
            if (p < 0 || p > 2) continue;
            if (!state.enabledModels[p]) continue;

            const msgTime = msg.time || session.createdAt || Date.now();
            addTimeSeparatorIfNeeded(p, msgTime, lastTimePerPanel);
            lastTimePerPanel[p] = msgTime;

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
            if (msg.keyword) div.dataset.keyword = msg.keyword;
            if (msg.time) div.dataset.msgTime = String(msg.time);
            // 为已保存的助手消息添加操作按钮
            if (msg.role === 'assistant') {
                finishAssistantMessage(div);
            }
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

/** 切换全屏模式 */
function toggleFullscreen() {
    document.body.classList.toggle('fullscreen-mode');
    dom.fullscreenBtn.classList.toggle('active');
    dom.fullscreenBtn.title = document.body.classList.contains('fullscreen-mode') ? '退出全屏' : '全屏模式';
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
    const source = state.settings.translate.source || 'model2';

    if (source === 'global') {
        return {
            apiKey: state.settings.globalApiKey,
            baseUrl: state.settings.globalBaseUrl.replace(/\/+$/, ''),
            modelName: 'gpt-4o-mini',
        };
    }

    // source 为 model0, model1, model2
    const idx = parseInt(source.replace('model', ''));
    if (idx >= 0 && idx < 3) {
        const m = state.settings.models[idx];
        return {
            apiKey: m.apiKey || state.settings.globalApiKey,
            baseUrl: (m.baseUrl || state.settings.globalBaseUrl).replace(/\/+$/, ''),
            modelName: m.name || 'doubao-pro-32k',
        };
    }

    // 兜底
    return {
        apiKey: state.settings.globalApiKey,
        baseUrl: state.settings.globalBaseUrl.replace(/\/+$/, ''),
        modelName: 'gpt-4o-mini',
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

// ==================== 对比模式 ====================

let _compareRounds = [];
let _compareCurrentIdx = 0;

/** 收集当前会话中所有轮次的对比数据 */
function collectCompareRounds() {
    _compareRounds = [];
    const session = getSession(currentSessionId);
    if (!session || !session.messages || session.messages.length === 0) return;

    const msgs = session.messages;
    let round = null;

    for (const msg of msgs) {
        if (msg.role === 'user') {
            // 新轮次开始
            round = { user: msg.text, models: [null, null, null] };
            _compareRounds.push(round);
        } else if (msg.role === 'assistant' && round && msg.panel >= 0 && msg.panel <= 2) {
            round.models[msg.panel] = { text: msg.text, keyword: msg.keyword };
        }
    }
}

/** 打开对比弹窗 */
function openCompare() {
    collectCompareRounds();
    const sess = getSession(currentSessionId);
    const hasAssistant = sess && sess.messages && sess.messages.some(m => m.role === 'assistant');
    if (!sess || _compareRounds.length === 0 || !hasAssistant) {
        showToast('暂无对话可对比，请先向模型提问', '');
        return;
    }

    _compareCurrentIdx = _compareRounds.length - 1;
    dom.compareOverlay.style.display = '';
    renderCompareRound();
}

/** 关闭对比弹窗 */
function closeCompare() {
    dom.compareOverlay.style.display = 'none';
}

/** 渲染当前选中轮次 */
function renderCompareRound() {
    const round = _compareRounds[_compareCurrentIdx];
    if (!round) return;

    const total = _compareRounds.length;
    const diffOn = dom.compareDiffToggle.checked;

    dom.compareRound.textContent = `第 ${_compareCurrentIdx + 1} 轮 / 共 ${total} 轮`;
    dom.comparePrev.disabled = _compareCurrentIdx <= 0;
    dom.compareNext.disabled = _compareCurrentIdx >= total - 1;

    // 找出实际参与本轮对话的模型（有回答文本的）
    const allMeta = [
        { label: '模型1', color: '#6366f1', icon: '🤖' },
        { label: '模型2', color: '#f59e0b', icon: '🔮' },
        { label: '模型3', color: '#10b981', icon: '✨' },
    ];
    const activePanels = [];
    for (let p = 0; p < 3; p++) {
        if (round.models[p] && round.models[p].text) {
            activePanels.push({ index: p, meta: allMeta[p] });
        }
    }
    const colCount = activePanels.length;
    if (colCount === 0) { dom.compareGrid.innerHTML = '<div class="compare-msg-empty" style="padding:80px 20px">暂无回答数据</div>'; return; }

    const texts = round.models.map(m => m?.text || '');
    const diff = diffOn ? computeDiff(texts) : null;

    // 统计卡
    let statsHtml = '';
    if (diff && diff.stats) {
        const s = diff.stats;
        let badges = '';
        for (const ap of activePanels) {
            const pi = ap.index;
            const badge = pi === 0 ? `<span class="stats-badge" style="--sbg:#6366f1;--stxt:#fff">🤖 ${s.unique[pi]}条独有</span>`
                       : pi === 1 ? `<span class="stats-badge" style="--sbg:#f59e0b;--stxt:#1a1a2e">🔮 ${s.unique[pi]}条独有</span>`
                       : `<span class="stats-badge" style="--sbg:#10b981;--stxt:#fff">✨ ${s.unique[pi]}条独有</span>`;
            badges += badge;
        }
        const totalS = s.unique[0] + s.unique[1] + s.unique[2] + s.consensus + s.partial;
        statsHtml = `
            <div class="compare-stats">
                <span class="compare-stats-title">📊 差异概览</span>
                <div class="compare-stats-badges">
                    ${badges}
                    <span class="stats-badge" style="--sbg:var(--border-color);--stxt:var(--text-muted)">☯ ${s.consensus}条共识</span>
                    <span class="stats-badge stats-badge-total">共 ${totalS} 句</span>
                </div>
            </div>
        `;
    }

    let html = statsHtml + `<div class="compare-grid grid-${colCount}">`;
    for (const ap of activePanels) {
        const p = ap.index;
        const meta = ap.meta;
        const msg = round.models[p];

        html += `<div class="compare-col">
            <div class="compare-col-header" style="color:${meta.color}; border-color:${meta.color}">
                ${meta.icon} ${meta.label}
            </div>`;

        // 关键词标签行（含图例）
        if (diff && diff.keywords && diff.keywords[p].length > 0) {
            html += '<div class="compare-kw-row">';
            html += '<div class="compare-kw-legend">';
            html += '<span>🔑 关键词</span>';
            html += '<span class="compare-kw-legend-dot" style="background:#fbbf24"></span> 独有';
            html += '<span class="compare-kw-legend-dot" style="background:#a78bfa"></span> 部分';
            html += '<span class="compare-kw-legend-dot" style="background:var(--border-color)"></span> 共识';
            html += '</div>';
            html += '<div class="compare-kw-tags">';
            for (const k of diff.keywords[p]) {
                const cls = k.type === 'unique' ? 'compare-kw-tag compare-kw-unique' :
                           k.type === 'consensus' ? 'compare-kw-tag compare-kw-consensus' :
                           'compare-kw-tag compare-kw-partial';
                const title = k.type === 'unique' ? '仅该模型提到' :
                             k.type === 'consensus' ? '三个模型都有' : '两个模型提到';
                html += `<span class="${cls}" title="${title}">${k.kw}</span>`;
            }
            html += '</div></div>';
        }

        if (!msg || !msg.text) {
            html += `<div class="compare-msg-empty">该模型未参与本轮对话</div>`;
        } else if (diffOn && diff) {
            html += `<div class="compare-msg">${diff.htmls[p]}</div>`;
        } else {
            const safe = msg.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += `<div class="compare-msg">${safe.replace(/\n/g, '<br>')}</div>`;
        }
        html += `</div>`;
    }
    html += '</div>';
    dom.compareGrid.innerHTML = html;
}

/**
 * 计算三个文本的差异，返回差异 HTML、统计数据和关键词标签
 */
function computeDiff(texts) {
    const sentences = texts.map(t => splitSentences(t));
    const results = sentences.map(() => []);
    const stats = { unique: [0, 0, 0], consensus: 0, partial: 0 };

    for (let i = 0; i < 3; i++) {
        for (const s of sentences[i]) {
            const trimmed = s.trim();
            if (!trimmed) continue;

            let matchCount = 0;
            for (let j = 0; j < 3; j++) {
                if (i === j) continue;
                if (sentenceSimilar(trimmed, sentences[j])) matchCount++;
            }

            const safeText = trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            if (matchCount === 2) {
                results[i].push(`<span class="compare-diff-consensus"><span class="compare-diff-tag compare-diff-tag-consensus">共识</span>${safeText}</span>`);
                if (i === 0) stats.consensus++;
            } else if (matchCount === 0) {
                results[i].push(`<span class="compare-diff-unique"><span class="compare-diff-tag compare-diff-tag-unique">独有</span>${safeText}</span>`);
                stats.unique[i]++;
            } else {
                results[i].push(safeText);
                if (i === 0) stats.partial++;
            }
        }
    }

    // 提取关键词并按模型分组，标注共识/独有
    const keywords = texts.map((t, pi) => {
        if (!t) return [];
        const raw = _extractCompareKeywords(t);
        const scored = raw.map(kw => {
            let matchCount = 0;
            for (let j = 0; j < 3; j++) {
                if (j === pi) continue;
                if (texts[j] && _extractCompareKeywords(texts[j]).includes(kw)) matchCount++;
            }
            return { kw, type: matchCount === 2 ? 'consensus' : matchCount === 0 ? 'unique' : 'partial' };
        });
        // 去重并保留最重要的（最多8个）
        return scored.filter((v, idx, arr) => arr.findIndex(x => x.kw === v.kw) === idx).slice(0, 8);
    });

    return {
        htmls: results.map(r => r.join('\n')),
        stats,
        keywords,
    };
}

/** 按中英文句号、问号、叹号、换行拆分为句子 */
function splitSentences(text) {
    if (!text) return [];
    // 保留分隔符在句子末尾
    return text.split(/(?<=[。！？\n])|(?<=\.\s)/).filter(s => s.trim()).map(s => s.trim());
}

/** 检查一条句子是否在句子列表中有相似内容（用词语重叠率判断） */
function sentenceSimilar(sentence, sentenceList) {
    const words = _extractCompareKeywords(sentence);
    if (words.length === 0) return false;

    for (const other of sentenceList) {
        const otherWords = _extractCompareKeywords(other);
        if (otherWords.length === 0) continue;
        const overlap = words.filter(w => otherWords.includes(w)).length;
        const ratio = overlap / Math.min(words.length, otherWords.length);
        if (ratio >= 0.25) return true; // 25% 以上词重叠即视为相似
    }
    return false;
}

/** 提取关键词（分词：取2字以上中文词、英文单词） */
function _extractCompareKeywords(text) {
    if (!text) return [];
    const tokens = [];
    // 提取中文词（2个字以上）
    const zhMatches = text.match(/[\u4e00-\u9fff]{2,}/g);
    if (zhMatches) tokens.push(...zhMatches);
    // 提取英文单词（3字符以上）
    const enMatches = text.match(/\b[a-zA-Z]{3,}\b/g);
    if (enMatches) tokens.push(...enMatches.map(w => w.toLowerCase()));
    return [...new Set(tokens)];
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
        else applyTheme('auto');
    } catch (e) {}
}

function applySettingsToUI() {
    dom.globalApiKey.value = state.settings.globalApiKey;
    dom.globalBaseUrl.value = state.settings.globalBaseUrl;
    dom.systemPrompt.value = state.settings.systemPrompt;

    // 更新翻译源选择按钮
    document.querySelectorAll('.translate-source-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === (state.settings.translate.source || 'model2'));
    });

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

    state.settings.translate.source = (document.querySelector('.translate-source-btn.active')?.dataset.source) || 'model2';

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

// ==================== 模型选择切换 ====================

/** 更新模型切换按钮的高亮状态 */
function updateModelToggleButtons() {
    document.querySelectorAll('.model-toggle-btn').forEach(btn => {
        const idx = parseInt(btn.dataset.model);
        btn.classList.toggle('active', state.enabledModels[idx]);
    });
}

/** 根据已启用的模型更新面板可见性和占位符 */
function applyModelToggleState() {
    const count = state.enabledModels.filter(Boolean).length;

    // 更新面板可见性
    for (let i = 0; i < 3; i++) {
        const panel = document.querySelector(`.chat-panel[data-panel="${i}"]`);
        if (state.enabledModels[i]) {
            panel.removeAttribute('data-hidden');
        } else {
            panel.setAttribute('data-hidden', 'true');
        }
    }

    // 更新网格列数
    const grid = document.getElementById('chatGrid');
    grid.className = 'chat-grid panel-count-' + count;

    // 更新输入框占位符
    const modelNames = ['模型 1', '模型 2', '模型 3'];
    const enabledNames = state.enabledModels.map((en, i) => en ? modelNames[i] : null).filter(Boolean);
    if (count === 0) {
        dom.chatInput.placeholder = '请先选择至少一个模型...';
    } else {
        dom.chatInput.placeholder = `输入你的问题，${count} 个 AI（${enabledNames.join('、')}）将同时回答...`;
    }
}

/** 切换单个模型的启用/禁用 */
function toggleModel(index) {
    // 至少保留一个模型
    const enabledCount = state.enabledModels.filter(Boolean).length;
    if (state.enabledModels[index] && enabledCount <= 1) {
        showToast('至少保留一个模型', '');
        return;
    }

    state.enabledModels[index] = !state.enabledModels[index];
    updateModelToggleButtons();
    applyModelToggleState();

    // 保存到当前会话
    const session = getSession(currentSessionId);
    if (session) {
        session.enabledModels = [...state.enabledModels];
        saveSessions();
    }
}

// ==================== 聊天功能 ====================

function addUserMessage(panelIndex, text, images = []) {
    addTimeSeparatorIfNeeded(panelIndex, Date.now());
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
    addTimeSeparatorIfNeeded(panelIndex, Date.now());
    const div = document.createElement('div');
    div.className = 'message assistant streaming';
    div.dataset.msgTime = Date.now();
    // 添加停止按钮（仅在 streaming 时显示）
    const stopBtn = document.createElement('button');
    stopBtn.className = 'msg-stop-btn';
    stopBtn.textContent = '⏹';
    stopBtn.title = '停止生成';
    stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.abortControllers[panelIndex]) {
            state.abortControllers[panelIndex].abort();
            // 立即清理，不依赖异步的 AbortError
            abortCleanup(panelIndex, div);
        }
    });
    div.appendChild(stopBtn);
    panels[panelIndex].messages.appendChild(div);
    scrollPanelBottom(panelIndex);
    return div;
}

function updateAssistantMessage(element, text) {
    const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    // 将内容放在单独的子容器中，避免覆盖停止按钮
    let contentEl = element.querySelector('.msg-content');
    if (!contentEl) {
        contentEl = document.createElement('div');
        contentEl.className = 'msg-content';
        // 放在停止按钮之后
        const stopBtn = element.querySelector('.msg-stop-btn');
        if (stopBtn) {
            stopBtn.after(contentEl);
        } else {
            element.prepend(contentEl);
        }
    }
    contentEl.innerHTML = '<p>' + html + '</p>';
    const container = element.closest('.panel-messages');
    if (container) container.scrollTop = container.scrollHeight;
}

function finishAssistantMessage(element) {
    element.classList.remove('streaming');
    // 移除停止按钮
    const stopBtn = element.querySelector('.msg-stop-btn');
    if (stopBtn) stopBtn.remove();

    // 检查是否已有操作按钮
    if (element.querySelector('.msg-actions')) return;

    // 设置关键词
    const text = element.textContent?.replace(/🔄|📋|🗑️/g, '').trim();
    if (text && text.length > 5 && !element.dataset.keyword) {
        element.dataset.keyword = extractKeyword(text);
    }

    // 获取面板索引
    const panelIndex = Array.from(document.querySelectorAll('.chat-panel')).indexOf(element.closest('.chat-panel'));

    // 添加复制、删除和重新生成按钮
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = `
        <button class="msg-action-btn msg-regenerate-btn" title="重新生成">🔄</button>
        <button class="msg-action-btn msg-copy-btn" title="复制">📋</button>
        <button class="msg-action-btn msg-bookmark-btn" title="收藏消息">☆</button>
        <button class="msg-action-btn msg-delete-btn" title="删除">🗑️</button>
    `;
    element.appendChild(actions);

    // 恢复收藏状态
    const msgTime = parseInt(element.dataset.msgTime);
    if (msgTime && state.messageBookmarks.some(b => b.msgTime === msgTime)) {
        const bmBtn = actions.querySelector('.msg-bookmark-btn');
        if (bmBtn) bmBtn.textContent = '⭐';
    }

    // 复制
    actions.querySelector('.msg-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const text = element.querySelector('p, span')?.textContent || element.textContent || '';
        // 去掉按钮文字
        const cleanText = text.replace(/📋|🗑️/g, '').trim();
        copyText(cleanText);
    });

    // 收藏消息
    actions.querySelector('.msg-bookmark-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const panelIndex = Array.from(document.querySelectorAll('.chat-panel')).indexOf(element.closest('.chat-panel'));
        const session = getSession(currentSessionId);
        if (!session) return showToast('请先开始对话', '');
        const msgTime = parseInt(element.dataset.msgTime) || Date.now();
        if (!element.dataset.msgTime) element.dataset.msgTime = String(msgTime);
        const text = (element.querySelector('.msg-content')?.textContent || element.textContent || '').replace(/☆|⭐/g, '').trim();
        const panelLabels = { 0: '模型1', 1: '模型2', 2: '模型3' };
        const isStarred = toggleMessageBookmark(
            session.id, panelIndex, msgTime, text,
            session.title || session.name || '未命名',
            panelLabels[panelIndex] || `模型${panelIndex + 1}`
        );
        e.target.textContent = isStarred ? '⭐' : '☆';
        showToast(isStarred ? '已收藏该消息' : '已取消收藏', 'success');
    });

    // 删除
    actions.querySelector('.msg-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const panelIndex = Array.from(document.querySelectorAll('.chat-panel')).indexOf(element.closest('.chat-panel'));
        const session = getSession(currentSessionId);

        // 在 DOM 中找到前一条用户消息并删除
        let prevEl = element.previousElementSibling;
        while (prevEl && !prevEl.classList.contains('message')) {
            prevEl = prevEl.previousElementSibling;
        }
        if (prevEl && prevEl.classList.contains('user')) {
            // 也移除其衍生询问
            const prevSug = prevEl.nextElementSibling;
            if (prevSug && prevSug.classList.contains('followup-suggestions')) prevSug.remove();
            prevEl.remove();
        }

        // 从会话中移除该消息及其对应的用户提问
        if (session) {
            const idx = session.messages.findIndex(m =>
                m.panel === panelIndex && m.role === 'assistant'
                && element.textContent.includes(m.text?.substring(0, 20) || '')
            );
            if (idx >= 0) {
                // 找到该助理消息前最近的同面板用户消息
                let userIdx = -1;
                for (let i = idx - 1; i >= 0; i--) {
                    if (session.messages[i].panel === panelIndex && session.messages[i].role === 'user') {
                        userIdx = i;
                        break;
                    }
                }
                // 先删用户（索引靠前），再删助理
                if (userIdx >= 0) {
                    session.messages.splice(userIdx, 1);
                    // 删除用户后助理索引减1
                    const adjIdx = session.messages.findIndex(m =>
                        m.panel === panelIndex && m.role === 'assistant'
                        && element.textContent.includes(m.text?.substring(0, 20) || '')
                    );
                    if (adjIdx >= 0) session.messages.splice(adjIdx, 1);
                } else {
                    session.messages.splice(idx, 1);
                }
                saveSessions();
            }
        }
        // 移除衍生询问
        const sug = element.nextElementSibling;
        if (sug && sug.classList.contains('followup-suggestions')) sug.remove();
        element.remove();
    });

    // 重新生成
    actions.querySelector('.msg-regenerate-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.isSending) return;
        const panelIndex = Array.from(document.querySelectorAll('.chat-panel')).indexOf(element.closest('.chat-panel'));
        // 找到该面板最后一条用户消息
        const panel = element.closest('.chat-panel');
        const msgs = panel.querySelectorAll('.message.user');
        const lastUserMsg = msgs[msgs.length - 1];
        if (!lastUserMsg) return;
        const userText = lastUserMsg.textContent?.trim() || '';

        // 从会话中移除旧回复
        const session = getSession(currentSessionId);
        if (session) {
            const idx = session.messages.findIndex(m =>
                m.panel === panelIndex && m.role === 'assistant'
                && element.textContent.includes(m.text?.substring(0, 20) || '')
            );
            if (idx >= 0) {
                session.messages.splice(idx, 1);
                saveSessions();
            }
        }
        // 移除衍生询问
        const sug = element.nextElementSibling;
        if (sug && sug.classList.contains('followup-suggestions')) sug.remove();
        element.remove();

        // 重新发起请求
        state.isSending = true;
        dom.sendBtn.disabled = true;
        dom.chatInput.disabled = true;
        const c = new AbortController();
        state.abortControllers[panelIndex] = c;
        streamChat(panelIndex, userText, [], c.signal).finally(() => {
            state.isSending = false;
            dom.sendBtn.disabled = true;
            dom.chatInput.disabled = false;
        });
    });

    // 生成衍生询问
    const msgText = element.textContent?.replace(/🔄|📋|🗑️/g, '').trim();
    if (msgText && msgText.length > 10) {
        generateFollowups(element, msgText, panelIndex);
    }
}

/** 为消息生成衍生询问建议（自动尝试所有可用的模型配置） */
function generateFollowups(element, assistantText, panelIndex) {
    // 如果已有建议则不重复生成
    if (element.nextElementSibling?.classList.contains('followup-suggestions')) return;

    // 获取最后一条用户消息
    const panel = element.closest('.chat-panel');
    const msgs = panel.querySelectorAll('.message');
    let lastUser = '';
    msgs.forEach(m => {
        if (m.classList.contains('user')) lastUser = m.textContent?.trim() || '';
    });

    if (!lastUser && !assistantText) return;

    const myGen = state.followupGeneration;

    const prompt = `你是一个对话助手。根据以下用户问题和你的回答，生成3个简短的相关追问（每个不超过15个字），让用户能继续深入对话。
用户问题：${lastUser?.substring(0, 200)}
你的回答：${assistantText?.substring(0, 500)}

只返回3个追问，每行一个，不要序号，不要额外说明。每个追问单独成行。`;

    // 收集所有可用的模型配置（按优先级：面板自身 → 全局 → 其他面板）
    const configs = [];
    const selfConfig = getModelConfig(panelIndex);
    if (selfConfig?.apiKey) configs.push(selfConfig);

    // 补充全局
    if (state.settings.globalApiKey) {
        configs.push({
            type: 'openai',
            modelName: 'gpt-4o-mini',
            apiKey: state.settings.globalApiKey,
            baseUrl: (state.settings.globalBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, ''),
        });
    }

    // 补充其他面板（去重）
    for (let i = 0; i < 3; i++) {
        if (i === panelIndex) continue;
        const cfg = getModelConfig(i);
        if (cfg?.apiKey && !configs.some(c => c.apiKey === cfg.apiKey && c.baseUrl === cfg.baseUrl)) {
            configs.push(cfg);
        }
    }

    // 逐个尝试
    function tryNext(index) {
        if (index >= configs.length) return;
        const config = configs[index];

        fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.modelName,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 200,
            }),
        })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(data => {
            const text = data.choices?.[0]?.message?.content || '';
            // 支持换行、逗号、顿号分隔
            let lines = text.split(/[\n,，、]+/).map(l => l.replace(/^\d+[.、.）)]?\s*/, '').trim()).filter(l => l.length > 2 && l.length < 40);
            // 也尝试按句号或问号分隔（如果上面没分出3个）
            if (lines.length < 3) {
                lines = text.split(/[。？！?！\n]+/).map(l => l.trim()).filter(l => l.length > 2 && l.length < 40);
            }
            if (lines.length < 2) { tryNext(index + 1); return; }

            // 轮次已过时，丢弃
            if (state.followupGeneration !== myGen) return;

            const container = document.createElement('div');
            container.className = 'followup-suggestions';
            lines.slice(0, 3).forEach(q => {
                const chip = document.createElement('span');
                chip.className = 'followup-chip';
                chip.textContent = q;
                chip.addEventListener('click', () => {
                    dom.chatInput.value = q;
                    autoResizeInput();
                    updateSendButton();
                    dom.chatInput.focus();
                    sendMessage();
                });
                container.appendChild(chip);
            });
            element.after(container);
        })
        .catch(() => tryNext(index + 1));
    }

    tryNext(0);
}

function scrollPanelBottom(index) {
    const el = panels[index].messages;
    if (el) el.scrollTop = el.scrollHeight;
}

// ==================== 全局搜索（跨会话） ====================

let lastSearchQuery = '';
let searchResultsData = [];

function openGlobalSearch() {
    dom.searchOverlay.style.display = '';
    dom.globalSearchInput.value = '';
    dom.globalSearchResults.innerHTML = '<div class="search-empty">输入关键词搜索所有聊天内容</div>';
    dom.globalSearchClear.style.display = 'none';
    setTimeout(() => dom.globalSearchInput.focus(), 100);
}

function closeGlobalSearch() {
    dom.searchOverlay.style.display = 'none';
    dom.globalSearchInput.value = '';
    dom.globalSearchClear.style.display = 'none';
    dom.globalSearchResults.innerHTML = '<div class="search-empty">输入关键词搜索所有聊天内容</div>';
    lastSearchQuery = '';
    searchResultsData = [];
    clearSearchHighlights();
}

function clearGlobalSearch() {
    dom.globalSearchInput.value = '';
    dom.globalSearchClear.style.display = 'none';
    dom.globalSearchResults.innerHTML = '<div class="search-empty">输入关键词搜索所有聊天内容</div>';
    lastSearchQuery = '';
    searchResultsData = [];
    clearSearchHighlights();
    dom.globalSearchInput.focus();
}

function clearSearchHighlights() {
    document.querySelectorAll('.message.search-highlight').forEach(el => el.classList.remove('search-highlight'));
}

function doGlobalSearch(query) {
    if (!query) {
        dom.globalSearchClear.style.display = 'none';
        dom.globalSearchResults.innerHTML = '<div class="search-empty">输入关键词搜索所有聊天内容</div>';
        lastSearchQuery = '';
        searchResultsData = [];
        clearSearchHighlights();
        return;
    }
    dom.globalSearchClear.style.display = 'flex';
    clearSearchHighlights();

    const ql = query.toLowerCase();
    lastSearchQuery = query;
    const results = [];

    // 遍历所有会话
    const sessions = getSessions();
    sessions.forEach(session => {
        if (!session.messages) return;
        session.messages.forEach((msg, idx) => {
            const text = (msg.text || '');
            const textLower = text.toLowerCase();
            if (!textLower.includes(ql)) return;

            // 计算匹配位置附近的片段
            const matchIdx = textLower.indexOf(ql);
            const snippetStart = Math.max(0, matchIdx - 30);
            const snippetEnd = Math.min(text.length, matchIdx + ql.length + 60);
            let snippet = text.substring(snippetStart, snippetEnd);
            // 如果片段被截断，加...
            if (snippetStart > 0) snippet = '...' + snippet;
            if (snippetEnd < text.length) snippet += '...';
            // 高亮匹配词
            const highlighted = snippet.replace(
                new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                m => `<em>${m}</em>`
            );

            const panelLabels = { 0: '模型1', 1: '模型2', 2: '模型3' };
            const roleLabel = msg.role === 'user' ? '用户' : 'AI';
            const roleClass = msg.role === 'user' ? 'sr-user' : 'sr-assistant';

            results.push({
                sessionId: session.id,
                sessionName: session.title || session.name || '未命名',
                role: msg.role,
                roleLabel,
                roleClass,
                panelIndex: msg.panel,
                panelLabel: panelLabels[msg.panel] || `模型${msg.panel + 1}`,
                msgIndex: idx,
                snippet: highlighted,
                fullMatch: text.substring(matchIdx, matchIdx + ql.length),
            });
        });
    });

    // 按会话分组排序
    results.sort((a, b) => a.sessionName.localeCompare(b.sessionName) || a.msgIndex - b.msgIndex);

    searchResultsData = results;

    if (results.length === 0) {
        dom.globalSearchResults.innerHTML = `<div class="search-empty">未找到包含 "<strong>${query}</strong>" 的内容</div>`;
        return;
    }

    // 渲染结果列表
    let html = `<div class="search-result-count">共 ${results.length} 条结果</div>`;
    results.forEach((r, ri) => {
        html += `
            <div class="search-result-item" data-result-index="${ri}">
                <div class="sr-header">
                    <span class="sr-role-tag ${r.roleClass}">${r.roleLabel} · ${r.panelLabel}</span>
                    <span class="sr-session">📄 ${escapeHtml(r.sessionName)}</span>
                </div>
                <div class="sr-text">${r.snippet}</div>
            </div>
        `;
    });
    dom.globalSearchResults.innerHTML = html;

    // 点击结果跳转
    dom.globalSearchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const ri = parseInt(item.dataset.resultIndex);
            const r = searchResultsData[ri];
            if (!r) return;
            closeGlobalSearch();
            // 切换到对应会话
            if (currentSessionId !== r.sessionId) {
                switchSession(r.sessionId);
            }
            // 等待 DOM 渲染后定位消息
            setTimeout(() => {
                scrollToMessage(r.sessionId, r.panelIndex, r.msgIndex, r.role, r.fullMatch);
            }, 150);
        });
    });
}

function scrollToMessage(sessionId, panelIndex, msgIndex, role, matchText) {
    const panel = panels[panelIndex];
    if (!panel) return;
    const msgs = panel.messages.querySelectorAll('.message');
    // 从后往前找匹配的消息
    for (let i = msgs.length - 1; i >= 0; i--) {
        const el = msgs[i];
        if (!el.classList.contains(role)) continue;
        const text = el.textContent?.trim() || '';
        if (text.includes(matchText)) {
            el.classList.add('search-highlight');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => el.classList.remove('search-highlight'), 3000);
            return;
        }
    }
    // 精确匹配失败，尝试模糊匹配
    for (let i = msgs.length - 1; i >= 0; i--) {
        const el = msgs[i];
        if (!el.classList.contains(role)) continue;
        const text = el.textContent?.trim() || '';
        const searchQ = dom.globalSearchInput.value || lastSearchQuery;
        if (searchQ && text.toLowerCase().includes(searchQ.toLowerCase())) {
            el.classList.add('search-highlight');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => el.classList.remove('search-highlight'), 3000);
            return;
        }
    }
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function setPanelStatus(index, text, cls = '') {
    panels[index].status.textContent = text;
    panels[index].status.className = 'panel-status' + (cls ? ' ' + cls : '');
}

function clearWelcomeMessage(index) {
    const w = panels[index].messages.querySelector('.welcome-message');
    if (w) w.remove();
}

/** 中断 AI 回答时的清理：移除 streaming、停止按钮、用户提问 */
function abortCleanup(panelIndex, el) {
    if (el) {
        if (el.dataset.aborted === 'true') return;
        el.dataset.aborted = 'true';
        el.classList.remove('streaming');
        const sBtn = el.querySelector('.msg-stop-btn');
        if (sBtn) sBtn.remove();
        // 移除该面板中对应的用户提问（不能用 :last-of-type，因为后面有assistant div）
        const userMsgs = panels[panelIndex].messages.querySelectorAll('.message.user');
        const userMsg = userMsgs[userMsgs.length - 1];
        if (userMsg) userMsg.remove();
        // 从会话数据中删除该面板的最后一条用户消息
        const session = getSession(currentSessionId);
        if (session) {
            for (let i = session.messages.length - 1; i >= 0; i--) {
                if (session.messages[i].panel === panelIndex && session.messages[i].role === 'user') {
                    session.messages.splice(i, 1);
                    break;
                }
            }
            saveSessions();
        }
    }
    setPanelStatus(panelIndex, '已停止', '');
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
        let el;
        let content = '';

        el = addAssistantMessage(panelIndex);
        while (true) {
            if (signal.aborted) { abortCleanup(panelIndex, el); return; }
            const { done, value } = await reader.read();
            if (done) break;
            if (signal.aborted) { abortCleanup(panelIndex, el); return; }
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
        saveMessage('assistant', panelIndex, content, [], extractKeyword(content));

    } catch (err) {
        if (err.name === 'AbortError') { abortCleanup(panelIndex, el); return; }
        setPanelStatus(panelIndex, '出错了', 'error');
        console.error(`助手 ${panelIndex + 1} 错误:`, err);
        const errorEl = document.createElement('div');
        errorEl.className = 'message assistant';
        errorEl.style.color = '#ef4444';
        errorEl.textContent = `⚠️ 请求失败: ${err.message}`;
        panels[panelIndex].messages.appendChild(errorEl);
        scrollPanelBottom(panelIndex);
        finishAssistantMessage(errorEl);
        saveMessage('assistant', panelIndex, errorEl.textContent, [], extractKeyword(errorEl.textContent));
    }
}

async function sendMessage() {
    if (state.isSending) return;
    const text = dom.chatInput.value.trim();
    const images = [...state.currentImages];
    if (!text && images.length === 0) return;

    state.isSending = true;
    dom.sendBtn.disabled = true;
    dom.chatInput.value = '';
    state.currentImages = [];
    renderImagePreviews();
    autoResizeInput();

    for (let i = 0; i < 3; i++) {
        if (!state.enabledModels[i]) continue;
        clearWelcomeMessage(i);
        // 隐藏旧的衍生咨询
        panels[i].messages.querySelectorAll('.followup-suggestions').forEach(el => el.remove());
    }
    state.followupGeneration++;

    for (let i = 0; i < 3; i++) {
        if (!state.enabledModels[i]) continue;
        addUserMessage(i, text, images);
        // 逐条保存用户消息（含图片dataUrl）
        const imgDataUrls = images.map(img => img.dataUrl);
        saveMessage('user', i, text, imgDataUrls);
    }

    const promises = state.enabledModels.map((en, i) => {
        if (!en) return Promise.resolve();
        const c = new AbortController();
        state.abortControllers[i] = c;
        return streamChat(i, text, images, c.signal);
    });

    try { await Promise.allSettled(promises); }
    finally {
        state.isSending = false;
        dom.sendBtn.disabled = true;
        dom.chatInput.focus();
        state.abortControllers = [null, null, null];
    }
}

function autoResizeInput() {
    const el = dom.chatInput;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 344) + 'px';
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

/** Ctrl+V 粘贴图片处理 */
function handlePasteImage(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (!item.type.startsWith('image/')) continue;

        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        if (file.size > 10 * 1024 * 1024) {
            showToast('图片过大（最大10MB）', '');
            continue;
        }

        // 生成随机文件名
        const ext = file.type.split('/')[1] || 'png';
        const name = `粘贴图片_${Date.now()}.${ext}`;

        const reader = new FileReader();
        reader.onload = (ev) => {
            state.currentImages.push({
                id: Date.now() + Math.random(),
                dataUrl: ev.target.result,
                name,
            });
            renderImagePreviews();
            updateSendButton();
            showToast('📋 已粘贴图片', 'success');
        };
        reader.readAsDataURL(file);
        break; // 只取第一张图片
    }
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

// ==================== 图片反推提示词 ====================

const REVERSE_PLATFORMS = {
    mj: { label: 'MidJourney', color: '#22c55e' },
    gpt: { label: 'GPT', color: '#6366f1' },
    jimeng: { label: '即梦', color: '#f59e0b' },
    sd: { label: 'Stable Diffusion', color: '#ec4899' },
    doubao: { label: '豆包', color: '#10b981' },
};

const REVERSE_SYSTEM_PROMPTS = {
    zh: {
        mj: '你是一个专业的 MidJourney 提示词工程师。请根据用户提供的图片，生成一段详细的英文 MidJourney 提示词，包含主体、风格、光线、构图、色彩等描述，并添加适当的 MidJourney 参数（如 --ar 16:9, --v 6, --s 250 等）。只返回提示词本身，不要有任何额外说明。',
        gpt: '你是一个专业的 DALL-E / GPT 图片提示词专家。请根据用户提供的图片，生成一段详细的英文图片描述提示词，适合在 GPT 中使用。要求描述清晰、结构完整，包含主体、环境、风格、光线、色调等细节。只返回提示词本身，不要有任何额外说明。',
        jimeng: '你是一个专业的即梦（Jimeng）提示词工程师。请根据用户提供的图片，生成一段详细的中文图片描述提示词，适合在即梦平台使用。要求包含主体、风格、光线、构图、色彩等描述，语言优美生动。只返回提示词本身，不要有任何额外说明。',
        sd: '你是一个专业的 Stable Diffusion 提示词工程师。请根据用户提供的图片，生成一段详细的英文 Stable Diffusion 提示词，包含主体、风格、光线、构图等描述，使用 SD 常用关键词（如 masterpiece, best quality, highly detailed 等），并推荐负面提示词。只返回提示词本身，不要有任何额外说明。',
        doubao: '你是一个专业的豆包图片提示词工程师。请根据用户提供的图片，生成一段详细的中文图片描述提示词，适合在豆包平台使用。要求包含主体、环境、风格、光线、色调等细节，语言生动具体。只返回提示词本身，不要有任何额外说明。',
    },
    en: {
        mj: 'You are a professional MidJourney prompt engineer. Based on the user\'s image, generate a detailed MidJourney prompt including subject, style, lighting, composition, colors, and appropriate MidJourney parameters (such as --ar 16:9, --v 6, --s 250, etc.). Return ONLY the prompt text, no explanations.',
        gpt: 'You are a professional DALL-E / GPT image prompt expert. Based on the user\'s image, generate a detailed image description prompt suitable for GPT usage. Include subject, environment, style, lighting, and color details. Return ONLY the prompt text, no explanations.',
        jimeng: 'You are a professional Jimeng prompt engineer. Based on the user\'s image, generate a detailed image prompt suitable for the Jimeng platform. Include subject, style, lighting, composition, and color descriptions. Return ONLY the prompt text, no explanations.',
        sd: 'You are a professional Stable Diffusion prompt engineer. Based on the user\'s image, generate a detailed Stable Diffusion prompt including subject, style, lighting, and composition. Use SD keywords (such as masterpiece, best quality, highly detailed) and recommend negative prompts. Return ONLY the prompt text, no explanations.',
        doubao: 'You are a professional Doubao image prompt engineer. Based on the user\'s image, generate a detailed image prompt suitable for the Doubao platform. Include subject, environment, style, lighting, and color details. Return ONLY the prompt text, no explanations.',
    },
};

function loadReversePrefs() {
    try {
        const saved = localStorage.getItem('ai-chat-reverse-prefs');
        if (saved) {
            const p = JSON.parse(saved);
            if (p.language) state.reversePrefs.language = p.language;
            if (p.platform) state.reversePrefs.platform = p.platform;
        }
    } catch (e) {}
}

function saveReversePrefs() {
    try {
        localStorage.setItem('ai-chat-reverse-prefs', JSON.stringify(state.reversePrefs));
    } catch (e) {}
}

/** 更新弹窗内按钮的选中状态 */
function updateReverseUI() {
    // 语言
    document.querySelectorAll('.reverse-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === state.reversePrefs.language);
    });
    // 平台
    document.querySelectorAll('.reverse-platform-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.platform === state.reversePrefs.platform);
    });
    // 提交按钮（有图片才能生成）
    dom.reverseSubmitBtn.disabled = state.currentImages.length === 0 || state.isReversing;
}

/** 打开反推提示词弹窗 */
function openPromptReverse() {
    loadReversePrefs();

    // 有图片则显示图片预览
    if (state.currentImages.length > 0) {
        const img = state.currentImages[0];
        dom.reverseImagePreview.src = img.dataUrl;
        dom.reverseImageArea.style.display = 'block';
    } else {
        dom.reverseImageArea.style.display = 'none';
        dom.reverseImagePreview.src = '';
    }

    // 有上次结果则恢复，否则显示占位符
    if (state.lastReverseResultHTML) {
        dom.reverseResult.innerHTML = state.lastReverseResultHTML;
        const hasItems = dom.reverseResult.querySelectorAll('.reverse-result-item').length > 0;
        dom.reverseCopyBtn.disabled = !hasItems;
        dom.reverseTranslateBtn.disabled = !hasItems;
    } else {
        state.reverseResultText = '';
        dom.reverseResult.innerHTML = '<span class="reverse-result-placeholder">点击下方按钮生成提示词...</span>';
        dom.reverseCopyBtn.disabled = true;
        dom.reverseTranslateBtn.disabled = true;
    }

    // 更新 UI 状态
    updateReverseUI();
    dom.promptReverseOverlay.classList.add('open');
}

function closePromptReverse() {
    dom.promptReverseOverlay.classList.remove('open');
    dom.reverseImageArea.style.display = 'none';
    dom.reverseImagePreview.src = '';
}

/** 选择语言 */
function selectReverseLanguage(lang) {
    state.reversePrefs.language = lang;
    saveReversePrefs();
    updateReverseUI();
}

/** 选择平台 */
function selectReversePlatform(platform) {
    state.reversePrefs.platform = platform;
    saveReversePrefs();
    updateReverseUI();
}

/** 复制结果 - 收集所有模型的结果 */
function copyReverseResult() {
    const items = dom.reverseResult.querySelectorAll('.reverse-result-item');
    if (items.length === 0) {
        if (state.reverseResultText) {
            copyText(state.reverseResultText);
        }
        return;
    }

    let text = '';
    items.forEach(item => {
        const header = item.querySelector('.reverse-result-item-header')?.textContent || '';
        const content = item.querySelector('.reverse-result-item-content')?.textContent || '';
        if (content && !content.startsWith('⏳') && !content.startsWith('⚠️')) {
            text += `【${header.trim()}】\n${content}\n\n`;
        }
    });
    if (text) copyText(text.trim());
}

/** 单个模型的反推请求（流式写入自己的结果块） */
async function streamReversePrompt(modelIndex, modelLabel, modelConfig, img, systemPrompt, platformLabel, language) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'reverse-result-item';
    itemDiv.dataset.modelIndex = modelIndex;
    itemDiv.innerHTML = `
        <div class="reverse-result-item-header" style="--panel-color: ${['#6366f1','#f59e0b','#10b981'][modelIndex]}">
            <span>${modelLabel}</span>
        </div>
        <div class="reverse-result-item-content loading">⏳ 生成中...</div>
    `;
    dom.reverseResult.appendChild(itemDiv);
    const contentEl = itemDiv.querySelector('.reverse-result-item-content');

    try {
        const response = await fetch(`${modelConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${modelConfig.apiKey}`,
            },
            body: JSON.stringify({
                model: modelConfig.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: `请分析这张图片，生成适配 ${platformLabel} 的${language === 'zh' ? '中文' : '英文'}提示词：` },
                            { type: 'image_url', image_url: { url: img.dataUrl } },
                        ],
                    },
                ],
                stream: true,
                temperature: 0.7,
                max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '未知错误');
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        contentEl.className = 'reverse-result-item-content';
        contentEl.textContent = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
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
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content || '';
                    if (delta) {
                        content += delta;
                        contentEl.textContent = content;
                    }
                } catch (e) {}
            }
        }

        return { modelIndex, text: content.trim(), success: true };

    } catch (err) {
        contentEl.className = 'reverse-result-item-content error';
        contentEl.textContent = `⚠️ 生成失败: ${err.message}`;
        return { modelIndex, text: '', success: false, error: err.message };
    }
}

/** 执行反推提示词 - 调用所有启用的模型 */
async function doPromptReverse() {
    if (state.isReversing || state.currentImages.length === 0) return;

    const platform = state.reversePrefs.platform;
    const language = state.reversePrefs.language;
    const img = state.currentImages[0];
    const systemPrompt = REVERSE_SYSTEM_PROMPTS[language]?.[platform] || REVERSE_SYSTEM_PROMPTS.zh.mj;
    const platformLabel = REVERSE_PLATFORMS[platform]?.label || platform;

    // 收集所有启用的且配置完整的模型
    const enabledConfigs = [];
    const modelLabels = ['🤖 模型 1', '🔮 模型 2', '✨ 模型 3'];
    for (let i = 0; i < 3; i++) {
        if (state.enabledModels[i]) {
            const cfg = getModelConfig(i);
            if (cfg.apiKey && cfg.modelName) {
                enabledConfigs.push({ index: i, label: modelLabels[i], config: cfg });
            }
        }
    }

    if (enabledConfigs.length === 0) {
        showToast('请先在设置中配置 API Key 和模型名称', 'error');
        dom.reverseResult.innerHTML = '<span class="reverse-error">⚠️ 未找到可用的模型配置，请先在设置中配置 API Key</span>';
        return;
    }

    state.isReversing = true;
    dom.reverseSubmitBtn.disabled = true;
    dom.reverseSubmitBtn.textContent = '⏳ 生成中...';
    dom.reverseResult.innerHTML = ''; // 清空占位符
    dom.reverseCopyBtn.disabled = true;

    // 并行调用所有启用的模型
    const promises = enabledConfigs.map(ec =>
        streamReversePrompt(ec.index, ec.label, ec.config, img, systemPrompt, platformLabel, language)
    );

    const results = await Promise.allSettled(promises);

    // 检查是否有成功的结果
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    if (successCount > 0) {
        dom.reverseCopyBtn.disabled = false;
        dom.reverseTranslateBtn.disabled = false;
        // 保存结果 HTML 以便无图片时复用
        state.lastReverseResultHTML = dom.reverseResult.innerHTML;
        showToast(`✨ ${successCount} 个模型提示词生成完成`, 'success');
    } else {
        showToast('所有模型均生成失败，请检查配置', 'error');
    }

    state.isReversing = false;
    dom.reverseSubmitBtn.textContent = '🚀 生成提示词';
    updateReverseUI();
}

/** 将反推结果全部翻译成中文（调用豆包翻译配置） */
async function translateReverseResults() {
    const items = dom.reverseResult.querySelectorAll('.reverse-result-item');
    if (items.length === 0 || state.isTranslatingReverse) return;

    const config = getTranslateConfig();
    if (!config.apiKey) {
        showToast('请先在设置中配置翻译 API Key', 'error');
        return;
    }

    state.isTranslatingReverse = true;
    dom.reverseTranslateBtn.disabled = true;
    dom.reverseTranslateBtn.textContent = '⏳ 翻译中...';

    const systemPrompt = '你是一个专业的翻译助手。请将用户输入的英文内容翻译成中文。只返回翻译结果，不要有任何额外说明。保留专业术语和格式标记（如 --ar, --v, --s, 负面提示词等）。';

    let successCount = 0;

    for (const item of items) {
        const contentEl = item.querySelector('.reverse-result-item-content');
        if (!contentEl) continue;
        const originalText = contentEl.textContent?.trim();
        if (!originalText || originalText.startsWith('⏳') || originalText.startsWith('⚠️') || originalText.startsWith('🇨🇳')) continue;

        contentEl.className = 'reverse-result-item-content loading';
        contentEl.textContent = '⏳ 翻译中...';

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
                        { role: 'user', content: originalText },
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

            contentEl.className = 'reverse-result-item-content';
            contentEl.textContent = '';

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let translation = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
                for (const line of lines) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            translation += delta;
                            contentEl.textContent = translation;
                        }
                    } catch (e) {}
                }
            }

            // 添加已翻译标识
            const header = item.querySelector('.reverse-result-item-header');
            if (header && !header.querySelector('.translated-badge')) {
                const badge = document.createElement('span');
                badge.className = 'translated-badge';
                badge.textContent = ' 🇨🇳 已翻译';
                badge.style.cssText = 'font-size:11px;color:var(--accent-green);margin-left:auto;';
                header.appendChild(badge);
            }
            successCount++;

        } catch (err) {
            contentEl.className = 'reverse-result-item-content error';
            contentEl.textContent = `⚠️ 翻译失败: ${err.message}`;
        }
    }

    state.isTranslatingReverse = false;
    dom.reverseTranslateBtn.textContent = '🇨🇳 转中文';

    if (successCount > 0) {
        showToast(`✅ ${successCount} 个结果已翻译成中文`, 'success');
    }
}

// ==================== 数据导出/导入 ====================

/** 收集所有数据，导出为 JSON 文件 */
function exportAllData() {
    try {
        // 收集所有 localStorage 数据
        const data = {
            version: 1,
            exportTime: new Date().toISOString(),
            sessions: JSON.parse(localStorage.getItem('ai-chat-sessions') || 'null'),
            settings: JSON.parse(localStorage.getItem('ai-chat-settings') || 'null'),
            bookmarks: JSON.parse(localStorage.getItem('ai-chat-bookmarks') || 'null'),
            notes: JSON.parse(localStorage.getItem('ai-chat-notes') || 'null'),
            theme: localStorage.getItem('ai-chat-theme') || null,
            reversePrefs: JSON.parse(localStorage.getItem('ai-chat-reverse-prefs') || 'null'),
        };

        const json = JSON.stringify(data, null, 2);

        // 下载文件
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const yearShort = String(now.getFullYear()).slice(-2);
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const dateKey = `${now.getFullYear()}-${month}-${day}`;

        // 获取今日导出次数
        let exportLog = { date: dateKey, count: 0 };
        try {
            const saved = localStorage.getItem('ai-chat-export-log');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.date === dateKey) {
                    exportLog = { date: dateKey, count: parsed.count + 1 };
                } else {
                    exportLog = { date: dateKey, count: 1 };
                }
            } else {
                exportLog = { date: dateKey, count: 1 };
            }
            localStorage.setItem('ai-chat-export-log', JSON.stringify(exportLog));
        } catch (e) { exportLog = { date: dateKey, count: 1 }; }

        a.download = `多模型对话-${yearShort}年-${month}月-${day}日-${exportLog.count}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('✅ 数据导出成功', 'success');
    } catch (e) {
        console.error('导出失败:', e);
        showToast('❌ 导出失败: ' + e.message, 'error');
    }
}

/** 从 JSON 文件导入数据 */
function importAllData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (!data.version) {
                showToast('❌ 无效的备份文件格式', 'error');
                return;
            }

            // 逐个恢复数据
            if (data.sessions !== undefined && data.sessions !== null) {
                localStorage.setItem('ai-chat-sessions', JSON.stringify(data.sessions));
            }
            if (data.settings !== undefined && data.settings !== null) {
                localStorage.setItem('ai-chat-settings', JSON.stringify(data.settings));
            }
            if (data.bookmarks !== undefined && data.bookmarks !== null) {
                localStorage.setItem('ai-chat-bookmarks', JSON.stringify(data.bookmarks));
            }
            if (data.notes !== undefined && data.notes !== null) {
                localStorage.setItem('ai-chat-notes', JSON.stringify(data.notes));
            }
            if (data.theme) {
                localStorage.setItem('ai-chat-theme', data.theme);
            }
            if (data.reversePrefs) {
                localStorage.setItem('ai-chat-reverse-prefs', JSON.stringify(data.reversePrefs));
            }

            showToast('✅ 数据导入成功！请刷新页面查看', 'success');

            // 2 秒后自动刷新页面
            setTimeout(() => {
                location.reload();
            }, 2000);

        } catch (err) {
            console.error('导入失败:', err);
            showToast('❌ 导入失败: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
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

    // Escape 退出全屏
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.body.classList.contains('fullscreen-mode')) {
            document.body.classList.remove('fullscreen-mode');
            dom.fullscreenBtn.classList.remove('active');
            dom.fullscreenBtn.title = '全屏模式';
        }
    });

    // 数据导出/导入
    dom.exportDataBtn.addEventListener('click', exportAllData);
    dom.importDataBtn.addEventListener('click', () => dom.importFileInput.click());
    dom.importFileInput.addEventListener('change', () => {
        if (dom.importFileInput.files.length > 0) {
            importAllData(dom.importFileInput.files[0]);
            dom.importFileInput.value = '';
        }
    });

    // 翻译源选择
    document.querySelectorAll('.translate-source-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.translate-source-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

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
    // Ctrl+V 粘贴图片
    dom.chatInput.addEventListener('paste', handlePasteImage);

    // 图片上传
    dom.uploadBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleImageUpload);

    // 清空聊天
    dom.clearMsgBtn.addEventListener('click', clearAllMessages);

    // 魔法棒 - 图片反推提示词
    dom.magicBtn.addEventListener('click', openPromptReverse);

    // ===== 模型选择切换 =====
    document.querySelectorAll('.model-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleModel(parseInt(btn.dataset.model));
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

    // 全屏模式切换
    dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

    // 全局搜索
    dom.searchBtn.addEventListener('click', openGlobalSearch);
    dom.globalSearchInput.addEventListener('input', () => doGlobalSearch(dom.globalSearchInput.value.trim()));
    dom.globalSearchClear.addEventListener('click', clearGlobalSearch);
    dom.globalSearchClose.addEventListener('click', closeGlobalSearch);
    dom.searchOverlay.addEventListener('mousedown', (e) => { if (e.target === dom.searchOverlay) closeGlobalSearch(); });

    // Ctrl+K / Cmd+K 快捷键
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (dom.searchOverlay.style.display !== 'none') {
                closeGlobalSearch();
            } else {
                openGlobalSearch();
            }
        }
        // Esc 关闭搜索或收藏
        if (e.key === 'Escape') {
            if (dom.searchOverlay.style.display !== 'none') {
                closeGlobalSearch();
            } else if (dom.bookmarksOverlay.style.display !== 'none') {
                closeMsgBookmarks();
            } else if (dom.compareOverlay.style.display !== 'none') {
                closeCompare();
            }
        }
    });

    // 消息收藏
    dom.bookmarksBtn.addEventListener('click', openMsgBookmarks);
    dom.bookmarksClose.addEventListener('click', closeMsgBookmarks);
    dom.bookmarksOverlay.addEventListener('mousedown', (e) => { if (e.target === dom.bookmarksOverlay) closeMsgBookmarks(); });

    // 对比模式
    dom.compareBtn.addEventListener('click', openCompare);
    dom.compareClose.addEventListener('click', closeCompare);
    dom.compareOverlay.addEventListener('mousedown', (e) => {
        if (e.target === dom.compareOverlay) closeCompare();
    });
    dom.comparePrev.addEventListener('click', () => {
        if (_compareCurrentIdx > 0) { _compareCurrentIdx--; renderCompareRound(); }
    });
    dom.compareNext.addEventListener('click', () => {
        if (_compareCurrentIdx < _compareRounds.length - 1) { _compareCurrentIdx++; renderCompareRound(); }
    });
    dom.compareDiffToggle.addEventListener('change', renderCompareRound);

    // ===== 反推提示词弹窗 =====
    dom.closeReverseBtn.addEventListener('click', closePromptReverse);
    dom.promptReverseOverlay.addEventListener('click', e => {
        if (e.target === dom.promptReverseOverlay) closePromptReverse();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && dom.promptReverseOverlay.classList.contains('open')) {
            if (state.isReversing) return; // 生成中不能关闭
            closePromptReverse();
        }
    });

    // 语言选择
    document.querySelectorAll('.reverse-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectReverseLanguage(btn.dataset.lang);
        });
    });

    // 平台选择
    document.querySelectorAll('.reverse-platform-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectReversePlatform(btn.dataset.platform);
        });
    });

    // 生成、翻译、复制
    dom.reverseSubmitBtn.addEventListener('click', doPromptReverse);
    dom.reverseTranslateBtn.addEventListener('click', translateReverseResults);
    dom.reverseCopyBtn.addEventListener('click', copyReverseResult);
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
    loadMessageBookmarks();
    loadSessionToDOM(currentSessionId);
    updateModelToggleButtons();
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
