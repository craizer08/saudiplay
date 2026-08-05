export const config = { runtime: 'edge' };

const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar,en;q=0.9',
    'Referer': 'https://shahid4u.living/',
    'Cache-Control': 'no-cache'
};

export default async function handler(request) {
    const url = new URL(request.url);
    const target = (url.searchParams.get('url') || 'https://shahid4u.living/').trim();
    const ua = url.searchParams.get('ua') || H['User-Agent'];
    const ref = url.searchParams.get('ref') || H['Referer'];
    const method = (url.searchParams.get('m') || 'GET').toUpperCase();
    const post = url.searchParams.get('post');
    const headers = { ...H, 'User-Agent': ua, 'Referer': ref };
    const opts = { headers, redirect: 'follow' };
    if (method === 'POST') {
        opts.method = 'POST';
        opts.body = post || '';
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['X-Requested-With'] = 'XMLHttpRequest';
    }
    try {
        const r = await fetch(target, opts);
        const html = await r.text();
        return new Response(`<!-- edge status: ${r.status} size: ${html.length} -->\n` + html.slice(0, 400000), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    } catch (e) {
        return new Response('EDGE-ERR: ' + String(e), { status: 200 });
    }
}
