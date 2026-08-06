const fs = require('fs');
const path = require('path');

const BASE = 'https://wemycima.hair';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const DATA_FILE = path.join(__dirname, '..', 'movies_data.json');

const CATEGORY_LABELS = {
    'qesma-w-naseeb': 'برامج',
    'arabic-tv-series-online': 'مسلسلات عربية',
    'turkish-series-online': 'مسلسلات تركية',
    'foreign-tv-series-online': 'مسلسلات أجنبية',
    'asian-dramas-online': 'مسلسلات آسيوية',
    'indian-tv-series-online': 'مسلسلات هندية',
    'anime-and-cartoons-online': 'أنمي',
    'online-tv-programs': 'برامج'
};

const DEFAULT_CATS = [
    'qesma-w-naseeb',
    'arabic-tv-series-online',
    'turkish-series-online',
    'foreign-tv-series-online',
    'asian-dramas-online',
    'anime-and-cartoons-online'
];

const CONCURRENCY = 6;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function get(url, tries = 3) {
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'ar,en;q=0.8' }, redirect: 'follow' });
            if (r.status === 200) return await r.text();
            throw new Error('status ' + r.status);
        } catch (e) {
            if (i === tries - 1) throw e;
            await sleep(800 * (i + 1));
        }
    }
}

function uniqueByVid(eps) {
    const m = new Map();
    eps.forEach(e => { if (!m.has(e.vid)) m.set(e.vid, e); });
    return [...m.values()];
}

async function crawlCategory(cat) {
    const eps = [];
    let page = 1;
    for (;;) {
        const url = BASE + '/category.php?cat=' + cat + '&page=' + page;
        const h = await get(url);
        const found = uniqueByVid([...h.matchAll(/watch\.php\?vid=([0-9a-f]+)[^>]*title="([^"]*)"/g)].map(m => ({ vid: m[1], title: m[2] })));
        if (found.length === 0) break;
        const before = eps.length;
        found.forEach(e => {
            if (!eps.some(x => x.vid === e.vid)) eps.push(e);
        });
        const hasNext = new RegExp('cat=' + cat + '&page=' + (page + 1)).test(h);
        if (!hasNext || eps.length === before) break;
        page++;
        await sleep(300);
    }
    const catTitle = await (async () => {
        const h = await get(BASE + '/category.php?cat=' + cat);
        const m = h.match(/<h1[^>]*>([^<]*)<\/h1>/);
        return m ? m[1].trim() : cat;
    })();
    return { cat, catTitle, eps };
}

function parseServers(html) {
    const block = html.match(/<ul class="list_servers[\s\S]*?<\/ul>/);
    if (!block) return [];
    const servers = [];
    for (const m of block[0].matchAll(/<li[^>]*id="server_[^"]*"[^>]*data-embed="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)) {
        const embed = m[1];
        const li = m[2];
        const nameM = li.match(/<strong>([^<]*)<\/strong>/);
        const srcM = embed.match(/src='([^']+)'/);
        if (srcM) servers.push({ name: nameM ? nameM[1].trim() : 'سيرفر', url: srcM[1] });
    }
    return servers;
}

function extractShowName(html) {
    const m = html.match(/<dt>المسلسل<\/dt>\s*<dd>\s*([^<]+?)\s*<\/dd>/);
    return m ? m[1].trim() : '';
}

function parseEpisodeNumber(title) {
    const m = title.match(/الحلقة\s*(\d+)/);
    if (!m) return 'الحلقة كاملة';
    const seasonM = title.match(/الموسم\s*([^ ]+)/);
    const num = m[1];
    const arabicNum = title.match(new RegExp('الحلقة\\s*' + num + '\\s*([^ ]+)'));
    let label = 'الحلقة ' + num;
    if (seasonM) label = 'الموسم ' + seasonM[1] + ' - ' + label;
    return label;
}

function isArabic(s) { return /[\u0600-\u06FF]/.test(s); }

function buildTitle(cat, catTitle, showName, epTitle) {
    const base = (showName || catTitle || '').trim();
    if (/^برنامج/.test(epTitle)) return /^برنامج/.test(base) ? base : 'برنامج ' + base;
    if (/^مسلسل/.test(epTitle)) return /^مسلسل/.test(base) ? base : 'مسلسل ' + base;
    if (/^فيلم/.test(epTitle)) return /^فيلم/.test(base) ? base : 'فيلم ' + base;
    const isSeries = /series/.test(cat) || /anime/.test(cat);
    if (isSeries && isArabic(base) && !/^مسلسل/.test(base)) return 'مسلسل ' + base;
    return base;
}

