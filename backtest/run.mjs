// 5-year walk-forward backtest of js/engine.js (the exact code the site runs).
// On every trading day it feeds the engine only data available up to that close,
// then checks what actually happened over the next HORIZON trading days.
// Writes data/backtest.json (results) and data/snapshot.json (latest real data for no-key mode).
import fs from 'node:fs';
import vm from 'node:vm';
import { UNIVERSE, ETFS, TEST_START, HORIZON } from './universe.mjs';

const root = new URL('../', import.meta.url);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('js/engine.js', root), 'utf8') + '\n;globalThis.Engine = Engine;', ctx);
const Engine = ctx.Engine;

const px = {};
for (const s of [...ETFS, ...Object.keys(UNIVERSE)]) {
  const rows = JSON.parse(fs.readFileSync(new URL(`backtest/cache/px_${s}.json`, root), 'utf8'));
  px[s] = Object.fromEntries(rows.map((r) => [r.date, r]));
}
const dates = Object.keys(px.SPY).sort();
const N = dates.length;
const col = (s, f) => dates.map((d) => (px[s][d] ? px[s][d][f] : null));
const C = {}, H = {}, L = {};
for (const s of Object.keys(px)) { C[s] = col(s, 'c'); H[s] = col(s, 'h'); L[s] = col(s, 'l'); }

const ret = (s, i, k) => (C[s][i] && C[s][i - k] ? (C[s][i] / C[s][i - k] - 1) * 100 : null);
function quoteAt(s, i) {
  const c = C[s][i], pc = C[s][i - 1];
  if (!c || !pc) return null;
  return { c, pc, h: H[s][i], l: L[s][i], o: pc, d: c - pc, dp: (c / pc - 1) * 100 };
}
function metricAt(s, i) {
  let hi = -Infinity, lo = Infinity;
  for (let k = i - 251; k <= i; k++) { if (H[s][k] != null) hi = Math.max(hi, H[s][k]); if (L[s][k] != null) lo = Math.min(lo, L[s][k]); }
  // beta: 1-year regression of daily returns on SPY
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let k = i - 251; k <= i; k++) {
    const a = C[s][k], b = C[s][k - 1], m = C.SPY[k], mb = C.SPY[k - 1];
    if (!a || !b || !m || !mb) continue;
    const x = m / mb - 1, y = a / b - 1;
    sx += x; sy += y; sxx += x * x; sxy += x * y; n++;
  }
  const beta = n > 100 ? (sxy - (sx * sy) / n) / (sxx - (sx * sx) / n) : 1;
  const r13 = ret(s, i, 63);
  return {
    '52WeekHigh': hi, '52WeekLow': lo, beta,
    '13WeekPriceReturnDaily': r13, '26WeekPriceReturnDaily': ret(s, i, 126), '52WeekPriceReturnDaily': ret(s, i, 252),
    'priceRelativeToS&P50013Week': r13 != null && ret('SPY', i, 63) != null ? r13 - ret('SPY', i, 63) : null,
  };
}
function marketAt(i) {
  const etf = {};
  for (const s of ETFS) { const q = quoteAt(s, i); if (q) etf[s] = q; }
  return Engine.marketSentiment(etf);
}

// ---------- walk forward ----------
const obs = [];
const spyDays = [];
const startIdx = dates.findIndex((d) => d >= TEST_START);
for (let i = startIdx; i + HORIZON < N; i++) {
  const market = marketAt(i);
  const spyFwd = (C.SPY[i + HORIZON] / C.SPY[i] - 1) * 100;
  spyDays.push({ score: market.score, fwd: spyFwd });
  for (const [sym, [industry]] of Object.entries(UNIVERSE)) {
    const q = quoteAt(sym, i);
    if (!q || !C[sym][i - 252] || !C[sym][i + HORIZON]) continue;
    const m = metricAt(sym, i);
    const a = Engine.analyzeStock({ sym, q, m, p: { finnhubIndustry: industry }, r: null, holding: null, market });
    let minC = Infinity, maxH = -Infinity;
    for (let k = i + 1; k <= i + HORIZON; k++) { minC = Math.min(minC, C[sym][k]); maxH = Math.max(maxH, H[sym][k]); }
    const fwd = (C[sym][i + HORIZON] / q.c - 1) * 100;
    obs.push({
      sym, date: dates[i], rule: a.plan.rule, action: a.plan.action, mScore: market.score,
      supDist: a.supDist, supLabel: a.ns && a.ns.label, supP: a.ns && a.ns.p, broken: !!a.lv.broken,
      rel26: m['26WeekPriceReturnDaily'] != null && ret('SPY', i, 126) != null ? m['26WeekPriceReturnDaily'] - ret('SPY', i, 126) : null,
      fwd, excess: fwd - spyFwd, drawdown: (minC / q.c - 1) * 100,
      stopHit: minC < a.plan.stop, targetHit: a.plan.target ? maxH >= a.plan.target : null,
    });
  }
}

