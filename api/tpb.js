export const config = { runtime: 'edge' };

const TPB_BASE = 'https://thepiratebay-plus.strem.fun';
const MAX = 10;
const CORS = { 'Access-Control-Allow-Origin': '*' };

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
    });
}

function rankQuality(q) {
    const t = String(q || '').toLowerCase();
    if (/2160|4k|uhd/.test(t)) return 2160;
    const m = /(\d{3,4})p/.exec(t);
    return m ? Number(m[1]) : 0;
}

// أول سطر من title = اسم التورنت؛ بقية الأسطر = Metadata (الجودة/البذور/الحجم)
function parseTitle(title) {
    return String(title || '').split('\n')[0].trim();
}

function parseMeta(title) {
    const t = String(title || '');
    const size = (t.match(/(\d+(?:[.,]\d+)?\s*(?:GB|MB|KB))/i) || [])[1] || '';
    const seeds = (t.match(/👤\s*(\d+)/) || [])[1] || null;
    return { size, seeders: seeds ? Number(seeds) : null };
}

// تخزين مؤقت في الذاكرة
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

export default async function handler(request) {
    const url = new URL(request.url);
    const imdb = (url.searchParams.get('imdb') || '').trim().toLowerCase();
    const type = url.searchParams.get('type') === 'series' ? 'series' : 'movie';
    const season = parseInt(url.searchParams.get('season') || '1', 10) || 1;
    const episode = parseInt(url.searchParams.get('episode') || '1', 10) || 1;

    if (!/^tt\d+$/i.test(imdb)) return json({ error: 'معامل imdb مطلوب (tt...)', streams: [] }, 400);

    const id = type === 'series' ? `${imdb}:${season}:${episode}` : imdb;
    const ckey = `${imdb}:${type}:${season}:${episode}`;
    const hit = cache.get(ckey);
    if (hit && Date.now() - hit.t < CACHE_TTL) return json(hit.v);

    try {
        const r = await fetch(`${TPB_BASE}/stream/${type}/${id}.json`, {
            headers: { Accept: 'application/json' },
            redirect: 'follow'
        });
        if (!r.ok) return json({ error: `TPB+ HTTP ${r.status}`, streams: [] }, 502);

        const d = await r.json();
        const out = [];
        const seen = new Set();

        for (const st of d.streams || []) {
            const infoHash = st.infoHash || (typeof st.url === 'string' && /btih:([a-fA-F0-9]{40})/i.exec(st.url)?.[1]);
            if (!infoHash) continue;

            const fileIdx = st.fileIdx != null ? Number(st.fileIdx) : 0;
            const dk = `${infoHash}:${fileIdx}`;
            if (seen.has(dk)) continue;
            seen.add(dk);

            const title = st.title || st.name || 'TPB+';
            const meta = parseMeta(title);
            const quality = String(st.tag || '').toLowerCase() || 'auto';

            out.push({
                infoHash,
                fileIdx,
                quality,
                name: parseTitle(title),
                title,
                size: meta.size,
                seeders: meta.seeders
            });
        }

        out.sort((a, b) => rankQuality(b.quality) - rankQuality(a.quality));

        const result = {
            imdbId: imdb,
            type,
            season,
            episode,
            count: out.length,
            streams: out.slice(0, MAX)
        };
        cache.set(ckey, { t: Date.now(), v: result });
        return json(result);
    } catch (e) {
        return json({ error: String(e), streams: [] }, 502);
    }
}
