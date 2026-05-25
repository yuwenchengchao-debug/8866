/**
 * server.js - 本地开发服务器
 * 用法: node server.js
 * 功能: 静态文件服务 + /api/search 搜索代理
 *
 * 替代 python -m http.server 8080
 * 部署到 Vercel 时不需要此文件，Vercel 自动处理 api/ 路由
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = __dirname;

// MIME 类型映射
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // ===== /api/search 搜索代理 =====
    if (url.pathname === '/api/search' && req.method === 'GET') {
        return handleSearchApi(url, req, res);
    }

    // ===== 静态文件服务 =====
    let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
    const ext = path.extname(filePath).toLowerCase();

    // 安全检查：防止路径遍历
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // 如果是目录，尝试 index.html
    try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }
    } catch (e) {
        // 文件不存在
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400',
        });
        res.end(data);
    });
});

// ========== 搜索 API 处理 ==========
async function handleSearchApi(url, req, res) {
    const query = url.searchParams.get('q');
    const source = url.searchParams.get('source') || 'auto';
    const max = Math.min(parseInt(url.searchParams.get('max')) || 5, 10);

    if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Missing query parameter "q"', results: [] }));
    }

    try {
        let results = [];
        let usedSource = source;

        if (source === 'searxng') {
            results = await searchViaSearXNG(query, max);
        } else if (source === 'bing') {
            results = await searchViaBing(query, max);
        } else if (source === 'baidu') {
            results = await searchViaBaidu(query, max);
        } else {
            // auto: cn.bing.com（国内最稳定）→ www.bing.com → SearXNG
            results = await searchViaBing(query, max, true); // cn.bing.com
            usedSource = 'Bing中国';
            if (results.length === 0) {
                results = await searchViaBing(query, max, false); // www.bing.com
                usedSource = 'Bing';
            }
            if (results.length === 0) {
                results = await searchViaSearXNG(query, max);
                usedSource = 'SearXNG';
            }
        }

        console.log(`[Search] "${query}" → ${results.length} results (${usedSource})`);

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ results, source: usedSource }));
    } catch (err) {
        console.error('[Search API]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, results: [] }));
    }
}

// ========== Bing 搜索（支持中国版和国际版） ==========
const BING_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

async function searchViaBing(query, maxResults, useChina = false) {
    const domain = useChina ? 'cn.bing.com' : 'www.bing.com';
    const searchUrl = `https://${domain}/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
    try {
        const res = await fetch(searchUrl, {
            headers: BING_HEADERS,
            signal: AbortSignal.timeout(12000),
        });
        const html = await res.text();
        return parseBingHTML(html, maxResults);
    } catch (e) {
        console.warn(`[Bing] ${domain} failed:`, e.message);
        return [];
    }
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
            if (url && title) results.push({ title, url, snippet });
        }
    }
    return results;
}

// ========== SearXNG（需用户自建或 VPN） ==========
const SEARXNG_INSTANCES = [
    'https://search.sapti.me',
    'https://searx.oxf.io',
    'https://searxng.ch',
    'https://search.mdosch.de',
];

async function searchViaSearXNG(query, maxResults) {
    for (const instance of SEARXNG_INSTANCES) {
        try {
            const searchUrl = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&safesearch=0`;
            const res = await fetch(searchUrl, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) continue;
            const data = await res.json();
            const results = (data.results || []).slice(0, maxResults).map(r => ({
                title: r.title || '', url: r.url || '', snippet: r.content || '',
            }));
            if (results.length > 0) return results;
        } catch (e) {
            // 静默失败，SearXNG 公共实例在国内大多不可用
        }
    }
    return [];
}

// ========== 百度搜索（备用） ==========
async function searchViaBaidu(query, maxResults) {
    const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${maxResults}`;
    try {
        const res = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Referer': 'https://www.baidu.com/',
            },
            signal: AbortSignal.timeout(10000),
        });
        const html = await res.text();
        return parseBaiduHTML(html, maxResults);
    } catch (e) {
        console.warn('[Baidu] failed:', e.message);
        return [];
    }
}

function parseBaiduHTML(html, maxResults) {
    const results = [];
    const h3Regex = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/gi;
    const snippetRegex = /<span[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;

    const links = [], titles = [], snippets = [];
    let match;

    while ((match = h3Regex.exec(html)) !== null) {
        links.push(match[1]);
        titles.push(match[2].replace(/<[^>]*>/g, '').trim());
    }
    while ((match = snippetRegex.exec(html)) !== null) {
        snippets.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    for (let i = 0; i < links.length && results.length < maxResults; i++) {
        const url = links[i];
        const title = titles[i];
        const snippet = snippets[i] || '';
        if (url && !url.includes('baidu.com') && title) {
            results.push({ title, url, snippet });
        }
    }
    return results;
}

server.listen(PORT, () => {
    console.log(`\n  🚀 本地服务器已启动: http://localhost:${PORT}`);
    console.log(`  📡 搜索代理已启用: http://localhost:${PORT}/api/search?q=测试\n`);
});
