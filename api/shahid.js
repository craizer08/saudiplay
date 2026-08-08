export const config = { runtime: 'edge' };

const API = 'https://api2.shahid.net/proxy';
const UA = 'Shahid/3660 CFNetwork/1220.1 Darwin/20.3.0';
const SA = 'Shahid/6.8.3.3660 CFNetwork/1220.1 Darwin/20.3.0 (iPhone/6s iOS/14.4) Safari/604.1';
const CORS = { 'Access-Control-Allow-Origin': '*' };

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
    });
}

let session = { jwt: '', at: 0 };

async function getSession() {
    if (session.jwt && Date.now() - session.at < 50 * 60 * 1000) return session.jwt;
    const r = await fetch(API + '/v2/session/ios', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Shahid-Agent': SA },
        body: '{}'
    });
    if (!r.ok) throw new Error('session ' + r.status);
    const d = await r.json();
    session = { jwt: d.jwt, at: Date.now() };
    return session.jwt;
}

function browseHeaders(jwt) {
    return {
        'Shahid-Agent': SA,
        'User-Agent': UA,
        'UUID': 'ios',
        'language': 'ar',
        'S-Session': jwt,
        'profile': '{"id":null,"master":0,"age":null,"ageRestriction":false}'
    };
}

function searchHeaders(jwt) {
    return {
        'User-Agent': UA,
        'Shahid-Agent': SA,
        'UUID': 'web',
        'S-Session': jwt,
        'language': 'ar',
        'Accept-Language': 'ar',
        'profile': '{"id":"00000000-0000-0000-0000-000000000000","master":false,"age":null,"ageRestriction":false}',
        'profile-key': '{"isAdult":false,"ageRestriction":false,"age":0}'
    };
}

function img(u, w, h) {
    if (!u) return '';
    return u
        .replace(/\{width\}/g, String(w))
        .replace(/\{height\}/g, String(h))
        .replace(/\{croppingPoint\}/g, 'mc');
}

function mapProduct(p) {
    const plus = !!(p.pricingPlans && p.pricingPlans[0] && p.pricingPlans[0].availability && p.pricingPlans[0].availability.plus);
    return {
        id: String(p.id),
        title: p.title || '',
        description: p.description || '',
        poster: img((p.image && p.image.posterImage) || '', 300, 450),
        thumb: img((p.image && p.image.thumbnailImage) || '', 320, 180),
        hero: img((p.image && p.image.heroSliderImage) || (p.image && p.image.landscapeClean) || '', 1280, 720),
        plus,
        year: (p.createdDate || '').split('T')[0]
    };
}

export default async function handler(request) {
    const url = new URL(request.url);
    const action = (url.searchParams.get('action') || 'browse').trim();

    try {
        const jwt = await getSession();

        if (action === 'search') {
            const name = (url.searchParams.get('q') || '').trim();
            const tab = (url.searchParams.get('tab') || 'TV_SHOWS').trim();
            if (!name) return json({ error: 'معامل q مطلوب' }, 400);
            const body = JSON.stringify({ name, limit: 20, offset: 0 });
            const r = await fetch(`${API}/v2.1/search/${tab}?request=${encodeURIComponent(body)}&country=SA`, {
                headers: searchHeaders(jwt)
            });
            if (!r.ok) return json({ error: 'search ' + r.status }, 502);
            const d = await r.json();
            const items = (d.productList || []).map(mapProduct);
            return json({ items, tab });
        }

        if (action === 'browse') {
            const ptype = (url.searchParams.get('type') || 'SHOW').trim().toUpperCase();
            const page = parseInt(url.searchParams.get('page') || '0', 10);
            const filter = JSON.stringify({
                pageNumber: page,
                pageSize: 24,
                productType: ptype,
                sorts: [{ order: 'DESC', type: 'SORTDATE' }]
            });
            const r = await fetch(API + '/v2.1/product/filter?filter=' + encodeURIComponent(filter), {
                headers: browseHeaders(jwt)
            });
            if (!r.ok) return json({ error: 'filter ' + r.status }, 502);
            const d = await r.json();
            const pl = d.productList || {};
            return json({
                items: (pl.products || []).map(mapProduct),
                hasMore: !!pl.hasMore,
                type: ptype
            });
        }

        if (action === 'seasons') {
            const showId = (url.searchParams.get('showId') || '').trim();
            if (!showId) return json({ error: 'showId مطلوب' }, 400);
            const req = JSON.stringify({ showId });
            const r = await fetch(API + '/v2.1/playableAsset?request=' + encodeURIComponent(req), {
                headers: browseHeaders(jwt)
            });
            if (!r.ok) return json({ error: 'playableAsset ' + r.status }, 502);
            const d = await r.json();
            const show = (d.productModel && d.productModel.show) || {};
            const seasons = (show.seasons || []).map(s => ({
                id: String(s.id),
                number: s.seasonNumber
            }));
            return json({
                showTitle: (show.title || '').trim(),
                poster: img((show.image && show.image.posterImage) || '', 300, 450),
                seasons
            });
        }

        if (action === 'episodes') {
            const seasonId = (url.searchParams.get('seasonId') || '').trim();
            if (!seasonId) return json({ error: 'seasonId مطلوب' }, 400);
            const req = JSON.stringify({ seasonId });
            const r = await fetch(API + '/v2.1/playableAsset?request=' + encodeURIComponent(req), {
                headers: browseHeaders(jwt)
            });
            if (!r.ok) return json({ error: 'playableAsset ' + r.status }, 502);
            const d = await r.json();
            const playlist = (d.productModel && d.productModel.playlist) || {};
            const playListId = playlist.id;
            if (!playListId) return json({ items: [], playListId: '' });
            const req2 = JSON.stringify({ playListId, pageNumber: 0, pageSize: 60 });
            const r2 = await fetch(API + '/v2.1/product/playlist?request=' + encodeURIComponent(req2), {
                headers: browseHeaders(jwt)
            });
            if (!r2.ok) return json({ error: 'playlist ' + r2.status }, 502);
            const d2 = await r2.json();
            const eps = (d2.productList && d2.productList.products || []).map(p => ({
                id: String(p.id),
                number: p.number,
                title: p.title || '',
                thumb: img((p.image && p.image.thumbnailImage) || '', 320, 180),
                duration: p.duration || 0
            }));
            return json({ items: eps, playListId: String(playListId) });
        }

        if (action === 'play') {
            const streamId = (url.searchParams.get('streamId') || '').trim();
            if (!streamId) return json({ error: 'streamId مطلوب' }, 400);
            const r = await fetch(API + '/v2.1/playout/new/url/' + streamId, {
                headers: browseHeaders(jwt)
            });
            const t = await r.text();
            let d = null;
            try { d = JSON.parse(t); } catch (e) { /* ignore */ }
            if (!r.ok || !d) return json({ error: 'playout ' + r.status + ' ' + t.slice(0, 120) }, 502);
            const pl = d.playout || {};
            let raw = pl.url || '';
            const clean = raw.split('&')[0].trim();
            const hasMpd = /\.mpd(\?|$)/i.test(clean);
            return json({
                streamId,
                url: clean,
                drm: !!pl.drm,
                hasMpd,
                title: (d.title) || '',
                externalSubtitles: pl.externalSubtitles || ''
            });
        }

        return json({ error: 'action غير معروف' }, 400);
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
}
