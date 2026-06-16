class AIWebsiteManager {
    constructor() {
        this.websites = this.loadConfig();
        this.selectedIds = new Set();
        this.launcherAvailable = false;
        this.init();
    }

    loadConfig() {
        const saved = localStorage.getItem('ai-websites');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return this.getDefaultConfig();
            }
        }
        return this.getDefaultConfig();
    }

   getDefaultConfig() {
    return [
        { id: 'doubao-1', name: '豆包 #1', icon: '豆包.png', url: 'https://www.doubao.com/chat/1', enabled: true },
        { id: 'doubao-2', name: '豆包 #2', icon: '豆包.png', url: 'https://www.doubao.com/chat/2', enabled: true },
        { id: 'doubao-3', name: '豆包 #3', icon: '豆包.png', url: 'https://www.doubao.com/chat/3', enabled: true },
        { id: 'doubao-4', name: '豆包 #4', icon: '豆包.png', url: 'https://www.doubao.com/chat/4', enabled: true },
        { id: 'qianwen-1', name: '千问 #1', icon: '千问.png', url: 'https://create.qianwen.com/', enabled: true },
        { id: 'qianwen-2', name: '千问 #2', icon: '千问.png', url: 'https://create.qianwen.com/', enabled: true },
        { id: 'dola-1', name: 'dola #1', icon: 'dola.png', url: 'https://www.dola.com/chat/', enabled: true },
        { id: 'dola-2', name: 'dola #2', icon: 'dola.png', url: 'https://www.dola.com/chat/', enabled: true },
        { id: 'dola-3', name: 'dola #3', icon: 'dola.png', url: 'https://www.dola.com/chat/', enabled: true },
        { id: 'oiioii-1', name: 'oiioii #1', icon: 'oiioii.png', url: 'https://www.oiioii.ai/home', enabled: true },
        { id: 'oiioii-2', name: 'oiioii #2', icon: 'oiioii.png', url: 'https://www.oiioii.ai/home', enabled: true },
        { id: 'xyq-1', name: '小云雀 #1', icon: '小云雀.png', url: 'https://xyq.jianying.com', enabled: true },
        { id: 'xyq-2', name: '小云雀 #2', icon: '小云雀.png', url: 'https://xyq.jianying.com', enabled: true },
        { id: 'jimeng-1', name: '即梦', icon: '即梦.png', url: 'https://jimeng.jianying.com/', enabled: true },
    ];
}

    saveConfig() {
        localStorage.setItem('ai-websites', JSON.stringify(this.websites));
    }

    init() {
        this.checkLauncher();
        this.renderWebsites();
        this.bindEvents();
        // Auto check launcher every 10 seconds
        setInterval(() => this.checkLauncher(), 10000);
    }

    async checkLauncher() {
        try {
            const res = await fetch("http://127.0.0.1:17888/ping", {
                method: "GET"
            });
            const data = await res.json();
            if (data.ok) {
                this.launcherAvailable = true;
                console.log("Launcher available", data.version);
                this.updateLauncherStatus(true);
            } else {
                this.launcherAvailable = false;
                this.updateLauncherStatus(false);
            }
        } catch (e) {
            this.launcherAvailable = false;
            console.log("Launcher not available");
            this.updateLauncherStatus(false);
        }
    }

    updateLauncherStatus(available) {
        const statusElement = document.getElementById('launcherStatus');
        if (statusElement) {
            statusElement.textContent = available ? '✅ Launcher connected' : '❌ Launcher not installed';
            statusElement.className = available ? 'launcher-status available' : 'launcher-status unavailable';
        }

        const openBtn = document.getElementById('aiWebOpenSelectedBtn');
        if (openBtn) {
            if (!available) {
                openBtn.disabled = true;
                openBtn.title = 'Please install launcher first';
            } else {
                openBtn.disabled = false;
                openBtn.title = '';
            }
        }
    }

    renderWebsites() {
        const grid = document.getElementById('aiWebGrid');
        if (!grid) return;

        const enabledWebsites = this.websites.filter(w => w.enabled);
        grid.innerHTML = '';

        enabledWebsites.forEach((site) => {
            const card = document.createElement('div');
            card.className = `ai-web-card${this.selectedIds.has(site.id) ? ' selected' : ''}`;
            card.dataset.id = site.id;
            
            const isEmoji = !site.icon.startsWith('http') && !site.icon.includes('.') && site.icon.length <= 4;
            const iconHtml = isEmoji 
                ? `<div class="ai-web-card-icon">${site.icon}</div>`
                : `<div class="ai-web-card-icon"><img src="${site.icon}" alt="${site.name}" /></div>`;
            
            card.innerHTML = `
                ${iconHtml}
                <div class="ai-web-card-name">${site.name}</div>
                <div class="ai-web-card-check">✓</div>
            `;
            grid.appendChild(card);
        });
    }

    bindEvents() {
        const self = this;
        
        document.addEventListener('click', function(e) {
            const target = e.target;
            
            const featureCard = target.closest('.feature-card');
            if (featureCard) {
                self.handleFeatureCardClick(featureCard);
                return;
            }

            const aiWebCard = target.closest('.ai-web-card');
            if (aiWebCard) {
                self.handleAiWebCardClick(aiWebCard);
                return;
            }

            const manageBtn = target.closest('#aiWebManageBtn');
            if (manageBtn) {
                self.openManagePanel();
                return;
            }

            const addBtn = target.closest('#aiWebAddBtn');
            if (addBtn) {
                self.openAddPanel();
                return;
            }

            const openSelectedBtn = target.closest('#aiWebOpenSelectedBtn');
            if (openSelectedBtn) {
                self.openSelectedWebsites();
                return;
            }

            const reconnectBtn = target.closest('#aiWebReconnectBtn');
            if (reconnectBtn) {
                self.checkLauncher();
                return;
            }

            const launcherGuideBtn = target.closest('#launcherGuideBtn');
            if (launcherGuideBtn) {
                document.getElementById('launcherGuideOverlay').style.display = 'flex';
                return;
            }

            const watermarkBtn = target.closest('#watermarkToolBtn');
            if (watermarkBtn) {
                const overlay = document.getElementById('watermarkDisclaimerOverlay');
                overlay.style.display = 'flex';
                overlay.onclick = function(e) {
                    if (e.target === overlay) {
                        overlay.style.display = 'none';
                    }
                };
                return;
            }

            const closeBtn = target.closest('.close-btn');
            if (closeBtn) {
                const overlay = closeBtn.closest('[id$="Overlay"]');
                if (overlay) {
                    overlay.style.display = 'none';
                }
                return;
            }

            const cancelBtn = target.closest('#aiWebAddCancel');
            if (cancelBtn) {
                document.getElementById('aiWebAddOverlay').style.display = 'none';
                return;
            }

            const confirmBtn = target.closest('#aiWebAddConfirm');
            if (confirmBtn) {
                self.addWebsite();
                return;
            }

            const saveBtn = target.closest('#aiWebManageSaveBtn');
            if (saveBtn) {
                self.saveFromManagePanel();
                return;
            }

            const addFromManageBtn = target.closest('#aiWebAddFromManageBtn');
            if (addFromManageBtn) {
                document.getElementById('aiWebManageOverlay').style.display = 'none';
                self.openAddPanel();
                return;
            }

            const iconPreset = target.closest('.icon-preset');
            if (iconPreset) {
                document.getElementById('aiWebAddIcon').value = iconPreset.dataset.icon;
                return;
            }

            const openWatermarkBtn = target.closest('#openWatermarkToolBtn');
            if (openWatermarkBtn) {
                window.open('https://doubao.com/watermark', '_blank');
                document.getElementById('watermarkToolOverlay').style.display = 'none';
                return;
            }
        });
    }

    handleFeatureCardClick(card) {
        const action = card.dataset.action;
        switch (action) {
            case 'chat':
                this.hideHomeAndShowChat();
                break;
            case 'bookmarks':
                this.showBookmarks();
                break;
            case 'script-review':
                window.open('./script-review.html', '_blank');
                break;
            case 'material':
                window.open('http://175.178.60.63:3847/', '_blank');
                break;
            case 'manual':
                window.open('./manual.html', '_blank');
                break;
        }
    }

    hideHomeAndShowChat() {
        document.querySelector('.page-home').style.display = 'none';
        document.querySelector('.page-chat').style.display = 'flex';
        document.querySelector('.page-chat').classList.add('active');
        
        const header = document.querySelector('.header');
        header.innerHTML = `
            <div class="header-left">
                <button class="back-to-home-btn" id="backToHomeBtn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m12 19-7-7 7-7"/>
                        <path d="M19 12H5"/>
                    </svg>
                    Back to Home
                </button>
                <div class="header-brand">
                    <h1 class="site-title">AI Chat</h1>
                </div>
            </div>
            <button class="settings-btn" id="settingsBtn" title="Settings">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Settings
            </button>
        `;
        
        document.getElementById('backToHomeBtn').addEventListener('click', () => {
            this.showHome();
        });
        
        setTimeout(() => {
            document.querySelectorAll('.panel-messages').forEach(panel => {
                panel.scrollTop = panel.scrollHeight;
            });
        }, 100);
    }

    showHome() {
        document.querySelector('.page-chat').style.display = 'none';
        document.querySelector('.page-chat').classList.remove('active');
        document.querySelector('.page-home').style.display = 'flex';
        
        const header = document.querySelector('.header');
        header.innerHTML = `
            <div class="header-left">
                <div class="header-logo">
                    <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
                        <defs>
                            <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                                <stop offset="0%" stop-color="#6366f1"/>
                                <stop offset="100%" stop-color="#8b5cf6"/>
                            </linearGradient>
                        </defs>
                        <circle cx="16" cy="16" r="10" stroke="url(#logoGrad)" stroke-width="0.5" opacity="0.2"/>
                        <circle cx="16" cy="16" r="3.5" fill="url(#logoGrad)" opacity="0.9">
                            <animate attributeName="r" values="3.5;4;3.5" dur="2s" repeatCount="indefinite"/>
                            <animate attributeName="opacity" values="0.9;1;0.9" dur="2s" repeatCount="indefinite"/>
                        </circle>
                        <g>
                            <animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="3s" repeatCount="indefinite"/>
                            <circle cx="16" cy="6" r="2.2" fill="url(#logoGrad)" opacity="0.85"/>
                        </g>
                        <g>
                            <animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="3s" begin="1s" repeatCount="indefinite"/>
                            <circle cx="16" cy="6" r="2.2" fill="url(#logoGrad)" opacity="0.85"/>
                        </g>
                        <g>
                            <animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="3s" begin="2s" repeatCount="indefinite"/>
                            <circle cx="16" cy="6" r="2.2" fill="url(#logoGrad)" opacity="0.85"/>
                        </g>
                    </svg>
                </div>
                <div class="header-brand">
                    <h1 class="site-title">AIGC Assistant</h1>
                    <span class="site-subtitle">Your intelligent creation toolbox</span>
                </div>
            </div>
            <button class="settings-btn" id="settingsBtn" title="Settings">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Settings
            </button>
        `;
        
        document.getElementById('settingsBtn').addEventListener('click', () => {
            document.getElementById('settingsOverlay').style.display = 'flex';
        });
    }

    showBookmarks() {
        document.querySelector('.page-home').style.display = 'none';
        document.querySelector('.page-bookmarks').style.display = 'flex';
        document.querySelector('.page-bookmarks').classList.add('active');
        
        const header = document.querySelector('.header');
        header.innerHTML = `
            <div class="header-left">
                <button class="back-to-home-btn" id="backToHomeBtn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m12 19-7-7 7-7"/>
                        <path d="M19 12H5"/>
                    </svg>
                    Back to Home
                </button>
                <div class="header-brand">
                    <h1 class="site-title">Bookmarks</h1>
                </div>
            </div>
            <button class="settings-btn" id="settingsBtn" title="Settings">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Settings
            </button>
        `;
        
        document.getElementById('backToHomeBtn').addEventListener('click', () => {
            this.showHome();
        });
    }

    showMaterial() {
        document.querySelector('.page-home').style.display = 'none';
        document.querySelector('.page-material').style.display = 'flex';
        document.querySelector('.page-material').classList.add('active');
        
        const header = document.querySelector('.header');
        header.innerHTML = `
            <div class="header-left">
                <button class="back-to-home-btn" id="backToHomeBtn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m12 19-7-7 7-7"/>
                        <path d="M19 12H5"/>
                    </svg>
                    Back to Home
                </button>
                <div class="header-brand">
                    <h1 class="site-title">Card Management</h1>
                </div>
            </div>
            <button class="settings-btn" id="settingsBtn" title="Settings">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Settings
            </button>
        `;
        
        document.getElementById('backToHomeBtn').addEventListener('click', () => {
            this.showHome();
        });
    }

    switchToSection(sectionClass) {
        console.log('switchToSection:', sectionClass);
        const sections = document.querySelectorAll('.page-section');
        console.log('Found sections:', sections.length);
        sections.forEach(section => {
            section.classList.remove('active');
            console.log('Removed active from:', section.className);
        });
        const targetSection = document.querySelector(`.${sectionClass}`);
        if (targetSection) {
            targetSection.classList.add('active');
            console.log('Added active to:', targetSection.className);
        } else {
            console.log(`Section ${sectionClass} not found`);
        }
    }

    handleAiWebCardClick(card) {
        const id = card.dataset.id;
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
            card.classList.remove('selected');
        } else {
            this.selectedIds.add(id);
            card.classList.add('selected');
        }
    }

    calcGridLayout(count, index) {
        const screenW = screen.availWidth;
        const screenH = screen.availHeight;
        const taskbarH = 40;

        let cols, rows;
        if (count === 1) {
            cols = 1; rows = 1;
        } else if (count === 2) {
            cols = 2; rows = 1;
        } else if (count <= 3) {
            cols = count; rows = 1;
        } else if (count <= 4) {
            cols = 2; rows = 2;
        } else if (count <= 6) {
            cols = 3; rows = 2;
        } else if (count <= 8) {
            cols = 4; rows = 2;
        } else {
            cols = Math.ceil(Math.sqrt(count));
            rows = Math.ceil(count / cols);
        }

        const winW = Math.floor(screenW / cols);
        const winH = Math.floor((screenH - taskbarH) / rows);
        const col = index % cols;
        const row = Math.floor(index / cols);

        return { left: col * winW, top: row * winH, width: winW, height: winH };
    }

    async openSelectedWebsites() {
        if (this.selectedIds.size === 0) {
            this.showToast('Please select websites to open');
            return;
        }

        if (!this.launcherAvailable) {
            // 启动器未安装，弹出引导
            const overlay = document.getElementById('launcherGuideOverlay');
            if (overlay) {
                overlay.style.display = 'flex';
            } else {
                this.showToast('Please install launcher first');
            }
            return;
        }

        const selectedArray = Array.from(this.selectedIds);
        const profiles = selectedArray.map(id => {
            const site = this.websites.find(w => w.id === id);
            return site ? { profileId: site.id, url: site.url } : null;
        }).filter(Boolean);

        try {
            const res = await fetch("http://127.0.0.1:17888/open", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ profiles })
            });

            const data = await res.json();
            if (data.ok) {
                this.showToast(`Opened ${data.count} windows`);
            } else {
                this.showToast('Failed: ' + data.message);
            }
        } catch (err) {
            this.showToast('Failed to connect to launcher');
            this.launcherAvailable = false;
            this.updateLauncherStatus(false);
        }
    }

    openManagePanel() {
        const panel = document.getElementById('aiWebManageOverlay');
        const list = document.getElementById('aiWebManageList');
        const self = this;
        
        list.innerHTML = '';
        this.websites.forEach((site) => {
            const item = document.createElement('div');
            item.className = 'ai-web-manage-item';
            const isEmoji = site.icon.length <= 2 || !site.icon.startsWith('http');
            const iconHtml = isEmoji 
                ? `<div class="ai-web-manage-icon">${site.icon}</div>`
                : `<div class="ai-web-manage-icon"><img src="${site.icon}" alt="${site.name}" /></div>`;
            item.innerHTML = `
                ${iconHtml}
                <div class="ai-web-manage-info">
                    <div class="ai-web-manage-name">${site.name}</div>
                    <div class="ai-web-manage-url">${site.url}</div>
                </div>
                <div class="ai-web-manage-check ${site.enabled ? 'checked' : ''}" data-id="${site.id}"></div>
                <button class="ai-web-manage-delete" data-id="${site.id}">✕</button>
            `;
            list.appendChild(item);
        });

        panel.style.display = 'flex';

        list.addEventListener('click', function(e) {
            const check = e.target.closest('.ai-web-manage-check');
            if (check) {
                const id = check.dataset.id;
                const site = self.websites.find(w => w.id === id);
                if (site) {
                    site.enabled = !site.enabled;
                    check.classList.toggle('checked');
                }
                return;
            }

            const deleteBtn = e.target.closest('.ai-web-manage-delete');
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                self.websites = self.websites.filter(w => w.id !== id);
                self.renderWebsites();
                self.saveConfig();
                self.openManagePanel();
                return;
            }
        });
    }

    saveFromManagePanel() {
        this.saveConfig();
        this.renderWebsites();
        document.getElementById('aiWebManageOverlay').style.display = 'none';
        this.showToast('Config saved');
    }

    openAddPanel() {
        document.getElementById('aiWebAddIcon').value = '';
        document.getElementById('aiWebAddName').value = '';
        document.getElementById('aiWebAddUrl').value = '';
        document.getElementById('aiWebAddOverlay').style.display = 'flex';
    }

    addWebsite() {
        const icon = document.getElementById('aiWebAddIcon').value || '';
        const name = document.getElementById('aiWebAddName').value.trim();
        const url = document.getElementById('aiWebAddUrl').value.trim();

        if (!name || !url) {
            this.showToast('Please fill all fields');
            return;
        }

        this.websites.push({
            id: `custom-${Date.now()}`,
            name,
            icon: icon || '🤖',
            url,
            enabled: true
        });

        this.saveConfig();
        this.renderWebsites();
        document.getElementById('aiWebAddOverlay').style.display = 'none';
        this.showToast('Website added');
    }

    openWatermarkTool() {
        document.getElementById('watermarkToolOverlay').style.display = 'flex';
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

if (!window._aiWebsiteManagerInitialized) {
    window._aiWebsiteManagerInitialized = true;
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Home.js loaded');
        new AIWebsiteManager();
        initCalendarWidget();
        initLauncherGuide();
        
        setTimeout(function() {
            console.log('Checking active section:', document.querySelector('.page-section.active')?.className);
        }, 500);
    });
}

