export const config = { runtime: 'edge' };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
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

const FV_PACK = /}\('((?:[^'\\]|\\.)*)',(36|62),(\d+),'([\s\S]*?)'\.split\('\|'\)/;

function packerUnpack(p, a, c, k) {
    let out = p;
    for (let i = c; i--;) {
        if (!k[i]) continue;
        const t = i.toString(a);
        const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.split(new RegExp('\\b' + esc + '\\b', 'g')).join(k[i]);
    }
    return out;
}

function findJsonObj(text, name) {
    const re = new RegExp('var ' + name + '=(\\{[^;]*\\})');
    const m = text.match(re);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
}

function extractFastvid(html) {
    const m = html.match(FV_PACK);
    if (!m) throw new Error('fastvid packed not found');
    const [, p, aStr, cStr, kstr] = m;
    const k = kstr.split('|');
    const decoded = packerUnpack(p, parseInt(aStr, 10), parseInt(cStr, 10), k);
    const links = findJsonObj(decoded, 'links');
    if (links) return links.hls2 || links.hls3 || '';
    const n = findJsonObj(decoded, 'n');
    if (n) {
        for (const key of Object.keys(n)) {
            const v = n[key];
            if (typeof v === 'string' && v.startsWith('http')) return v;
        }
    }
    return '';
}

async function fetchText(url, referer) {
    const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Referer': referer || 'https://govid.live/', 'Accept': '*/*' },
        redirect: 'follow'
    });
    return { r, t: await r.text() };
}

function absoluteUrl(u, base) {
    try { return new URL(u, base).href; } catch (e) { return u; }
}

function rewritePlaylist(t, base, passDomain) {
    // جعل كل الروابط مطلقة، وتمرير المقاطع التي تُرفض عبر /api/govid?seg=
    const lines = t.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l || l.startsWith('#')) continue;
        const abs = absoluteUrl(l, base);
        const host = new URL(abs).host;
        if (host === passDomain) {
            lines[i] = '/api/govid?seg=' + encodeURIComponent(abs);
        } else {
            lines[i] = abs;
        }
    }
    return lines.join('\n');
}

async function resolveGovid(play) {
    const { r, t } = await fetchText(play, 'https://shahid4u.living/');
    if (r.status !== 200) throw new Error('play ' + r.status);

    // النمط القديم: govid.live/e/xxx → Mohix hex → m3u8
    let e = '';
    const srcM = t.match(/src\s*=\s*['"]([^'"]*govid\.live[^'"]*)['"]/);
    if (srcM) {
        try { e = decodeURIComponent(srcM[1]); } catch (err) { e = srcM[1]; }
    }
    if (!e) {
        const raw = t.match(/govid\.live\/e\/[^'"\s<>]+/);
        if (raw) e = raw[0];
    }
    if (e.startsWith('https://govid.live/e/')) {
        const { t: t2 } = await fetchText(e, play);
        const hex = (t2.match(/const Mohix = "([0-9a-f]+)"/) || [])[1];
        if (!hex) throw new Error('Mohix not found');
        const m3u8 = hexToStr(hex);
        if (!m3u8.startsWith('http')) throw new Error('invalid m3u8');
        return { kind: 'hls', url: m3u8, passDomain: '' };
    }

    // النمط الجديد: fastvid.cam/embed/<id> → unpacked links.hls2/hls3
    const fv = t.match(/fastvid\.cam\/embed\/[^'"\s<>"'\\]+/) || t.match(/fastvid\.cam\/e\/[^'"\s<>"'\\]+/);
    if (!fv) throw new Error('e url not found');
    let embed = fv[0];
    if (!embed.startsWith('http')) embed = 'https://' + embed;

    const { t: t3 } = await fetchText(embed, 'https://govid.live/');
    const m3u8 = extractFastvid(t3);
    if (!m3u8.startsWith('http')) throw new Error('fastvid no hls');
    // hls2 = ACAO * => مباشر. hls3 = ACAO مقيد لـ fastvid.cam => نمرر عبر البروكسي
    return { kind: 'hls', url: m3u8, passDomain: m3u8.includes('futureengineering') ? 'futureengineering.space' : '' };
}

export default async function handler(request) {
    const url = new URL(request.url);

    // وضع بروكسي مقطع: /api/govid?seg=<absolute> — يُمرَّر عبر fastvid.cam
    const seg = (url.searchParams.get('seg') || '').trim();
    if (seg) {
        const { r } = await fetch(seg, {
            headers: { 'User-Agent': UA, 'Referer': 'https://fastvid.cam/', 'Range': request.headers.get('range') || '' },
            redirect: 'follow'
        });
        const body = await r.arrayBuffer();
        return new Response(body, {
            status: r.status,
            headers: {
                'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Range',
                'Content-Length': String(body.byteLength),
                ...(r.headers.get('content-range') ? { 'Content-Range': r.headers.get('content-range') } : {})
            }
        });
    }

    const play = (url.searchParams.get('url') || '').trim();
    if (!play.startsWith('https://govid.live/play/')) {
        return json({ error: 'يُرجى تمرير رابط مشغل govid في المعامل url' }, 400);
    }

    try {
        const { kind, url: m3u8, passDomain } = await resolveGovid(play);

        const r3 = await fetch(m3u8, {
            headers: { 'User-Agent': UA, 'Referer': 'https://fastvid.cam/', 'Accept': '*/*' },
            redirect: 'follow'
        });
        const t3 = await r3.text();
        if (r3.status !== 200 || /^\s*404/.test(t3)) throw new Error('m3u8 ' + r3.status);

        const manifest = rewritePlaylist(t3, m3u8, passDomain);
        return new Response(manifest, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
                'Cache-Control': 'no-cache',
                ...CORS
            }
        });
    } catch (e) {
        return json({ error: String(e) }, 502);
    }
}
