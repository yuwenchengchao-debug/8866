/**
 * 截图功能模块
 * 快捷键: Alt + S
 * 使用 html2canvas 截取页面区域，复制到剪贴板
 */

(function() {
    'use strict';

    let isSelecting = false;
    let startX = 0;
    let startY = 0;
    let selectionBox = null;
    let overlay = null;
    let toolbar = null;

    // 初始化
    function init() {
        document.addEventListener('keydown', handleKeyDown);
    }

    // 快捷键监听
    function handleKeyDown(e) {
        if (e.altKey && e.key === 's') {
            e.preventDefault();
            e.stopPropagation();
            if (!isSelecting) {
                startScreenshot();
            }
        }
        // ESC 取消截图
        if (e.key === 'Escape' && isSelecting) {
            cancelScreenshot();
        }
    }

    // 开始截图
    function startScreenshot() {
        isSelecting = true;
        createOverlay();
        createSelectionBox();
        bindMouseEvents();
    }

    // 创建遮罩层
    function createOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'screenshot-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            cursor: crosshair;
        `;
        document.body.appendChild(overlay);
    }

    // 创建选区框
    function createSelectionBox() {
        selectionBox = document.createElement('div');
        selectionBox.id = 'screenshot-selection';
        selectionBox.style.cssText = `
            position: fixed;
            border: 2px solid #4285f4;
            background: rgba(66, 133, 244, 0.1);
            z-index: 10000;
            display: none;
            pointer-events: none;
        `;
        document.body.appendChild(selectionBox);
    }

    // 绑定鼠标事件
    function bindMouseEvents() {
        overlay.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    // 鼠标按下
    function onMouseDown(e) {
        startX = e.clientX;
        startY = e.clientY;
        selectionBox.style.display = 'block';
        selectionBox.style.left = startX + 'px';
        selectionBox.style.top = startY + 'px';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
    }

    // 鼠标移动
    function onMouseMove(e) {
        if (!isSelecting || !selectionBox.style.display) return;

        const currentX = e.clientX;
        const currentY = e.clientY;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';

        // 显示尺寸提示
        updateSizeTooltip(width, height, left, top);
    }

    // 更新尺寸提示
    function updateSizeTooltip(width, height, left, top) {
        let tooltip = document.getElementById('screenshot-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'screenshot-tooltip';
            tooltip.style.cssText = `
                position: fixed;
                background: #333;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 10001;
                pointer-events: none;
            `;
            document.body.appendChild(tooltip);
        }
        tooltip.textContent = `${Math.round(width)} × ${Math.round(height)}`;
        tooltip.style.left = (left + 5) + 'px';
        tooltip.style.top = (top - 25) + 'px';
        tooltip.style.display = width > 50 && height > 30 ? 'block' : 'none';
    }

    // 鼠标松开 - 直接截图复制，不显示工具栏
    async function onMouseUp(e) {
        if (!isSelecting) return;

        const endX = e.clientX;
        const endY = e.clientY;
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        // 选区太小则取消
        if (width < 10 || height < 10) {
            cancelScreenshot();
            return;
        }

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);

        // 移除事件监听
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // 直接截图并复制到剪贴板
        await captureAndCopy({ left, top, width, height });
    }

    // 捕获截图区域
    async function captureArea(rect) {
        // 临时隐藏截图相关元素
        const elementsToHide = [overlay, selectionBox, toolbar];
        const tooltip = document.getElementById('screenshot-tooltip');
        if (tooltip) tooltip.style.display = 'none';

        elementsToHide.forEach(el => {
            if (el) el.style.display = 'none';
        });

        // 等待渲染
        await new Promise(resolve => requestAnimationFrame(resolve));

        try {
            // 使用 html2canvas 截图
            const canvas = await html2canvas(document.body, {
                x: rect.left + window.scrollX,
                y: rect.top + window.scrollY,
                width: rect.width,
                height: rect.height,
                scale: window.devicePixelRatio || 1,
                useCORS: true,
                allowTaint: true,
                backgroundColor: null
            });

            return canvas;
        } finally {
            // 恢复显示
            elementsToHide.forEach(el => {
                if (el) el.style.display = '';
            });
        }
    }

    // 截图并复制到剪贴板
    async function captureAndCopy(rect) {
        try {
            const canvas = await captureArea(rect);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);

            showToast('✅ 截图已复制到剪贴板，可直接粘贴');
        } catch (err) {
            console.error('复制失败:', err);
            showToast('❌ 复制失败', 'error');
        } finally {
            cleanup();
        }
    }

    // 取消截图
    function cancelScreenshot() {
        cleanup();
    }

    // 清理
    function cleanup() {
        isSelecting = false;

        if (overlay) {
            overlay.remove();
            overlay = null;
        }
        if (selectionBox) {
            selectionBox.remove();
            selectionBox = null;
        }
        if (toolbar) {
            toolbar.remove();
            toolbar = null;
        }
        const tooltip = document.getElementById('screenshot-tooltip');
        if (tooltip) tooltip.remove();

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
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
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10003;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    // 初始化
    init();
})();