// 启动器下载引导
function initLauncherGuide() {
    const overlay = document.getElementById('launcherGuideOverlay');
    const skipBtn = document.getElementById('launcherGuideSkip');
    
    if (!overlay || !skipBtn) return;
    
    // 跳过按钮 - 点击后当天不再提示
    skipBtn.addEventListener('click', function() {
        overlay.style.display = 'none';
        // 保存到今天的日期，过期后可以再次提示
        localStorage.setItem('launcher-guide-skip-date', new Date().toDateString());
    });
    
    // 点击遮罩关闭
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.style.display = 'none';
            localStorage.setItem('launcher-guide-skip-date', new Date().toDateString());
        }
    });
}

// 日历挂件功能
function initCalendarWidget() {
    const today = new Date();
    updateCalendar(today);
}

function updateCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    document.querySelector('.calendar-day-large').textContent = day;
    document.querySelector('.calendar-month-large').textContent = `${year}年${month}月${day}日`;
    
    const lunarInfo = solarToLunar(year, month, day);
    document.querySelector('.calendar-lunar-large').textContent = lunarInfo.year + ' ' + lunarInfo.date;
    
    const todayFestival = getFestival(year, month, day);
    document.getElementById('todayFestival').textContent = todayFestival || '无';
    
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowYear = tomorrow.getFullYear();
    const tomorrowMonth = tomorrow.getMonth() + 1;
    const tomorrowDay = tomorrow.getDate();
    const tomorrowFestival = getFestival(tomorrowYear, tomorrowMonth, tomorrowDay);
    document.getElementById('tomorrowFestival').textContent = tomorrowFestival || '无';
    
    const nextFestival = getNextFestival(year, month, day);
    document.getElementById('nextFestival').textContent = nextFestival;
}

