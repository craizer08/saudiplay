export const config = { runtime: 'edge' };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CORS = { 'Access-Control-Allow-Origin': '*' };

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
    });
}

function hexToStr(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map((h) => parseInt(h, 16)));
    return new TextDecoder('utf-8').decode(bytes);
}

export default async function handler(request) {
    const url = new URL(request.url);
    const play = (url.searchParams.get('url') || '').trim();
    if (!play.startsWith('https://govid.live/play/')) {
        return json({ error: 'يُرجى تمرير رابط مشغل govid في المعامل url' }, 400);
    }

    try {
        const r1 = await fetch(play, {
            headers: { 'User-Agent': UA, 'Referer': 'https://shahid4u.living/', 'Accept': 'text/html,*/*' },
            redirect: 'follow'
        });
        const t1 = await r1.text();
        if (r1.status !== 200) return json({ error: 'play ' + r1.status }, 502);

        let e = '';
        const srcM = t1.match(/src\s*=\s*['"]([^'"]*govid\.live[^'"]*)['"]/);
        if (srcM) {
            try { e = decodeURIComponent(srcM[1]); } catch (err) { e = srcM[1]; }
        }
        if (!e) {
            const raw = t1.match(/govid\.live\/e\/[^'"\s<>]+/);
            if (raw) e = raw[0];
        }
        if (!e.startsWith('https://govid.live/e/')) return json({ error: 'e url not found' }, 502);

        const r2 = await fetch(e, {
            headers: { 'User-Agent': UA, 'Referer': play, 'Accept': 'text/html,*/*' },
            redirect: 'follow'
        });
        const t2 = await r2.text();
        const hex = (t2.match(/const Mohix = "([0-9a-f]+)"/) || [])[1];
        if (!hex) return json({ error: 'Mohix not found' }, 502);
        const m3u8 = hexToStr(hex);
        if (!m3u8.startsWith('http')) return json({ error: 'invalid m3u8' }, 502);

        const r3 = await fetch(m3u8, {
            headers: { 'User-Agent': UA, 'Referer': 'https://govid.live/', 'Accept': '*/*' },
            redirect: 'follow'
        });
        const t3 = await r3.text();
        if (r3.status !== 200 || /^\s*404/.test(t3)) return json({ error: 'm3u8 ' + r3.status }, 502);

        return new Response(t3, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
                'Cache-Control': 'no-cache',
                ...CORS
            }
        });
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
}
