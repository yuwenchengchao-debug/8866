/**
 * webSearch.js - 前端联网搜索模块
 *
 * 搜索源优先级：
 * 1. 同域 API 代理 /api/search（本地 server.js 或 Vercel Serverless）
 * 2. 用户自建 SearXNG 实例（需在设置中配置）
 */

const WebSearch = (() => {

    // ========== 同域 API 代理 ==========
    async function searchViaLocalAPI(query, maxResults = 5) {
        try {
            const url = `/api/search?q=${encodeURIComponent(query)}&max=${maxResults}`;
            const res = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(20000),
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                return { results: data.results, source: data.source || '搜索' };
            }
            return null;
        } catch (e) {
            console.warn('[WebSearch] API 代理请求失败:', e.message);
            return null;
        }
    }

    // ========== 用户自建 SearXNG 实例 ==========
    async function searchViaCustomSearXNG(query, instanceUrl, maxResults = 5) {
        try {
            const baseUrl = instanceUrl.replace(/\/+$/, '');
            const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;
            const res = await fetch(searchUrl, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const results = (data.results || []).slice(0, maxResults).map(r => ({
                title: r.title || '', url: r.url || '', snippet: r.content || '',
            }));
            if (results.length > 0) return { results, source: '自定义SearXNG' };
            return null;
        } catch (e) {
            console.warn('[WebSearch] 自定义实例请求失败:', e.message);
            return null;
        }
    }

    /**
     * 主搜索函数
     * @param {string} query - 搜索关键词
     * @param {object} options - { customInstance, maxResults }
     * @returns {Promise<{results: Array, source: string}>}
     */
    async function search(query, options = {}) {
        const { customInstance, maxResults = 5 } = options;

        // 1. 同域 API 代理（本地 server.js 或 Vercel）— 最可靠
        const apiResult = await searchViaLocalAPI(query, maxResults);
        if (apiResult) return apiResult;

        // 2. 用户自建 SearXNG 实例
        if (customInstance) {
            const customResult = await searchViaCustomSearXNG(query, customInstance, maxResults);
            if (customResult) return customResult;
        }

        return { results: [], source: '' };
    }

    /**
     * 将搜索结果格式化为模型 prompt 上下文
     */
    function formatResultsForPrompt(query, results) {
        if (!results || results.length === 0) return '';
        let text = `以下是关于「${query}」的网络搜索结果：\n\n`;
        results.forEach((r, i) => {
            text += `[${i + 1}] ${r.title}\n`;
            text += `    摘要：${r.snippet}\n`;
            text += `    来源：${r.url}\n\n`;
        });
        text += `请基于以上搜索结果，结合你的知识，给出准确、全面的回答。如果搜索结果不够充分，请说明并补充你的知识。`;
        return text;
    }

    return { search, formatResultsForPrompt };
})();