function solarToLunar(year, month, day) {
    const date = new Date(year, month - 1, day);
    
    const lunarFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    const lunarStr = lunarFormatter.format(date);
    
    const yearMatch = lunarStr.match(/([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]年)/);
    const monthMatch = lunarStr.match(/(正|二|三|四|五|六|七|八|九|十|冬|腊)月/);
    const dayMatch = lunarStr.match(/(初[一-十]|十[一-九]|二十[一-九]|三十)/);
    
    if (yearMatch && monthMatch && dayMatch) {
        return {
            year: yearMatch[1],
            date: monthMatch[1] + dayMatch[1]
        };
    }
    
    const altMatch = lunarStr.match(/(\S+年)\s*(\S+月)\s*(\S+)/);
    if (altMatch) {
        return {
            year: altMatch[1],
            date: altMatch[2] + altMatch[3]
        };
    }
    
    return { year: '丙午年', date: '五月初一' };
}

function getFestival(year, month, day) {
    const festivals = {
        '1-1': '元旦',
        '2-14': '情人节',
        '3-8': '妇女节',
        '3-12': '植树节',
        '4-1': '愚人节',
        '5-1': '劳动节',
        '5-4': '青年节',
        '6-1': '儿童节',
        '7-1': '建党节',
        '8-1': '建军节',
        '9-10': '教师节',
        '10-1': '国庆节',
        '10-14': '重阳节',
        '12-25': '圣诞节',
        '5-SecondSunday': '母亲节',
        '6-ThirdSunday': '父亲节'
    };
    
    const key = `${month}-${day}`;
    if (festivals[key]) return festivals[key];
    
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    const weekOfMonth = Math.ceil(day / 7);
    
    if (month === 5 && dayOfWeek === 0 && weekOfMonth === 2) return '母亲节';
    if (month === 6 && dayOfWeek === 0 && weekOfMonth === 3) return '父亲节';
    
    return '';
}