function makePost(servers) {
    const json = JSON.stringify({ servers: servers.map(s => ({ name: s.name, url: s.url })) });
    return Buffer.from(json, 'utf8').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function crawlEpisode(vid) {
    const html = await get(BASE + '/play.php?vid=' + vid);
    const servers = parseServers(html);
    if (servers.length === 0) return null;
    const showName = extractShowName(html);
    const titleM = html.match(/<h1 itemprop="name">([^<]+)<\/h1>/);
    const epTitle = titleM ? titleM[1].trim() : '';
    return {
        servers,
        showName,
        epTitle,
        poster: (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || ''
    };
}

async function mapWithConcurrency(items, fn, limit) {
    const results = new Array(items.length);
    let i = 0;
    async function worker() {
        while (i < items.length) {
            const idx = i++;
            try { results[idx] = await fn(items[idx]); } catch (e) { results[idx] = null; console.error('fail:', items[idx], String(e)); }
            await sleep(250);
        }
    }
    await Promise.all(Array.from({ length: limit }, worker));
    return results;
}

function countServers(videoUrl) {
    const p = videoUrl.split('post=')[1];
    if (!p) return 0;
    try {
        const j = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        return (j.servers || []).length;
    } catch (e) { return 0; }
}

function dedupeRecords(records) {
    const best = new Map();
    for (const m of records) {
        const key = m.title + '\u0001' + m.episode_number;
        const n = countServers(m.video_url);
        const cur = best.get(key);
        if (!cur || n > cur.n) best.set(key, { m, n });
    }
    return [...best.values()].map(x => x.m);
}

async function main() {
    const args = process.argv.slice(2);
    const maxArg = args.find(a => a.startsWith('--maxeps='));
    const maxEps = maxArg ? +maxArg.split('=')[1] : 0;
    const cats = args.filter(a => !a.startsWith('--'));
    const catList = cats.length ? cats : DEFAULT_CATS;

    console.log('Categories:', catList.join(', '));
    const all = [];
    for (const cat of catList) {
        console.log('[cat] crawling', cat);
        try {
            const { catTitle, eps } = await crawlCategory(cat);
            console.log('  found', eps.length, 'episodes; title:', catTitle);
            let list = eps;
            if (maxEps > 0) list = list.slice(0, maxEps);
            const label = CATEGORY_LABELS[cat] || cat;
            const epResults = await mapWithConcurrency(list, async ep => {
                const info = await crawlEpisode(ep.vid);
                if (!info) return null;
                const title = buildTitle(cat, catTitle, info.showName, info.epTitle);
                const poster = info.poster || '';
                const post = makePost(info.servers);
                return {
                    id: 'we-' + cat + '-' + ep.vid,
                    title,
                    episode_number: parseEpisodeNumber(info.epTitle || ep.title),
                    category: label,
                    poster_url: poster,
                    video_url: 'player.html?post=' + post
                };
            }, CONCURRENCY);
            const ok = epResults.filter(Boolean);
            all.push(...ok);
            console.log('  ok:', ok.length, 'skipped:', epResults.length - ok.length);
        } catch (e) {
            console.error('[cat] error', cat, String(e));
        }
    }

    console.log('Total new episodes fetched:', all.length);

    const deduped = dedupeRecords(all);
    console.log('After dedupe by show+episode:', deduped.length);

    let existing = [];
    if (fs.existsSync(DATA_FILE)) {
        try { existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { existing = []; }
    }
    const idIndex = new Map();
    existing.forEach((m, i) => { if (!idIndex.has(m.id)) idIndex.set(m.id, i); });
    let added = 0, updated = 0;
    for (const m of deduped) {
        if (idIndex.has(m.id)) { existing[idIndex.get(m.id)] = m; updated++; }
        else { idIndex.set(m.id, existing.length); existing.push(m); added++; }
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(existing), 'utf8');
    console.log('Saved:', DATA_FILE, '| total:', existing.length, '| added:', added, '| updated:', updated);
}

main().catch(e => { console.error(e); process.exit(1); });
