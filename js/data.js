// Data layer: Finnhub (free tier) when a key is set, bundled demo data otherwise.
// Responses are cached in localStorage so reloads don't burn the 60 calls/min limit.
const Data = (() => {
  const BASE = 'https://finnhub.io/api/v1';
  const KEY_LS = 'sp_finnhub_key';
  const MIN = 60 * 1000, HOUR = 60 * MIN;

  const getKey = () => localStorage.getItem(KEY_LS) || '';
  const isLive = () => !!getKey();
  function setKey(k) {
    k = (k || '').trim();
    k ? localStorage.setItem(KEY_LS, k) : localStorage.removeItem(KEY_LS);
    clearCache();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const calls = [];
  async function throttle() {
    for (;;) {
      const now = Date.now();
      while (calls.length && now - calls[0] > MIN) calls.shift();
      if (calls.length < 55) { calls.push(now); return; }
      await sleep(MIN - (now - calls[0]) + 100);
    }
  }

  function cacheGet(k, ttl) {
    try {
      const v = JSON.parse(localStorage.getItem('sp_c_' + k));
      if (v && Date.now() - v.t < ttl) return v.d;
    } catch (e) { /* ignore */ }
    return null;
  }
  function cacheSet(k, d) {
    try { localStorage.setItem('sp_c_' + k, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* quota */ }
  }
  function clearCache() {
    Object.keys(localStorage).filter((k) => k.startsWith('sp_c_')).forEach((k) => localStorage.removeItem(k));
  }

  async function get(path, params, ttl, force) {
    const ck = path + '?' + new URLSearchParams(params);
    if (!force) { const hit = cacheGet(ck, ttl); if (hit) return hit; }
    const url = `${BASE}${path}?${new URLSearchParams({ ...params, token: getKey() })}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      await throttle();
      const r = await fetch(url);
      if (r.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      if (r.status === 401 || r.status === 403) throw new Error('Finnhub rejected the request — check your API key in Settings.');
      if (!r.ok) throw new Error(`Finnhub error ${r.status}`);
      const d = await r.json();
      cacheSet(ck, d);
      return d;
    }
    throw new Error('Rate limited by Finnhub — wait a minute, then refresh.');
  }

  function demoStock(sym) {
    const s = DEMO.stocks[sym];
    if (!s) throw new Error(`${sym} isn't in the demo data. Add a free Finnhub key in Settings to track any ticker.`);
    return s;
  }

  const ymd = (d) => d.toISOString().slice(0, 10);

  return {
    isLive, getKey, setKey, clearCache,
    async quote(sym, force) {
      if (!isLive()) return DEMO.etf[sym] || demoStock(sym).q;
      return get('/quote', { symbol: sym }, 2 * MIN, force);
    },
    async metric(sym) {
      if (!isLive()) return demoStock(sym).m;
      const d = await get('/stock/metric', { symbol: sym, metric: 'all' }, 12 * HOUR);
      return d.metric || {};
    },
    async profile(sym) {
      if (!isLive()) return demoStock(sym).p;
      return get('/stock/profile2', { symbol: sym }, 7 * 24 * HOUR);
    },
    async recs(sym) {
      if (!isLive()) return demoStock(sym).r;
      const d = await get('/stock/recommendation', { symbol: sym }, 12 * HOUR);
      return Array.isArray(d) ? d[0] || null : null;
    },
    async news(sym) {
      if (!isLive()) return null;
      const to = new Date(), from = new Date(Date.now() - 7 * 24 * HOUR);
      const d = await get('/company-news', { symbol: sym, from: ymd(from), to: ymd(to) }, 30 * MIN);
      return Array.isArray(d) ? d.slice(0, 6) : [];
    },
  };
})();
