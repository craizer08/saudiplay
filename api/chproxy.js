export const config = { runtime: 'edge' };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export default async function handler(request) {
    const url = new URL(request.url);
    const target = (url.searchParams.get('u') || '').trim();
    if (!/^https?:\/\//.test(target)) {
        return new Response(JSON.stringify({ error: 'معامل u مطلوب' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
    }

    const customUA = (url.searchParams.get('ua') || '').trim() || UA;
    const headers = { 'User-Agent': customUA, 'Accept': '*/*' };
    if (request.headers.get('range')) headers['Range'] = request.headers.get('range');
    if (request.headers.get('origin')) headers['Origin'] = request.headers.get('origin');

    try {
        const r = await fetch(target, { headers, redirect: 'follow' });
        const body = await r.arrayBuffer();
        const res = new Response(body, {
            status: r.status,
            headers: {
                'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Range',
                'Cache-Control': 'no-cache'
            }
        });
        if (r.headers.get('content-range')) res.headers.set('Content-Range', r.headers.get('content-range'));
        if (r.headers.get('content-length')) res.headers.set('Content-Length', r.headers.get('content-length'));
        return res;
    } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
            status: 502,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