function getNextFestival(currentYear, currentMonth, currentDay) {
    const festivals = [
        { month: 1, day: 1, name: '元旦' },
        { month: 2, day: 14, name: '情人节' },
        { month: 3, day: 8, name: '妇女节' },
        { month: 3, day: 12, name: '植树节' },
        { month: 4, day: 1, name: '愚人节' },
        { month: 5, day: 1, name: '劳动节' },
        { month: 5, day: 4, name: '青年节' },
        { month: 6, day: 19, name: '端午节' },
        { month: 6, day: 1, name: '儿童节' },
        { month: 7, day: 1, name: '建党节' },
        { month: 8, day: 1, name: '建军节' },
        { month: 9, day: 10, name: '教师节' },
        { month: 10, day: 1, name: '国庆节' },
        { month: 10, day: 14, name: '重阳节' },
        { month: 12, day: 25, name: '圣诞节' }
    ];
    
    const today = new Date(currentYear, currentMonth - 1, currentDay);
    let minDays = Infinity;
    let nextFest = null;
    let nextYear = currentYear;
    
    festivals.forEach(fest => {
        let festDate = new Date(currentYear, fest.month - 1, fest.day);
        let daysDiff = Math.ceil((festDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysDiff < 0) {
            festDate = new Date(currentYear + 1, fest.month - 1, fest.day);
            daysDiff = Math.ceil((festDate - today) / (1000 * 60 * 60 * 24));
            if (daysDiff < minDays) {
                minDays = daysDiff;
                nextFest = fest;
                nextYear = currentYear + 1;
            }
        } else if (daysDiff < minDays) {
            minDays = daysDiff;
            nextFest = fest;
            nextYear = currentYear;
        }
    });
    
    if (nextFest) {
        return `${nextFest.name} ${nextYear}年${nextFest.month}月${nextFest.day}日（${minDays}天后）`;
    }
    
    return '暂无';
}
