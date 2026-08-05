const fs = require('fs');
const path = require('path');

const PROXY = process.env.PROXY_URL || 'https://saudiplay.vercel.app/api/proxy';
const BASE = 'https://shahid4u.living';
const GBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const TMP = process.env.CRAWL_DIR || path.join(__dirname, 'crawldata');
fs.mkdirSync(TMP, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function poolFetch(items, fn, concurrency) {
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const cur = idx++;
      try { await fn(items[cur], cur); } catch (e) { console.log('  item fail:', e.message); }
    }
  };
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, worker));
}

async function proxyFetch(url, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const u = new URL(PROXY);
      u.searchParams.set('url', url);
      u.searchParams.set('ua', GBOT);
      u.searchParams.set('ref', 'https://shahid4u.living/');
      const r = await fetch(u, { signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error('proxy status ' + r.status);
      const text = await r.text();
      if (!text || text.length < 500) throw new Error('short body ' + text.length);
      return text;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

function htmlDecode(s) {
  if (!s) return '';
  return s.replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
          .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function b64url(o) {
  const b = Buffer.from(JSON.stringify(o)).toString('base64');
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseCategory(html) {
  const cards = [];
  const cardRe = /<a\s+href="(https:\/\/shahid4u\.living\/[^"]+)"\s+title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = cardRe.exec(html))) {
    const [, href, title, inner] = m;
    if (inner.indexOf('Poster') === -1) continue;
    const nm = inner.match(/<div class="number"><span>([^<]*)<\/span><em>(\d+)<\/em><\/div>/);
    const pm = inner.match(/data-src="([^"]+)"/);
    const cm = inner.match(/<li class="category">([^<]*)<\/li>/);
    const qm = inner.match(/<div class="ribbon">\s*<span[^>]*>([^<]*)<\/span>/);
    if (!pm) continue;
    cards.push({
      href,
      title: htmlDecode(title.trim()),
      num: nm ? parseInt(nm[2], 10) : 0,
      numLabel: nm ? nm[1].trim() : '',
      poster: pm[1],
      cat: cm ? htmlDecode(cm[1].trim()) : '',
      quality: qm ? qm[1].trim() : ''
    });
  }
  return cards;
}

function parseWatch(html) {
  const servers = [];
  const sre = /<li data-watch="([^"]+)"[\s\S]*?<i class="[^"]*"><\/i>([^<]+)<\/li>/g;
  let m;
  while ((m = sre.exec(html))) {
    servers.push({ name: m[2].trim(), url: m[1].trim() });
  }

  const eps = [];
  const blk = html.match(/class="EpisodesList[^"]*">([\s\S]*?)<\/div>/);
  if (blk) {
    const ere = /<a\s+href="(https:\/\/shahid4u\.living\/[^"]+\/watch)"[^>]*>([\s\S]*?)<\/a>/g;
    let em;
    while ((em = ere.exec(blk[1]))) {
      const url = em[1];
      let num = parseInt((decodeURIComponent(url).match(/الحلقة-(\d+)/) || [])[1], 10);
      const t = htmlDecode(em[2]).replace(/\s+/g, ' ').trim();
      if (!num) { const n = t.match(/\d+/); num = n ? parseInt(n[0], 10) : NaN; }
      eps.push({ url, num, label: t });
    }
  }

  const og = html.match(/property="og:image"\s+content="([^"]+)"/);
  return { servers, eps, og: og ? og[1] : '' };
}

function seriesKey(title) {
  return title.replace(/\s+الحلقة\s+\d+/i, '').replace(/\s+/g, ' ').trim();
}

