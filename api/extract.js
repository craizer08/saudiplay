const BASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'no-cache'
};

export default async function handler(req, res) {
    const url = (req.query.url || '').trim();
    if (!url || !/^https?:\/\//.test(url)) {
        return res.status(400).json({ error: 'يُرجى تمرير رابط صفحة الحلقة في المعامل url' });
    }

    const results = { url, steps: [] };

    try {
        const resp = await fetch(url, {
            headers: {
                ...BASE_HEADERS,
                'Referer': 'https://krmizi.onl/'
            },
            redirect: 'follow'
        });
        const html = await resp.text();
        results.steps.push({ step: 'fetch', status: resp.status, size: html.length });
        if (resp.status !== 200) {
            return res.status(200).json({ ...results, error: 'رابط الصفحة غير متاح' });
        }

        const decoded = html.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
                            .replace(/&amp;/g, '&');

        const ogTitle = html.match(/property="og:title" content="([^"]+)"/);
        const ogImage = html.match(/property="og:image" content="([^"]+)"/);
        const h1Title = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/);
        results.title = ogTitle ? ogTitle[1] : (h1Title ? h1Title[1] : (pageTitle ? pageTitle[1] : ''));
        results.poster = ogImage ? ogImage[1] : '';

        const qesenMatch = decoded.match(/qesen\.net\/krmzi\/?\?post=([A-Za-z0-9=_\-%]+)/);
        if (qesenMatch) {
            const rawPost = qesenMatch[1];
            let post = rawPost;
            try { post = decodeURIComponent(rawPost); } catch (e) {}
            results.post = post;
            return res.status(200).json(results);
        }

        const dataMatch = decoded.match(/data-post=['"]([^'"]+)['"]/);
        if (dataMatch) {
            results.post = dataMatch[1];
            return res.status(200).json(results);
        }

        const alt = decoded.match(/(?:krmzi\.php\?post=|\?post=)([A-Za-z0-9=_\-%]+)/);
        if (alt) {
            let post = alt[1];
            try { post = decodeURIComponent(post); } catch (e) {}
            results.post = post;
            return res.status(200).json(results);
        }

        return res.status(200).json({ ...results, error: 'لم يتم العثور على بيانات المشغل في الصفحة' });
    } catch (e) {
        return res.status(500).json({ ...results, error: String(e) });
    }
}
