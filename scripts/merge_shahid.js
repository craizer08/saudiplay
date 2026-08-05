const fs = require('fs');
const path = require('path');

const DIR = process.env.CRAWL_DIR || path.join(__dirname, 'crawldata');
const OUT = process.env.OUT_JSON || path.join(__dirname, '..', 'movies_data.json');

const shahid = [];
for (const f of fs.readdirSync(DIR).filter(f => /^shahid_.*\.json$/.test(f))) {
  try {
    const arr = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    shahid.push(...arr);
    console.log(f, '=>', arr.length);
  } catch (e) {
    console.log('skip', f, e.message);
  }
}

const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const merged = existing.slice();
const seen = new Set(existing.map(m => m.title + '||' + m.episode_number));
let added = 0;
for (const m of shahid) {
  const k = m.title + '||' + m.episode_number;
  if (!seen.has(k)) { seen.add(k); merged.push(m); added++; }
}
fs.writeFileSync(OUT, JSON.stringify(merged));
console.log('shahid entries:', shahid.length, '| added:', added, '| total:', merged.length);

const byCat = {};
merged.forEach(m => { byCat[m.category] = (byCat[m.category] || 0) + 1; });
console.log(JSON.stringify(byCat, null, 1));
