// UI: routing, state, rendering.
(() => {
  const { pct, usd, num } = Engine;
  const LS = { list: 'sp_list_v2', oldHoldings: 'sp_holdings', widgets: 'sp_widgets_v2', period: 'sp_period' };
  const DEFAULT_LIST = ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'JPM', 'XOM'].map((t) => ({ t }));
  // The original build shipped this made-up portfolio; drop its share counts on upgrade.
  const OLD_SAMPLE = 'NVDA:40,AAPL:30,MSFT:12,AMZN:25,TSLA:10,JPM:20,XOM:30,KO:50';
  const DEFAULT_WIDGETS = ['portfolio', 'plans', 'movers', 'rundown', 'sectors', 'allocation'];
  const SUGGEST = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'COST', 'JPM', 'LLY', 'XOM'];

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cls = (v) => (num(v) ? (v > 0 ? 'up' : v < 0 ? 'down' : '') : '');
  const money0 = (v) => (num(v) ? (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—');
  const signedMoney = (v) => (num(v) ? (v > 0 ? '+' : v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—');
  const cleanTicker = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 10);
  const fmtDay = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const link = (sym) => `#/stock/${encodeURIComponent(sym)}`;
  const chip = (p) => `<span class="chip ${p.tone} a-${p.action}">${p.action}</span>`;

  function initialList() {
    const v2 = load(LS.list, null);
    if (Array.isArray(v2)) return v2;
    const old = load(LS.oldHoldings, null);
    if (Array.isArray(old) && old.length) {
      const sig = old.map((h) => `${h.t}:${h.shares}`).join(',');
      return sig === OLD_SAMPLE ? old.map((h) => ({ t: h.t })) : old.map((h) => ({ t: h.t, shares: h.shares, cost: h.cost }));
    }
    return DEFAULT_LIST;
  }

  const S = {
    list: initialList(),
    widgets: load(LS.widgets, DEFAULT_WIDGETS),
    period: load(LS.period, 'day'),
    customizing: false,
    market: null, raw: {}, track: null, loading: false, error: null, updated: null,
  };
  save(LS.list, S.list);
  const saveList = () => save(LS.list, S.list);
  const inList = (t) => S.list.find((x) => x.t === t) || null;

  // ---------- data ----------
  async function loadAll(force) {
    S.loading = true; S.error = null; render();
    try {
      const etf = {}, errs = [];
      const syms = [...Object.keys(Engine.INDICES), ...Object.keys(Engine.SECTORS)];
      await Promise.all(syms.map(async (s) => { try { etf[s] = await Data.quote(s, force); } catch (e) { errs.push(e.message); } }));
      if (!etf.SPY) throw new Error(errs[0] || 'Could not load market data.');
      S.market = Engine.marketSentiment(etf);
      const want = new Set(S.list.map((x) => x.t));
      const r = currentRoute();
      if (r[0] === 'stock' && r[1]) want.add(cleanTicker(decodeURIComponent(r[1])));
      await Promise.all([...want].map((t) => loadStock(t, force)));
      S.updated = new Date();
    } catch (e) { S.error = e.message; }
    S.loading = false; render();
  }

  async function loadStock(t, force) {
    try {
      const [q, m, p, r] = await Promise.all([Data.quote(t, force), Data.metric(t), Data.profile(t), Data.recs(t)]);
      if (!q || !q.c) throw new Error(`No price found for ${t}. Check the ticker symbol.`);
      S.raw[t] = { q, m: m || {}, p: p || {}, r };
    } catch (e) { S.raw[t] = { error: e.message }; }
  }

  async function loadTrack() {
    try { const r = await fetch('data/backtest.json'); if (r.ok) { S.track = await r.json(); render(); } } catch (e) { /* page still works */ }
  }

  function analyze(t) {
    const d = S.raw[t], item = inList(t);
    if (!d || !S.market) return { sym: t, item, pending: true };
    if (d.error) return { sym: t, item, error: d.error };
    const holding = item && item.cost ? { cost: item.cost, shares: item.shares } : null;
    const a = Engine.analyzeStock({ sym: t, q: d.q, m: d.m, p: d.p, r: d.r, holding, market: S.market });
    a.item = item;
    a.hasPos = !!(item && item.shares > 0);
    if (a.hasPos) { a.value = item.shares * a.q.c; a.dayChg = item.shares * a.q.d; }
    return a;
  }
  const analyses = () => S.list.map((x) => analyze(x.t));
  const ready = (L) => L.filter((a) => !a.error && !a.pending);

  function totals(L) {
    const pos = ready(L).filter((a) => a.hasPos);
    const value = pos.reduce((s, a) => s + a.value, 0);
    const day = pos.reduce((s, a) => s + a.dayChg, 0);
    const withCost = pos.filter((a) => a.item.cost);
    const cost = withCost.reduce((s, a) => s + a.item.shares * a.item.cost, 0);
    const costValue = withCost.reduce((s, a) => s + a.value, 0);
    const prev = value - day;
    const w = (f) => (value ? pos.reduce((s, a) => s + (num(f(a)) ? f(a) * a.value : 0), 0) / value : 0);
    return { pos, value, day, dayPct: prev ? (day / prev) * 100 : 0, cost, gain: costValue - cost, gainPct: cost ? (costValue / cost - 1) * 100 : null, beta: w((a) => a.beta), rel13: w((a) => a.rel13) };
  }

  // ---------- shared pieces ----------
  function tape() {
    const m = S.market, e = m.etf;
    const idx = (s, n) => `<div><span class="eyebrow">${n}</span><span class="val ${cls(e[s] && e[s].dp)}">${pct(e[s] && e[s].dp, 2)}</span><span class="small muted num">${usd(e[s] && e[s].c)}</span></div>`;
    return `<section class="tape" aria-label="Market today">
      <div><span class="eyebrow">Market mood</span>
        <div class="mood"><strong>${m.label}</strong><span class="num muted">${m.score}/100</span></div>
        <div class="meter" role="img" aria-label="Sentiment ${m.score} of 100"><i style="left:${m.score}%"></i></div>
        <span class="small muted">${m.up} of ${m.total} sectors up · <a href="#/market">Details</a></span></div>
      ${Object.entries(Engine.INDICES).map(([s, n]) => idx(s, n)).join('')}
    </section>`;
  }

  function emptyList() {
    return `<div class="empty"><h3>Your list is empty</h3><p>Look up any ticker with the search bar, or start with one of these:</p>
      <div class="suggest">${SUGGEST.map((t) => `<a href="${link(t)}">${t}</a>`).join('')}</div></div>`;
  }

  // ---------- overview widgets ----------
  const WIDGETS = {
    portfolio: {
      title: 'Your positions', render: (L, T) => {
        if (!T.pos.length) return `<div class="panel-body"><p class="muted">Portfolio totals appear once you enter shares for a stock. Shares are optional: open any stock and fill in <b>Your position</b>.</p></div>`;
        const diff = T.dayPct - S.market.spy;
        return `<div class="stats">
          <div><span class="eyebrow">Value</span><span class="big">${usd(T.value)}</span><span class="small muted">${T.pos.length} position${T.pos.length > 1 ? 's' : ''}</span></div>
          <div><span class="eyebrow">Today</span><span class="big ${cls(T.day)}">${signedMoney(T.day)}</span><span class="small ${cls(T.dayPct)}">${pct(T.dayPct, 2)}</span></div>
          <div><span class="eyebrow">Total gain</span><span class="big ${cls(T.gain)}">${T.cost ? signedMoney(T.gain) : '—'}</span><span class="small ${cls(T.gainPct)}">${T.cost ? pct(T.gainPct) + ' on cost' : 'Add a cost to see gains'}</span></div>
          <div><span class="eyebrow">vs S&amp;P 500 today</span><span class="big ${cls(diff)}">${pct(diff, 2)}</span><span class="small muted">You ${pct(T.dayPct, 2)} · S&amp;P ${pct(S.market.spy, 2)}</span></div>
        </div>`;
      },
    },
    plans: {
      title: 'Plan of attack', wide: true, render: (L) => {
        if (!L.length) return emptyList();
        return `<div class="rows">${L.map((a) => a.error
          ? `<div class="row"><span class="tk">${esc(a.sym)}</span><span></span><span class="desc down">${esc(a.error)}</span><span></span></div>`
          : a.pending ? `<div class="row"><span class="tk">${esc(a.sym)}</span><span></span><span class="desc muted">Loading…</span><span></span></div>`
            : `<a class="row" href="${link(a.sym)}"><span class="tk">${esc(a.sym)}</span>${chip(a.plan)}<span class="desc">${esc(a.plan.headline)}</span><span class="end num ${cls(a.q.dp)}">${pct(a.q.dp, 2)}</span></a>`).join('')}</div>`;
      },
    },
    movers: {
      title: 'Leaders and laggards', head: () => {
        const tabs = [['day', 'Today vs S&P'], ['3m', '3 months vs S&P'], ['cost', 'Since you bought']];
        return `<div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button class="tab ${S.period === k ? 'active' : ''}" data-period="${k}" role="tab" aria-selected="${S.period === k}">${n}</button>`).join('')}</div>`;
      },
      render: (L) => {
        const key = { day: (a) => a.dayRel, '3m': (a) => a.rel13, cost: (a) => a.gainPct }[S.period];
        const ok = ready(L).filter((a) => num(key(a))).sort((x, y) => key(y) - key(x));
        if (!ok.length) return `<div class="panel-body"><p class="muted">${S.period === 'cost' ? 'Enter a purchase price on a stock to compare it with what you paid.' : 'Add stocks to see who is leading.'}</p></div>`;
        const over = ok.filter((a) => key(a) >= 0).slice(0, 3), under = ok.filter((a) => key(a) < 0).reverse().slice(0, 3);
        const row = (a) => `<a class="mover" href="${link(a.sym)}"><div class="top"><b>${esc(a.sym)}</b><span class="${cls(key(a))}">${pct(key(a))}</span></div><p>${esc(Engine.explainPerf(a, S.period))}</p></a>`;
        return `<div class="movers"><div><h3>Ahead</h3>${over.map(row).join('') || '<p class="mover muted">None</p>'}</div>
          <div><h3>Behind</h3>${under.map(row).join('') || '<p class="mover muted">None</p>'}</div></div>`;
      },
    },
    rundown: { title: 'Market rundown', render: () => `<div class="panel-body"><ul class="lines">${S.market.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` },
    sectors: { title: 'Sectors today', render: () => `<div class="panel-body">${heat()}</div>` },
    allocation: {
      title: 'Allocation', render: (L, T) => {
        if (!T.value) return `<div class="panel-body"><p class="muted">Enter shares on a stock to see how your money is split.</p></div>`;
        const items = T.pos.slice().sort((a, b) => b.value - a.value);
        const max = items[0].value;
        return `<div class="panel-body">${items.map((a) => `<div class="wbar" title="${esc(a.sym)}: ${money0(a.value)}"><span class="mono">${esc(a.sym)}</span>
          <div class="track"><div class="fill" style="width:${(a.value / max) * 100}%"></div></div><span class="num" style="text-align:right">${((a.value / T.value) * 100).toFixed(1)}%</span></div>`).join('')}</div>`;
      },
    },
    risk: {
      title: 'Risk check', render: (L, T) => {
        const ok = ready(L);
        const nearSup = ok.filter((a) => num(a.supDist) && a.supDist <= 4).length;
        const top = T.pos.slice().sort((a, b) => b.value - a.value)[0];
        return `<div class="panel-body">
          <div class="kv"><span>Weighted beta</span><b>${T.value ? T.beta.toFixed(2) : '—'}</b></div>
          <div class="kv"><span>If the S&amp;P 500 falls 1%</span><b class="down">${T.value ? signedMoney((-T.value * T.beta) / 100) : '—'}</b></div>
          <div class="kv"><span>Largest position</span><b>${top ? `${esc(top.sym)} ${((top.value / T.value) * 100).toFixed(0)}%` : '—'}</b></div>
          <div class="kv"><span>Near major support</span><b>${nearSup} of ${ok.length}</b></div></div>`;
      },
    },
  };

  function heat() {
    return `<div class="heat">${Object.entries(Engine.SECTORS).map(([s, n]) => {
      const v = S.market.etf[s] ? S.market.etf[s].dp : null;
      const a = num(v) ? Math.min(Math.abs(v) / 2.5, 1) : 0;
      const bg = num(v) ? `color-mix(in srgb, var(${v >= 0 ? '--up' : '--down'}) ${Math.round(8 + a * 40)}%, var(--surface))` : 'var(--paper)';
      return `<div style="background:${bg}" title="${n} (${s})"><b>${n}</b><span>${pct(v)}</span></div>`;
    }).join('')}</div>`;
  }

  // ---------- pages ----------
  function pageOverview() {
    const L = analyses(), T = totals(L);
    const order = [...S.widgets, ...Object.keys(WIDGETS).filter((k) => !S.widgets.includes(k))];
    const custom = S.customizing ? `<section class="panel"><div class="panel-head"><h2>Choose what's on your overview</h2><button class="btn" data-reset-widgets>Reset</button></div>
      <div class="panel-body cust">${order.map((k) => {
        const on = S.widgets.includes(k);
        return `<div class="cust-row"><label><input type="checkbox" data-toggle="${k}" ${on ? 'checked' : ''}> ${WIDGETS[k].title}</label>
          ${on ? `<span><button class="btn quiet" data-move="${k}" data-dir="-1" aria-label="Move ${WIDGETS[k].title} up">↑</button><button class="btn quiet" data-move="${k}" data-dir="1" aria-label="Move ${WIDGETS[k].title} down">↓</button></span>` : ''}</div>`;
      }).join('')}</div></section>` : '';
    const ws = S.widgets.filter((k) => WIDGETS[k]);
    const blocks = [];
    for (let i = 0; i < ws.length; i++) {
      const panel = (k) => `<section class="panel"><div class="panel-head"><h2>${WIDGETS[k].title}</h2>${WIDGETS[k].head ? WIDGETS[k].head() : ''}</div>${WIDGETS[k].render(L, T)}</section>`;
      const k = ws[i], nxt = ws[i + 1];
      // Full-width panels stand alone; the rest pair up two per row.
      if (WIDGETS[k].wide || k === 'portfolio' || !nxt || WIDGETS[nxt].wide || nxt === 'portfolio') blocks.push(panel(k));
      else { blocks.push(`<div class="grid2">${panel(k)}${panel(nxt)}</div>`); i++; }
    }
    return `<div class="page-head"><div><h1>Overview</h1><p>${S.list.length ? `Tracking ${S.list.length} stock${S.list.length > 1 ? 's' : ''}. Click any one for the full read.` : 'Search any ticker to get started.'}</p></div>
        <button class="btn" data-customize>${S.customizing ? 'Done' : 'Customize'}</button></div>
      ${tape()}${custom}${blocks.join('')}`;
  }

  function pageStocks() {
    const L = analyses();
    const rows = L.map((a) => a.error
      ? `<tr><td class="mono">${esc(a.sym)}</td><td colspan="6" class="down">${esc(a.error)}</td><td class="r"><button class="btn quiet" data-remove="${esc(a.sym)}" aria-label="Remove ${esc(a.sym)}">Remove</button></td></tr>`
      : a.pending ? `<tr><td class="mono">${esc(a.sym)}</td><td colspan="7" class="muted">Loading…</td></tr>`
        : `<tr class="click" data-go="${esc(a.sym)}">
          <td><span class="mono">${esc(a.sym)}</span><div class="small muted">${esc(a.p.name || '')}</div></td>
          <td class="r num">${usd(a.q.c)}</td>
          <td class="r num ${cls(a.q.dp)}">${pct(a.q.dp, 2)}</td>
          <td class="r num ${cls(a.dayRel)}">${pct(a.dayRel, 2)}</td>
          <td>${chip(a.plan)}</td>
          <td class="r num">${a.hasPos ? a.item.shares : '<span class="muted">—</span>'}</td>
          <td class="r num">${a.hasPos ? money0(a.value) : '<span class="muted">—</span>'}</td>
          <td class="r"><button class="btn quiet" data-remove="${esc(a.sym)}" aria-label="Remove ${esc(a.sym)}">Remove</button></td></tr>`).join('');
    return `<div class="page-head"><div><h1>My stocks</h1><p>Add a ticker to follow it. Shares are optional. Add them on the stock's page if you own it.</p></div>
        <form class="add-inline" id="add-form"><label for="add-t" class="sr-only">Ticker</label><input class="field" id="add-t" name="t" placeholder="Ticker" required maxlength="10" autocomplete="off"><button class="btn primary" type="submit">Add</button></form></div>
      <section class="panel">${L.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Stock</th><th class="r">Price</th><th class="r">Today</th><th class="r">vs S&amp;P</th><th>Plan</th><th class="r">Shares</th><th class="r">Value</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : emptyList()}</section>`;
  }

  function pageMarket() {
    const m = S.market;
    return `<div class="page-head"><div><h1>Market today</h1><p>How the overall market is trading, and what that means for individual stocks.</p></div></div>
      ${tape()}
      <div class="grid2">
        <section class="panel"><div class="panel-head"><h2>Rundown</h2></div><div class="panel-body"><ul class="lines">${m.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div></section>
        <section class="panel"><div class="panel-head"><h2>Sectors</h2></div><div class="panel-body">${heat()}</div></section>
      </div>
      <section class="panel"><div class="panel-head"><h2>How the mood score works</h2></div><div class="panel-body prose">
        <p>It starts at 50 and moves with four readings: how far the S&amp;P 500 moved, how many of the 11 sectors are up, whether defensive sectors (utilities, staples, health care) are beating growth sectors (tech, consumer, communications), and whether small companies are keeping up with large ones.</p>
        <p>Below 42 reads as cautious or risk-off. Above 58 reads as constructive or risk-on. The score describes today; the <a href="#/accuracy">track record</a> shows it does not predict next month.</p></div></section>`;
  }

  function pageStock(sym) {
    if (!S.raw[sym]) { loadStock(sym).then(render); return `<div class="notice">Loading ${esc(sym)}…</div>`; }
    const a = analyze(sym);
    const listBtn = a.item ? `<button class="btn" data-remove="${esc(sym)}">Remove from my stocks</button>` : `<button class="btn primary" data-add="${esc(sym)}">Add to my stocks</button>`;
    if (a.error) return `<div class="page-head"><div><span class="ticker">${esc(sym)}</span></div></div><div class="notice bad">${esc(a.error)}</div>`;
    if (a.pending) return `<div class="notice">Loading ${esc(sym)}…</div>`;
    const P = a.plan;
    const dist = (p) => (num(p) ? pct((p / a.q.c - 1) * 100) : '');
    const ladder = [...a.lv.resist.slice(0, 4).reverse().map((x) => ({ ...x, side: 'res' })), { p: a.q.c, label: 'Current price', side: 'now' }, ...a.lv.supports.slice(0, 5).map((x) => ({ ...x, side: 'sup' }))];
    setTimeout(() => loadNews(sym), 0);
    return `<div class="stock-head">
        <div><span class="ticker">${esc(sym)}</span><p class="company">${esc(a.p.name || '')}${a.secSym !== 'SPY' ? ` · ${Engine.SECTORS[a.secSym]}` : ''}</p></div>
        <div style="display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap">
          <div class="price">${usd(a.q.c)}<small class="${cls(a.q.dp)}">${num(a.q.d) ? (a.q.d > 0 ? '+' : '') + a.q.d.toFixed(2) : ''} (${pct(a.q.dp, 2)}) today</small></div>
          ${listBtn}</div></div>

      <section class="verdict" aria-label="Plan of attack">
        <div class="verdict-call"><span class="eyebrow">Plan of attack</span><span class="word ${P.tone}">${P.action}</span></div>
        <div class="verdict-main"><h2>${esc(P.headline)}</h2>
          <div class="grid2"><div><span class="eyebrow">Why</span><ul class="lines" style="margin-top:6px">${P.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
          <div><span class="eyebrow">What to do</span><ol class="lines" style="margin-top:6px">${P.steps.map((w) => `<li>${esc(w)}</li>`).join('')}</ol></div></div></div>
        <div class="levels" style="grid-column:1/-1">
          <div><span class="eyebrow">Buy zone</span><b>${P.addZone}</b></div>
          <div><span class="eyebrow">Stop</span><b class="down">${usd(P.stop)}</b><span class="small muted">${dist(P.stop)} from here</span></div>
          <div><span class="eyebrow">Target</span><b class="up">${usd(P.target)}</b><span class="small muted">${dist(P.target)} from here</span></div></div>
        <p class="record" style="grid-column:1/-1">${trackLine(P.rule)} <a href="#/accuracy">See the track record</a></p>
      </section>

      <section class="panel"><div class="panel-head"><h2>Your position</h2><span class="small muted">Optional. Saved in this browser only.</span></div>
        <div class="panel-body"><form class="pos-form" id="pos-form" data-sym="${esc(sym)}">
          <label for="pos-shares">Shares<input class="field num" id="pos-shares" name="shares" type="number" step="any" min="0" value="${a.item && a.item.shares ? a.item.shares : ''}" placeholder="e.g. 10"></label>
          <label for="pos-cost">Avg price paid<input class="field num" id="pos-cost" name="cost" type="number" step="any" min="0" value="${a.item && a.item.cost ? a.item.cost : ''}" placeholder="e.g. ${a.q.c.toFixed(2)}"></label>
          <button class="btn primary" type="submit">Save position</button>
          ${a.hasPos ? `<p class="small" style="align-self:center">${a.item.shares} shares worth <b>${money0(a.value)}</b>${num(a.gainPct) ? `, <span class="${cls(a.gainPct)}">${pct(a.gainPct)}</span> vs what you paid` : ''}. Today: <span class="${cls(a.dayChg)}">${signedMoney(a.dayChg)}</span></p>` : ''}
        </form></div></section>

      <div class="grid2">
        <section class="panel"><div class="panel-head"><h2>What's moving ${esc(sym)}</h2><span class="small">Market sensitivity: <b>${a.sensitivity}</b></span></div>
          <dl class="panel-body" style="margin:0">${a.conditions.map((c) => `<div class="cond"><dt>${esc(c.k)}</dt><dd>${esc(c.v)}</dd></div>`).join('')}</dl></section>
        <section class="panel"><div class="panel-head"><h2>Support and resistance</h2></div>
          <div class="panel-body"><div class="ladder">${ladder.map((x) => `<div class="lvl ${x.side} ${x.kind || ''}"><i></i><span>${esc(x.label)}</span><b>${usd(x.p)}</b><em>${x.side === 'now' ? '' : dist(x.p)}</em></div>`).join('')}</div>
          <p class="small muted" style="margin-top:10px">Pivots come from today's high, low and close. Retracements divide the 52-week range. The plan uses the retracements and 52-week high and low.</p></div></section>
      </div>
      <div class="grid2">
        <section class="panel"><div class="panel-head"><h2>Fundamentals</h2><span class="chip ${a.f.score >= 60 ? 'good' : a.f.score >= 42 ? 'neutral' : 'bad'}">${a.f.label} · ${a.f.score}/100</span></div>
          <div class="panel-body">
          <div class="kv"><span>EPS growth, year over year</span><b class="${cls(a.f.eps)}">${pct(a.f.eps)}</b></div>
          <div class="kv"><span>Revenue growth, year over year</span><b class="${cls(a.f.rev)}">${pct(a.f.rev)}</b></div>
          <div class="kv"><span>P/E ratio</span><b>${num(a.m.peTTM) ? a.m.peTTM.toFixed(1) : '—'}</b></div>
          <div class="kv"><span>Beta</span><b>${a.beta.toFixed(2)}</b></div>
          <div class="kv"><span>Analysts rating Buy / Sell</span><b>${a.f.analyst ? `${a.f.analyst.buyPct}% / ${a.f.analyst.sellPct}%` : '—'}</b></div>
          <div class="kv"><span>52-week range</span><b>${usd(a.m['52WeekLow'])} – ${usd(a.m['52WeekHigh'])}</b></div>
          ${Data.isLive() ? '' : '<p class="small muted" style="margin-top:8px">Earnings, revenue and analyst data need live mode. Add your free key in <a href="#/settings">Settings</a>.</p>'}</div></section>
        <section class="panel"><div class="panel-head"><h2>Headlines this week</h2></div><div class="panel-body news" id="news"><p class="muted small">${Data.isLive() ? 'Loading…' : 'Headlines need live mode. Add your free key in <a href="#/settings">Settings</a>.'}</p></div></section>
      </div>`;
  }

  function trackLine(rule) {
    const t = S.track;
    if (!t) return '';
    const s = t.byRule[rule];
    if (!s) return 'This setup depends on earnings data, which the 5-year test could not include, so it has no track record yet.';
    return `In the 5-year test this setup came up ${s.n.toLocaleString()} times. The stock was higher a month later ${s.pctUp}% of the time (average ${pct(s.avgFwd)}), compared with ${t.baseline.pctUp}% for every stock-day.`;
  }

  async function loadNews(sym) {
    if (!Data.isLive()) return;
    const el = document.getElementById('news');
    if (!el) return;
    try {
      const items = await Data.news(sym);
      if (!el.isConnected) return;
      el.innerHTML = items && items.length ? items.map((n) => {
        const url = /^https?:\/\//.test(n.url || '') ? n.url : '#';
        const date = n.datetime ? new Date(n.datetime * 1000).toLocaleDateString() : '';
        return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><b>${esc(n.headline)}</b><span class="small muted">${esc(n.source)} · ${date}</span></a>`;
      }).join('') : '<p class="muted small">No headlines in the last 7 days.</p>';
    } catch (e) { if (el.isConnected) el.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
  }

  // ---------- track record ----------
  function dumbbell(entries) {
    const lo = 40, hi = 65, W = 640, left = 170, right = 70, rowH = 34, top = 26;
    const H = top + entries.length * rowH + 8;
    const x = (v) => left + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (W - left - right);
    const ticks = [40, 45, 50, 55, 60, 65];
    const grid = ticks.map((t) => `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H - 8}"/><text class="tick" x="${x(t)}" y="${top - 12}" text-anchor="middle">${t}%</text>`).join('');
    const rows = entries.map(([label, s], i) => {
      const y = top + i * rowH + rowH / 2;
      return `<g><title>${label}: held ${s.held}% vs ${s.chance}% by chance (${s.n.toLocaleString()} cases)</title>
        <text x="0" y="${y + 4}">${label}</text>
        <line x1="${x(s.chance)}" x2="${x(s.held)}" y1="${y}" y2="${y}" stroke="var(--line-strong)" stroke-width="2"/>
        <circle cx="${x(s.chance)}" cy="${y}" r="5" fill="var(--muted)" stroke="var(--surface)" stroke-width="2"/>
        <circle cx="${x(s.held)}" cy="${y}" r="6" fill="var(--bar)" stroke="var(--surface)" stroke-width="2"/>
        <text x="${W - right + 12}" y="${y + 4}" style="fill:var(--ink)">${s.edge > 0 ? '+' : ''}${s.edge} pts</text>
        <rect x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"/></g>`;
    }).join('');
    return `<svg class="dumbbell" viewBox="0 0 ${W} ${H}" role="img" aria-label="How often each support level held, compared with chance">${grid}${rows}</svg>`;
  }

  function pageAccuracy() {
    const t = S.track;
    if (!t) return '<div class="notice">Loading the backtest…</div>';
    const b = t.baseline, A = t.byAction;
    const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const levelOrder = ['23.6% retracement', '38.2% retracement', '50% retracement', '61.8% retracement', '52-week low'];
    const levels = levelOrder.filter((k) => t.support.byLevel[k]).map((k) => [k, t.support.byLevel[k]]);
    const best = levels.slice().sort((p, q) => q[1].edge - p[1].edge);
    const noEdge = levels.filter(([, s]) => s.edge < 1).map(([k]) => k.replace(' retracement', ''));
    const low = t.sentiment[0], high = t.sentiment[t.sentiment.length - 1];
    const actRow = (k, note) => (A[k] ? `<tr><td>${chip({ action: k, tone: { HOLD: 'neutral', TRIM: 'warn', WATCH: 'warn', ADD: 'good', REDUCE: 'bad' }[k] })}</td><td class="r num">${A[k].n.toLocaleString()}</td><td class="r num ${cls(A[k].avgFwd)}">${pct(A[k].avgFwd)}</td><td class="r num">${A[k].pctUp}%</td><td class="r num">${A[k].pctBeatSpy}%</td><td class="r num">${A[k].stopHit}%</td><td class="small muted" style="white-space:normal">${note}</td></tr>` : '');

    return `<div class="page-head"><div><h1>Track record</h1>
      <p>We ran the site's own analysis code on every trading day from ${fmtDate(t.from)} to ${fmtDate(t.to)} for ${t.symbols.length} large US stocks, using only information available on each day, then checked what each stock did over the next ${t.horizon} trading days (about one month). That is ${t.observations.toLocaleString()} stock-days.</p></div></div>

      <section class="verdict-box"><h2>The short answer</h2>
        <p>The signals are only slightly better than a coin flip. Use StockPilot to organize what is happening, not as a prediction.</p>
        <p>Across all ${t.observations.toLocaleString()} stock-days, a stock was higher a month later ${b.pctUp}% of the time. Days where StockPilot said HOLD came in at ${A.HOLD ? A.HOLD.pctUp : '—'}%, and TRIM days at ${A.TRIM ? A.TRIM.pctUp : '—'}%. The direction is right, but the gap is small.</p>
      </section>

      <section class="panel"><div class="panel-head"><h2>Do support levels hold?</h2>
        <div class="legend"><span><i style="background:var(--bar)"></i>Held in the test</span><span><i style="background:var(--muted)"></i>Expected by chance</span></div></div>
        <div class="panel-body"><p class="small muted" style="margin-bottom:12px;max-width:70ch">When a stock was within 4% above a support level, how often did it avoid closing more than 2% below that level over the next month? "By chance" is how often any stock avoids a drop of the same size, regardless of levels.</p>
        <div class="table-wrap">${dumbbell(levels)}</div>
        <p style="margin-top:12px;max-width:70ch">Overall, support held ${t.support.all.held}% of the time against ${t.support.all.chance}% by chance. ${esc(best[0][0])} was the most reliable (+${best[0][1].edge} pts)${noEdge.length ? `; the ${noEdge.join(' and ')} levels did no better than chance` : ''}.</p></div></section>

      <section class="panel"><div class="panel-head"><h2>Results by plan</h2><span class="small muted">Next ${t.horizon} trading days</span></div>
        <div class="table-wrap"><table><thead><tr><th>Plan</th><th class="r">Times given</th><th class="r">Avg return</th><th class="r">Went up</th><th class="r">Beat S&amp;P</th><th class="r">Stop hit</th><th>What it means</th></tr></thead>
        <tbody>
          <tr><td class="muted">Every stock-day</td><td class="r num">${b.n.toLocaleString()}</td><td class="r num ${cls(b.avgFwd)}">${pct(b.avgFwd)}</td><td class="r num">${b.pctUp}%</td><td class="r num">${b.pctBeatSpy}%</td><td class="r num">${b.stopHit}%</td><td class="small muted" style="white-space:normal">The baseline to beat.</td></tr>
          ${actRow('HOLD', 'Slightly better than baseline.')}
          ${actRow('TRIM', 'Slightly worse than baseline, which is what a trim call should show.')}
          ${actRow('WATCH', 'Fresh breakdowns lagged a little, as expected.')}
        </tbody></table></div></section>

      <div class="grid2">
        <section class="panel"><div class="panel-head"><h2>Does the mood score predict the market?</h2></div>
          <div class="table-wrap"><table><thead><tr><th>Mood</th><th class="r">Days</th><th class="r">S&amp;P next month</th><th class="r">Went up</th></tr></thead>
          <tbody>${t.sentiment.map((s) => `<tr><td>${esc(s.label)}</td><td class="r num">${s.days}</td><td class="r num ${cls(s.avgFwd)}">${pct(s.avgFwd)}</td><td class="r num">${s.pctUp}%</td></tr>`).join('')}</tbody></table></div>
          <div class="panel-body"><p class="small">No. The S&amp;P rose about ${t.spyAll.pctUp}% of months whatever the mood. Risk-off days were followed by ${pct(low.avgFwd)} on average versus ${pct(high.avgFwd)} after risk-on days, so selling on fear would not have helped.</p></div></section>

        <section class="panel"><div class="panel-head"><h2>Your hold-at-support example</h2></div>
          <div class="panel-body prose" style="color:var(--ink)">
            <p class="small" style="color:var(--ink-2)">Stock near support on a weak market day. "Strong" here means beating the S&amp;P by 5+ points over 6 months, standing in for strong earnings.</p>
            <div class="kv"><span>Strong stocks, a month later</span><b>${t.example.strong.pctUp}% up · ${pct(t.example.strong.avgFwd)}</b></div>
            <div class="kv"><span>Weak stocks, a month later</span><b>${t.example.weak.pctUp}% up · ${pct(t.example.weak.avgFwd)}</b></div>
            <div class="kv"><span>All stocks in that setup</span><b>${t.example.all.pctUp}% up · ${pct(t.example.all.avgFwd)}</b></div>
            <p class="small" style="color:var(--ink-2)">Holding through these dips was reasonable: these stocks rose more often than not. But price strength alone did not separate winners from losers, so the earnings check matters.</p></div></section>
      </div>

      <section class="panel"><div class="panel-head"><h2>What this test can't tell you</h2></div><div class="panel-body prose">
        <p>Earnings growth, revenue growth and analyst ratings were left out because free historical versions aren't available, so the rules built on a "strong" or "weak" company were not tested directly.</p>
        <p>The 40 stocks are large companies that exist today, which flatters results (companies that collapsed are missing). Overlapping one-month windows make results less independent than the raw count suggests. Trading costs and taxes are ignored.</p>
        <p>Prices come from Yahoo Finance daily history. The test code is in the <a href="https://github.com/colehmattingly-coder/stockpilot/tree/main/backtest" target="_blank" rel="noopener">backtest folder</a> on GitHub and can be re-run.</p></div></section>`;
  }

  function pageSettings() {
    return `<div class="page-head"><div><h1>Settings</h1></div></div>
      <section class="panel"><div class="panel-head"><h2>Live data</h2><span class="small">${Data.isLive() ? '<span class="dot live"></span>Live' : '<span class="dot snap"></span>Snapshot'}</span></div>
        <div class="panel-body prose" style="color:var(--ink)">
        <p>Without a key, StockPilot shows real prices for ${Data.snapshotSymbols().length || 40} large stocks as of the last snapshot${Data.snapshotDate() ? ` (${fmtDay(Data.snapshotDate())} close)` : ''}. A free <a href="https://finnhub.io/register" target="_blank" rel="noopener">Finnhub</a> key adds up-to-the-minute prices for any ticker, plus earnings, analyst ratings and headlines.</p>
        <p class="small muted">The key stays in this browser. It is never sent anywhere except Finnhub.</p>
        <form id="key-form" class="pos-form"><label for="key">Finnhub API key<input class="field" id="key" name="key" type="password" value="${esc(Data.getKey())}" autocomplete="off" style="width:280px"></label>
          <button class="btn primary" type="submit">Save key</button>${Data.isLive() ? '<button class="btn" type="button" data-clear-key>Remove key</button>' : ''}</form></div></section>
      <section class="panel"><div class="panel-head"><h2>My stocks</h2></div><div class="panel-body pos-form">
        <button class="btn" data-reset-list>Reset to starter list</button><button class="btn" data-clear-list>Remove all stocks</button></div></section>`;
  }

  // ---------- render ----------
  const currentRoute = () => (location.hash.replace(/^#\/?/, '') || 'overview').split('/');

  function status() {
    const live = Data.isLive();
    const when = S.updated ? `Updated ${S.updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
    document.getElementById('status').innerHTML = `<div class="status-inner">
      <span>${live ? '<span class="dot live"></span>Live prices from Finnhub' : `<span class="dot snap"></span>Closing prices from ${fmtDay(Data.snapshotDate()) || 'the last snapshot'}. <a href="#/settings">Add a free key</a> for live data on any ticker.`}</span>
      <span class="muted">${when}</span>${live ? '<button class="linkbtn" id="refresh">Refresh</button>' : ''}</div>${S.loading ? '<div class="loading-line"></div>' : ''}`;
  }

  function render() {
    const route = currentRoute();
    const key = route[0] === 'stock' ? 'stocks' : route[0];
    document.querySelectorAll('nav a').forEach((a) => { const on = a.dataset.route === key; a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
    status();
    const app = document.getElementById('app');
    if (route[0] === 'settings') { app.innerHTML = pageSettings(); return; }
    if (route[0] === 'accuracy') { app.innerHTML = pageAccuracy(); return; }
    if (S.error) { app.innerHTML = `<div class="notice bad">${esc(S.error)}</div>`; return; }
    if (!S.market) { app.innerHTML = '<div class="notice">Loading market data…</div>'; return; }
    if (route[0] === 'stocks') app.innerHTML = pageStocks();
    else if (route[0] === 'market') app.innerHTML = pageMarket();
    else if (route[0] === 'stock') app.innerHTML = pageStock(cleanTicker(decodeURIComponent(route[1] || '')));
    else app.innerHTML = pageOverview();
  }

  // ---------- events ----------
  function addTicker(t) {
    t = cleanTicker(t);
    if (!t || inList(t)) return;
    S.list.push({ t }); saveList();
    if (!S.raw[t]) loadStock(t).then(render);
  }

  document.addEventListener('click', (e) => {
    if (e.target.id === 'refresh') { loadAll(true); return; }
    const t = e.target.closest('button, tr[data-go]');
    if (!t) return;
    const d = t.dataset;
    if (d.go && !e.target.closest('button')) { location.hash = link(d.go); return; }
    if (d.period) { S.period = d.period; save(LS.period, S.period); render(); }
    else if ('customize' in d) { S.customizing = !S.customizing; render(); }
    else if (d.move) {
      const i = S.widgets.indexOf(d.move), j = i + Number(d.dir);
      if (j >= 0 && j < S.widgets.length) { [S.widgets[i], S.widgets[j]] = [S.widgets[j], S.widgets[i]]; save(LS.widgets, S.widgets); render(); }
    } else if ('resetWidgets' in d) { S.widgets = DEFAULT_WIDGETS.slice(); save(LS.widgets, S.widgets); render(); }
    else if (d.add) { addTicker(d.add); render(); }
    else if (d.remove) { S.list = S.list.filter((h) => h.t !== d.remove); saveList(); render(); }
    else if ('clearKey' in d) { Data.setKey(''); S.raw = {}; S.market = null; loadAll(); }
    else if ('resetList' in d) { S.list = DEFAULT_LIST.map((x) => ({ ...x })); saveList(); loadAll(); location.hash = '#/stocks'; }
    else if ('clearList' in d) { S.list = []; saveList(); location.hash = '#/stocks'; render(); }
  });

  document.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.toggle;
    if (!k) return;
    S.widgets = e.target.checked ? [...S.widgets, k] : S.widgets.filter((w) => w !== k);
    save(LS.widgets, S.widgets); render();
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (e.target.id === 'search') {
      const t = cleanTicker(f.get('q'));
      if (!t) return;
      e.target.reset();
      location.hash = link(t);
    } else if (e.target.id === 'add-form') {
      addTicker(f.get('t')); e.target.reset(); render();
    } else if (e.target.id === 'pos-form') {
      const sym = e.target.dataset.sym;
      const shares = parseFloat(f.get('shares')), cost = parseFloat(f.get('cost'));
      let item = inList(sym);
      if (!item) { item = { t: sym }; S.list.push(item); }
      item.shares = shares > 0 ? shares : undefined;
      item.cost = cost > 0 ? cost : undefined;
      saveList(); render();
    } else if (e.target.id === 'key-form') {
      Data.setKey(String(f.get('key') || ''));
      S.raw = {}; S.market = null; location.hash = '#/overview'; loadAll();
    }
  });

  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  render();
  loadAll();
  loadTrack();
})();