// ---------- stats ----------
const r1 = (v) => Math.round(v * 10) / 10;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const share = (a, f) => (a.length ? (a.filter(f).length / a.length) * 100 : null);
function stats(list) {
  const t = list.filter((o) => o.targetHit !== null);
  return {
    n: list.length, avgFwd: r1(mean(list.map((o) => o.fwd))), pctUp: r1(share(list, (o) => o.fwd > 0)),
    avgExcess: r1(mean(list.map((o) => o.excess))), pctBeatSpy: r1(share(list, (o) => o.excess > 0)),
    stopHit: r1(share(list, (o) => o.stopHit)), targetHit: r1(share(t, (o) => o.targetHit)),
  };
}
const groupBy = (list, key) => list.reduce((g, o) => ((g[key(o)] = g[key(o)] || []).push(o), g), {});
const baseline = stats(obs);

const byAction = Object.fromEntries(Object.entries(groupBy(obs, (o) => o.action)).map(([k, v]) => [k, stats(v)]));
const byRule = Object.fromEntries(Object.entries(groupBy(obs, (o) => o.rule)).map(([k, v]) => [k, stats(v)]));

// Support test: when price is within 4% above a major support level, does the level hold
// (no close more than 2% under it in the next month)? Compared with chance: how often ANY
// stock avoids a drawdown of the same size, regardless of levels.
const dds = obs.map((o) => o.drawdown).sort((a, b) => a - b);
const fracAbove = (x) => { let lo = 0, hi = dds.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dds[m] <= x) lo = m + 1; else hi = m; } return (dds.length - lo) / dds.length; };
function supportStats(list) {
  if (!list.length) return null;
  const held = list.filter((o) => o.drawdown > -(o.supDist + 2));
  const chance = mean(list.map((o) => fracAbove(-(o.supDist + 2)))) * 100;
  return { n: list.length, held: r1((held.length / list.length) * 100), chance: r1(chance), edge: r1((held.length / list.length) * 100 - chance), avgFwd: r1(mean(list.map((o) => o.fwd))), pctUp: r1(share(list, (o) => o.fwd > 0)) };
}
const nearSup = obs.filter((o) => o.supDist !== null && o.supDist <= 4 && !o.broken);
const mktBucket = (s) => (s < 42 ? 'Weak market (<42)' : s < 58 ? 'Neutral market' : 'Strong market (58+)');
const support = {
  all: supportStats(nearSup),
  byMarket: Object.fromEntries(Object.entries(groupBy(nearSup, (o) => mktBucket(o.mScore))).map(([k, v]) => [k, supportStats(v)])),
  byLevel: Object.fromEntries(Object.entries(groupBy(nearSup, (o) => o.supLabel)).map(([k, v]) => [k, supportStats(v)])),
};

// Your example: strong stock + weak market + near support -> HOLD. "Strong" proxied by
// 6-month performance vs the S&P (earnings history wasn't used).
const ex = nearSup.filter((o) => o.mScore < 42 && o.rel26 !== null);
const example = {
  strong: stats(ex.filter((o) => o.rel26 > 5)), weak: stats(ex.filter((o) => o.rel26 < -5)), all: stats(ex),
};

const breakdown = { broke: stats(obs.filter((o) => o.broken)), notBroke: stats(obs.filter((o) => !o.broken)) };

const buckets = [[0, 25, 'Risk-off (0–24)'], [25, 42, 'Cautious (25–41)'], [42, 58, 'Neutral (42–57)'], [58, 75, 'Constructive (58–74)'], [75, 101, 'Risk-on (75–100)']];
const sentiment = buckets.map(([a, b, label]) => {
  const d = spyDays.filter((x) => x.score >= a && x.score < b);
  return { label, days: d.length, avgFwd: r1(mean(d.map((x) => x.fwd))), pctUp: r1(share(d, (x) => x.fwd > 0)) };
});
const spyAll = { days: spyDays.length, avgFwd: r1(mean(spyDays.map((x) => x.fwd))), pctUp: r1(share(spyDays, (x) => x.fwd > 0)) };

const out = {
  generated: new Date().toISOString().slice(0, 10), from: dates[startIdx], to: dates[N - 1 - HORIZON], horizon: HORIZON,
  symbols: Object.keys(UNIVERSE), observations: obs.length,
  baseline, byAction, byRule, support, example, breakdown, sentiment, spyAll,
};
fs.mkdirSync(new URL('data/', root), { recursive: true });
fs.writeFileSync(new URL('data/backtest.json', root), JSON.stringify(out, null, 1));

// ---------- latest real snapshot for no-key mode ----------
const last = N - 1;
const snap = { asOf: dates[last], etf: {}, stocks: {} };
for (const s of ETFS) snap.etf[s] = quoteAt(s, last);
for (const [sym, [industry, name]] of Object.entries(UNIVERSE)) {
  snap.stocks[sym] = { q: quoteAt(sym, last), m: metricAt(sym, last), p: { name, finnhubIndustry: industry }, r: null };
}
fs.writeFileSync(new URL('data/snapshot.json', root), JSON.stringify(snap));

console.log(JSON.stringify({ from: out.from, to: out.to, observations: out.observations, baseline, byAction, byRule, support, example, breakdown, sentiment, spyAll }, null, 1));
