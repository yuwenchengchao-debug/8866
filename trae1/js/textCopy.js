/**
 * 文字选择复制功能模块
 * 选择文字后右键默认复制
 */

(function() {
    'use strict';

    // 初始化
    function init() {
        document.addEventListener('contextmenu', handleContextMenu);
    }

    // 右键菜单处理
    async function handleContextMenu(e) {
        // 获取选中的文字
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        // 如果没有选中文字，不处理（让浏览器默认菜单显示）
        if (!selectedText) {
            return;
        }

        // 检查是否在输入框中
        const target = e.target;
        const isInputElement = target.tagName === 'INPUT' ||
                               target.tagName === 'TEXTAREA' ||
                               target.isContentEditable;

        // 在输入框中时不拦截，让浏览器默认菜单显示
        if (isInputElement) {
            return;
        }

        // 阻止默认右键菜单
        e.preventDefault();

        // 复制选中的文字
        try {
            await navigator.clipboard.writeText(selectedText);
            showToast('✅ 已复制: ' + selectedText.substring(0, 30) + (selectedText.length > 30 ? '...' : ''));
        } catch (err) {
            console.error('复制失败:', err);
            // 使用备用方案
            const textarea = document.createElement('textarea');
            textarea.value = selectedText;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                showToast('✅ 已复制: ' + selectedText.substring(0, 30) + (selectedText.length > 30 ? '...' : ''));
            } catch (e) {
                showToast('❌ 复制失败', 'error');
            }
            document.body.removeChild(textarea);
        }
    }

    // 显示提示
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#ea4335' : '#34a853'};
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 13px;
            z-index: 10003;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 80%;
            word-break: break-all;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 1500);
    }

    // 初始化
    init();
})();
