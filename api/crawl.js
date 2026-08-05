const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar,en;q=0.9',
    'Referer': 'https://krmizi.onl/'
};

async function get(url) {
    const r = await fetch(url, { headers: H, redirect: 'follow' });
    return r.text();
}

function decodeEntities(s) {
    return s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
}

export default async function handler(req, res) {
    const url = (req.query.url || '').trim();
    if (!url) return res.status(400).json({ error: 'missing url' });

    const out = { url, title: '', poster: '', count: 0, episodes: [] };
    try {
        const html = await get(url);
        out.poster = (html.match(/property="og:image" content="([^"]+)"/) || [])[1] || '';
        out.title = (html.match(/property="og:title" content="([^"]+)"/) || [])[1] || '';
        out.seriesSize = html.length;

        const links = new Set();
        const re = /href="([^"]*\/episode\/[^"]+)"/g;
        let m;
        while ((m = re.exec(html))) links.add(m[1].startsWith('http') ? m[1] : 'https://krmizi.onl' + m[1]);
        const list = [...links].sort();
        out.linksFound = list.length;

        let i = 0;
        const results = [];
        async function worker() {
            while (i < list.length) {
                const idx = i++;
                const epUrl = list[idx];
                const rec = { url: epUrl };
                try {
                    const eph = await get(epUrl);
                    rec.size = eph.length;
                    const dm = decodeEntities(eph);
                    const qm = dm.match(/qesen\.net\/krmzi\/?\?post=([A-Za-z0-9=_\-%]+)/);
                    rec.hasPost = !!qm;
                    if (!qm) rec.snippet = decodeEntities(eph).slice(0, 300);
                    let post = qm ? qm[1] : '';
                    if (post) {
                        try { post = decodeURIComponent(post); } catch (e) {}
                        const et = (eph.match(/property="og:title" content="([^"]+)"/) || [])[1] || '';
                        rec.title = et;
                        rec.post = post;
                    }
                    results.push(rec);
                } catch (e) {
                    rec.err = String(e);
                    results.push(rec);
                }
            }
        }
        await Promise.all([worker(), worker()]);
        results.sort((a, b) => a.url.localeCompare(b.url));

        out.count = results.filter(r => r.post).length;
        out.episodes = results;
        res.status(200).json(out);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
}
