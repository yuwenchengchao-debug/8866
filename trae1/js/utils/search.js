// Vercel Serverless Function - 搜索代理
// 路径: /api/search?q=关键词&source=searxng|ddg|bing
// 在服务端发起搜索请求，绕过 CORS 和网络限制

export default async function handler(req, res) {
    // 仅允许 GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { q: query, source = 'ddg', max = 5 } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Missing query parameter "q"' });
    }

    const maxResults = Math.min(parseInt(max) || 5, 10);

    try {
        let results = [];

        if (source === 'searxng') {
            results = await searchViaSearXNG(query, maxResults);
        } else if (source === 'bing') {
            results = await searchViaBing(query, maxResults);
        } else {
            // 默认用 DuckDuckGo Lite
            results = await searchViaDDG(query, maxResults);
        }

        res.status(200).json({ results, source });
    } catch (err) {
        console.error('[Search API]', err.message);
        res.status(500).json({ error: err.message, results: [] });
    }
}

// ========== DuckDuckGo Lite ==========
async function searchViaDDG(query, maxResults) {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    return parseDDGHTML(html, maxResults);
}

function parseDDGHTML(html, maxResults) {
    const results = [];
    // 用正则提取，避免 DOMParser 在 edge runtime 的问题
    const trRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    let match;

    while ((match = trRegex.exec(html)) !== null && results.length < maxResults) {
        const tr = match[0];

        // 提取链接
        const hrefMatch = tr.match(/<a[^>]*class="result-link"[^>]*href="([^"]*)"/i);
        // 提取标题
        const titleMatch = tr.match(/<span[^>]*class="result-title"[^>]*>([\s\S]*?)<\/span>/i);
        // 提取摘要
        const snippetMatch = tr.match(/<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i);

        if (hrefMatch && snippetMatch) {
            const url = hrefMatch[1] || '';
            const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';
            const snippet = snippetMatch[1].replace(/<[^>]*>/g, '').trim();

            if (url && title && snippet && !url.startsWith('/')) {
                results.push({ title, url, snippet });
            }
        }
    }

    return results;
}

// ========== Bing ==========
async function searchViaBing(query, maxResults) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    return parseBingHTML(html, maxResults);
}

function parseBingHTML(html, maxResults) {
    const results = [];
    const algoRegex = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;

    while ((match = algoRegex.exec(html)) !== null && results.length < maxResults) {
        const block = match[1];

        const linkMatch = block.match(/<h2[^>]*><a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>/i);
        const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

        if (linkMatch) {
            const url = linkMatch[1] || '';
            const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
            const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';

            if (url && title) {
                results.push({ title, url, snippet });
            }
        }
    }

    return results;
}

// ========== SearXNG 公共实例 ==========
const SEARXNG_INSTANCES = [
    'https://search.sapti.me',
    'https://searx.oxf.io',
    'https://searxng.ch',
    'https://search.mdosch.de',
];

async function searchViaSearXNG(query, maxResults) {
    for (const instance of SEARXNG_INSTANCES) {
        try {
            const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&safesearch=0`;
            const res = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) continue;
            const data = await res.json();
            const results = (data.results || []).slice(0, maxResults).map(r => ({
                title: r.title || '',
                url: r.url || '',
                snippet: r.content || '',
            }));
            if (results.length > 0) return results;
        } catch (e) {
            console.warn(`[SearXNG] ${instance} failed:`, e.message);
        }
    }
    return [];
}
