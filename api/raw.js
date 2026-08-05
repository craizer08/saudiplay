const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar,en;q=0.9',
    'Referer': 'https://shahie4u.co/',
    'Cache-Control': 'no-cache'
};

export default async function handler(req, res) {
    const url = (req.query.url || 'https://shahie4u.co/').trim();
    try {
        const r = await fetch(url, { headers: H, redirect: 'follow' });
        const html = await r.text();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(`<!-- status: ${r.status} size: ${html.length} -->\n` + html);
    } catch (e) {
        res.status(500).send('ERR: ' + String(e));
    }
}
