export const config = { runtime: 'edge' };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const CORS = { 'Access-Control-Allow-Origin': '*' };

const SOURCES = {
    all: 'https://iptv-org.github.io/iptv/index.m3u',
    sports: 'https://iptv-org.github.io/iptv/categories/sports.m3u',
    movies: 'https://iptv-org.github.io/iptv/categories/movies.m3u',
    series: 'https://iptv-org.github.io/iptv/categories/series.m3u',
    news: 'https://iptv-org.github.io/iptv/categories/news.m3u',
    kids: 'https://iptv-org.github.io/iptv/categories/kids.m3u',
    entertainment: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
    music: 'https://iptv-org.github.io/iptv/categories/music.m3u',
    documentary: 'https://iptv-org.github.io/iptv/categories/documentary.m3u',
    ara: 'https://iptv-org.github.io/iptv/languages/ara.m3u',
    sa: 'https://iptv-org.github.io/iptv/countries/sa.m3u',
    eg: 'https://iptv-org.github.io/iptv/countries/eg.m3u'
};

function parseM3U(text) {
    const lines = text.split('\n');
    const channels = [];
    let current = null;
    for (const line of lines) {
        if (line.startsWith('#EXTINF')) {
            current = {
                name: '',
                logo: '',
                group: '',
                ua: '',
                url: ''
            };
            const logo = line.match(/tvg-logo="([^"]*)"/);
            if (logo) current.logo = logo[1];
            const group = line.match(/group-title="([^"]*)"/);
            if (group) current.group = group[1];
            const ua = line.match(/http-user-agent="([^"]*)"/);
            if (ua) current.ua = ua[1];
            const comma = line.lastIndexOf(',');
            if (comma >= 0) current.name = line.slice(comma + 1).trim();
        } else if (current && (line.startsWith('http://') || line.startsWith('https://'))) {
            current.url = line.trim();
            channels.push(current);
            current = null;
        }
    }
    return channels;
}

function json(data, status = 200, extra = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra }
    });
}

export default async function handler(request) {
    const url = new URL(request.url);
    const cat = (url.searchParams.get('cat') || 'ara').toLowerCase();
    const src = SOURCES[cat];
    if (!src) return json({ error: 'قسم غير معروف' }, 400);

    try {
        const r = await fetch(src, {
            headers: { 'User-Agent': UA, 'Accept': '*/*' },
            redirect: 'follow'
        });
        if (r.status !== 200) return json({ error: 'iptv-org ' + r.status }, 502);
        const t = await r.text();
        const channels = parseM3U(t);
        return json({ category: cat, count: channels.length, channels }, 200, {
            'Cache-Control': 'public, max-age=21600, s-maxage=21600'
        });
    } catch (e) {
        return json({ error: String(e) }, 500);
    }
}