function cached(file) {
  const p = path.join(TMP, file);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function save(file, data) {
  fs.writeFileSync(path.join(TMP, file), data);
}
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function buildCategory(catUrl, seriesLimit, maxEps, outName) {
  const catLabel = decodeURIComponent(catUrl.split('/').filter(Boolean).pop()).replace(/-/g, ' ');
  const catHtml = await proxyFetch(catUrl);
  const cards = parseCategory(catHtml);
  console.log('category:', catLabel, 'cards:', cards.length);

  const groups = new Map();
  for (const c of cards) {
    const key = seriesKey(c.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const entries = [];
  const gArr = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  let gIdx = 0;
  for (const [key, g] of gArr) {
    if (gIdx++ >= seriesLimit) break;
    const rep = g.filter(c => c.cat).sort((a, b) => b.num - a.num)[0] || g[0];
    const repWatchUrl = rep.href + 'watch/';
    const isMovie = !/\s+الحلقة\s+\d+/i.test(rep.title);
    const title = isMovie ? rep.title.trim() : seriesKey(rep.title);
    console.log(`\n[${gIdx}/${groups.size}] ${title} (${g.length} cards, movie=${isMovie})`);
    const stateFile = 'ser_' + hash(repWatchUrl) + '.json';
    const state = JSON.parse(cached(stateFile) || '{"done":{}}');

    let w;
    try {
      w = parseWatch(await proxyFetch(repWatchUrl));
    } catch (e) { console.log('  FAIL initial watch:', e.message); continue; }
    console.log('  servers(own):', w.servers.length, 'episodes listed:', w.eps.length);

    const ownNum = parseInt((decodeURIComponent(repWatchUrl).match(/الحلقة-(\d+)/) || [])[1], 10);
    const ownRec = { url: repWatchUrl, num: isMovie ? 0 : ownNum, servers: w.servers };

    const eps = w.eps.slice(0, maxEps);
    if (!(ownRec.url in state.done)) state.done[ownRec.url] = ownRec;
    const all = [ownRec].concat(eps);
    const pending = all.filter(ep => !state.done[ep.url]);
    const startFetch = Date.now();
    await poolFetch(pending, async (ep) => {
      const ehtml = await proxyFetch(ep.url);
      const ew = parseWatch(ehtml);
      state.done[ep.url] = { url: ep.url, num: ep.num, servers: ew.servers };
      save(stateFile, JSON.stringify(state));
      console.log(`  ep${ep.num}: ${ew.servers.length} servers`);
    }, 8);
    console.log('  fetched:', pending.length, 'in', ((Date.now() - startFetch) / 1000).toFixed(0) + 's');

    const poster = rep.poster || (w.og || '');
    for (const [u, rec] of Object.entries(state.done)) {
      if (rec.num === undefined || isNaN(rec.num)) continue;
      if (!rec.servers || rec.servers.length === 0) continue;
      entries.push({
        title,
        category: rep.cat || catLabel,
        episode_number: isMovie ? 'فيلم' : ('الحلقة ' + rec.num),
        poster_url: poster,
        video_url: 'player.html?post=' + b64url({ servers: rec.servers })
      });
    }
    save(outName, JSON.stringify(entries, null, 0));
  }
  console.log('\nTOTAL entries:', entries.length, '=>', outName);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'explore') {
    const html = await proxyFetch(BASE + '/');
    save('home.html', html);
    console.log('home size', html.length);
    const seen = new Set();
    const re = /href="(https:\/\/shahid4u\.living\/(?:category|genre|series|movies|home)[^"]*)"/g;
    let m;
    while ((m = re.exec(html))) {
      const u = decodeURIComponent(m[1]);
      if (seen.has(u)) continue;
      seen.add(u);
      console.log(u);
    }
    return;
  }

  if (cmd === 'category') {
    const url = args[1];
    const html = await proxyFetch(url);
    const cards = parseCategory(html);
    console.log('cards:', cards.length);
    cards.forEach(c => {
      console.log(`#${c.num} | ${c.title} | [${c.cat}] | ${c.quality} | ${c.href}`);
    });
    return;
  }

  if (cmd === 'watch') {
    const url = args[1];
    const html = await proxyFetch(url);
    save('watch_sample.html', html);
    const w = parseWatch(html);
    console.log('servers:', w.servers.length);
    w.servers.forEach(s => console.log('  -', s.name, s.url.slice(0, 60)));
    console.log('episodes in list:', w.eps.length);
    w.eps.forEach(e => console.log(`  ep${e.num}: ${e.label}`));
    return;
  }

  if (cmd === 'build') {
    const catUrl = args[1];
    const seriesLimit = parseInt(args[2] || '8', 10);
    const maxEps = parseInt(args[3] || '200', 10);
    const outName = args[4] || ('shahid_' + hash(catUrl) + '.json');
    await buildCategory(catUrl, seriesLimit, maxEps, outName);
    return;
  }

  if (cmd === 'run-all') {
    const seriesLimit = parseInt(args[1] || '3', 10);
    const cats = [
      { url: 'مسلسلات-تركية', n: seriesLimit, m: 300 },
      { url: 'مسلسلات-اسيوية', n: seriesLimit, m: 300 },
      { url: 'مسلسلات-اجنبي', n: seriesLimit, m: 300 },
      { url: 'مسلسلات-انمي', n: seriesLimit, m: 300 },
      { url: 'مسلسلات-عربي', n: seriesLimit, m: 300 },
      { url: 'مسلسلات-مدبلجة', n: seriesLimit, m: 300 },
      { url: 'مسلسلات-هندية', n: seriesLimit, m: 300 },
      { url: 'افلام-اجنبي', n: 60, m: 2 },
      { url: 'افلام-اسيوية', n: 60, m: 2 },
      { url: 'افلام-انمي', n: 60, m: 2 },
      { url: 'افلام-تركية', n: 60, m: 2 },
      { url: 'افلام-عربي', n: 60, m: 2 },
      { url: 'افلام-هندي', n: 60, m: 2 },
      { url: 'برامج-تلفزيونية', n: seriesLimit, m: 300 },
      { url: 'عروض-مصارعة', n: seriesLimit, m: 300 }
    ];
    const totalStart = Date.now();
    for (const c of cats) {
      const catUrl = BASE + '/category/' + encodeURIComponent(c.url) + '/';
      console.log('\n===== ' + c.url + ' =====');
      try {
        await buildCategory(catUrl, c.n, c.m, 'shahid_' + c.url + '.json');
      } catch (e) {
        console.log('CATEGORY FAIL', c.url, e.message);
      }
    }
    console.log('\nALL DONE in', ((Date.now() - totalStart) / 60000).toFixed(1), 'min');
    return;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
