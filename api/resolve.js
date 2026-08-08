export const config = { runtime: 'edge' };

const TMDB = 'https://api.themoviedb.org/3';
const CORS = { 'Access-Control-Allow-Origin': '*' };

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
    });
}

// كلمات تخلط على البحث (ألقاب/حالة العرض) — تُحذف قبل الاستعلام
const NOISE = new Set([
    'مسلسل', 'مسلسلات', 'فيلم', 'فلم', 'افلام', 'انمي', 'أنمي', 'أنمى', 'مترجم', 'مترجمه', 'مترجمة',
    'مدبلج', 'مدبلجه', 'مدبلجة', 'اونلاين', 'اون', 'لاين', 'الحلقة', 'حلقة', 'مشاهدة', 'موسم', 'الجزء', 'حلقات'
]);

// تطبيع أحرف عربية متشابهة لتسهيل المطابقة
function normAr(s) {
    return String(s || '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه');
}

function tokenize(s) {
    return normAr(s)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .filter((w) => w && !NOISE.has(w));
}

// تنظيف الاستعلام (إزالة كلمات الضوضاء) دون تغيير أحرف البحث الأصلية
function cleanQ(s) {
    return String(s || '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .filter((w) => w && !NOISE.has(w))
        .join(' ') || s;
}

function scoreCandidate(cand, qTokens) {
    const hay = `${cand.title || ''} ${cand.original_title || ''} ${cand.name || ''} ${cand.original_name || ''}`;
    const hTokens = tokenize(hay);
    if (!hTokens.length) return 0;
    let hits = 0;
    for (const t of qTokens) if (hTokens.includes(t)) hits++;
    return hits / Math.max(1, qTokens.length);
}

function tmdbFetch(path, params) {
    const key = process.env.TMDB_API_KEY;
    const url = new URL(TMDB + path);
    const isJwt = /^eyJ/.test(key || '');
    const headers = {};
    if (isJwt) headers.Authorization = 'Bearer ' + key;
    else url.searchParams.set('api_key', key);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return fetch(url, { headers, redirect: 'follow' });
}

async function searchMulti(query, lang) {
    const p = { query, include_adult: 'false' };
    if (lang) p.language = lang;
    const r = await tmdbFetch('/search/multi', p);
    if (!r.ok) return [];
    const d = await r.json();
    return d.results || [];
}

// تخزين مؤقت في الذاكرة لتقليل استدعاءات TMDB
const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;

export default async function handler(request) {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const type = url.searchParams.get('type') === 'series' ? 'series' : 'movie';
    const fresh = url.searchParams.get('fresh') === '1';

    if (!q) return json({ error: 'معامل q مطلوب' }, 400);
    if (!process.env.TMDB_API_KEY) {
        return json({ error: 'TMDB_API_KEY غير مضبوط في متغيرات Vercel', imdbId: null }, 503);
    }

    // دعم تمرير IMDb مباشرة
    if (/^tt\d+$/i.test(q)) return json({ imdbId: q.toLowerCase(), tmdbId: null, type, title: q });

    const qTokens = tokenize(q);
    const searchQ = cleanQ(q);
    const ckey = `${type}|${searchQ}`;
    if (!fresh && cache.has(ckey)) return json(cache.get(ckey));

    // صيغ بحث بديلة لالتقاط عناوين تختلف بالهمزة أو "ال"
    const variantQs = [searchQ];
    const hQ = searchQ.replace(/[أإآٱ]/g, 'ا');
    if (hQ !== searchQ) variantQs.push(hQ);
    const eQ = searchQ.replace(/(^|\s)ا/g, '$1إ');
    if (eQ !== searchQ) variantQs.push(eQ);
    const words = searchQ.split(/\s+/);
    words[0] = words[0].replace(/^ال/, '');
    const alQ = words.join(' ').trim();
    if (alQ && alQ !== searchQ) variantQs.push(alQ);

    let best = null;
    let bestSame = null;
    const seenIds = new Set();

    // 1) بحث باللغات ثم بالصيغ البديلة حتى نجد مرشّحاً
    const langs = ['ar-SA', 'en-US', ''];
    for (const qv of variantQs) {
        for (const lang of langs) {
            const results = await searchMulti(qv, lang);
            for (const it of results) {
                const apiType = it.media_type === 'movie' ? 'movie' : it.media_type === 'tv' ? 'tv' : null;
                const t = apiType === 'movie' ? 'movie' : apiType === 'tv' ? 'series' : null;
                if (!t || seenIds.has(`${t}:${it.id}`)) continue;
                seenIds.add(`${t}:${it.id}`);
                const sc = scoreCandidate(it, qTokens);
                if (sc > 0) {
                    const cand = { ...it, media_type: t, apiType, score: sc };
                    if (t === type) bestSame = bestSame && bestSame.score >= sc ? bestSame : cand;
                    else best = best && best.score >= sc ? best : cand;
                }
            }
            if (bestSame) break;
        }
        if (bestSame) break;
    }
    best = bestSame || best;

    // 2) جلب IMDb للمرشّحين الأوائل حتى نجد مطابقة
    let imdbId = null;
    let chosen = null;
    if (best) {
        const candidates = [best];
        const res2 = await searchMulti(searchQ, '');
        for (const it of res2) {
            const apiType = it.media_type === 'movie' ? 'movie' : it.media_type === 'tv' ? 'tv' : null;
            const t = apiType === 'movie' ? 'movie' : apiType === 'tv' ? 'series' : null;
            if (!t || seenIds.has(`${t}:${it.id}`)) continue;
            if (candidates.length >= 4) break;
            candidates.push({ ...it, media_type: t, apiType, score: scoreCandidate(it, qTokens) });
        }
        candidates.sort((a, b) => b.score - a.score);
        for (const c of candidates) {
            try {
                const ex = await tmdbFetch(`/${c.apiType}/${c.id}/external_ids`, {});
                const d = await ex.json();
                if (d.imdb_id) {
                    imdbId = d.imdb_id;
                    chosen = c;
                    break;
                }
            } catch (e) { /* جرب التالي */ }
        }
    }

    const result = {
        imdbId,
        tmdbId: chosen ? chosen.id : null,
        type: chosen ? chosen.media_type : type,
        title: chosen ? chosen.title || chosen.name : null,
        year: chosen ? (chosen.release_date || chosen.first_air_date || '').slice(0, 4) : null,
        score: chosen ? chosen.score : 0,
        error: imdbId ? null : 'لم يُعثر على مطابقة IMDb موثوقة لهذا العنوان'
    };
    cache.set(ckey, result);
    return json(result);
}
