// Downloads ~6 years of daily prices (Yahoo Finance chart endpoint) and quarterly
// EPS/revenue (SEC EDGAR XBRL company facts) into backtest/cache/. Free, no keys.
import fs from 'node:fs';
import { UNIVERSE, ETFS, START } from './universe.mjs';

const CACHE = new URL('./cache/', import.meta.url);
fs.mkdirSync(CACHE, { recursive: true });
// SEC requires a real contact in the User-Agent: SEC_UA="Name email@domain" node backtest/fetch.mjs
const UA = process.env.SEC_UA || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prices(sym) {
  const file = new URL(`px_${sym}.json`, CACHE);
  if (fs.existsSync(file)) return;
  const p1 = Math.floor(new Date(START) / 1000), p2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?period1=${p1}&period2=${p2}&interval=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${sym} prices ${r.status}`);
  const j = (await r.json()).chart.result[0];
  const q = j.indicators.quote[0];
  const rows = j.timestamp.map((t, i) => ({
    date: new Date((t + j.meta.gmtoffset) * 1000).toISOString().slice(0, 10),
    o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i],
  })).filter((x) => x.c != null && x.h != null && x.l != null);
  fs.writeFileSync(file, JSON.stringify(rows));
}

const EPS_TAGS = ['EarningsPerShareDiluted', 'EarningsPerShareBasic'];
const REV_TAGS = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'];

// Quarterly (≈3-month duration) values keyed by period end, keeping the first-filed number.
function quarterly(facts, tags, unit) {
  const byEnd = {};
  for (const tag of tags) {
    for (const f of (facts[tag] && facts[tag].units[unit]) || []) {
      if (!f.start || !/^10-[QK]/.test(f.form)) continue;
      const days = (new Date(f.end) - new Date(f.start)) / 864e5;
      if (days < 80 || days > 100) continue;
      const prev = byEnd[f.end];
      if (!prev || f.filed < prev.filed) byEnd[f.end] = { end: f.end, filed: f.filed, val: f.val };
    }
  }
  return Object.values(byEnd).sort((a, b) => a.end.localeCompare(b.end));
}

async function fundamentals(sym, cik) {
  const file = new URL(`fd_${sym}.json`, CACHE);
  if (fs.existsSync(file)) return;
  const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${sym} EDGAR ${r.status}`);
  const facts = (await r.json()).facts['us-gaap'] || {};
  fs.writeFileSync(file, JSON.stringify({ eps: quarterly(facts, EPS_TAGS, 'USD/shares'), rev: quarterly(facts, REV_TAGS, 'USD') }));
}

if (!UA) { for (const sym of [...ETFS, ...Object.keys(UNIVERSE)]) { try { await prices(sym); } catch (e) { console.error(e.message); } await sleep(300); } console.log('prices done (set SEC_UA to also fetch fundamentals)'); process.exit(0); }
const tickers = await (await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': UA } })).json();
const cikOf = Object.fromEntries(Object.values(tickers).map((t) => [t.ticker, t.cik_str]));

for (const sym of [...ETFS, ...Object.keys(UNIVERSE)]) {
  try { await prices(sym); } catch (e) { console.error(e.message); }
  await sleep(300);
}
for (const sym of Object.keys(UNIVERSE)) {
  try { await fundamentals(sym, cikOf[sym.replace('.', '-')]); } catch (e) { console.error(e.message); }
  await sleep(150);
}
console.log('done');
