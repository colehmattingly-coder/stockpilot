// UI: routing, state, rendering.
(() => {
  const { pct, usd, num } = Engine;
  const LS = { holdings: 'sp_holdings', widgets: 'sp_widgets', period: 'sp_period' };
  const DEFAULT_HOLDINGS = [
    { t: 'NVDA', shares: 40, cost: 118 }, { t: 'AAPL', shares: 30, cost: 192 },
    { t: 'MSFT', shares: 12, cost: 410 }, { t: 'AMZN', shares: 25, cost: 178 },
    { t: 'TSLA', shares: 10, cost: 265 }, { t: 'JPM', shares: 20, cost: 205 },
    { t: 'XOM', shares: 30, cost: 108 }, { t: 'KO', shares: 50, cost: 62 },
  ];
  const DEFAULT_WIDGETS = ['value', 'day', 'gain', 'vsMarket', 'sentiment', 'movers', 'plans', 'rundown', 'allocation', 'sectors'];

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cls = (v) => (num(v) ? (v > 0 ? 'up' : v < 0 ? 'down' : '') : '');
  const money0 = (v) => (num(v) ? (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—');
  const signedMoney = (v) => (num(v) ? (v > 0 ? '+' : v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—');

  const S = {
    holdings: load(LS.holdings, DEFAULT_HOLDINGS),
    widgets: load(LS.widgets, DEFAULT_WIDGETS),
    period: load(LS.period, 'day'),
    customizing: false,
    market: null, raw: {}, loading: false, error: null, updated: null,
  };

  // ---------- data ----------
  async function loadAll(force) {
    S.loading = true; S.error = null; render();
    try {
      const etf = {}, errs = [];
      const syms = [...Object.keys(Engine.INDICES), ...Object.keys(Engine.SECTORS)];
      await Promise.all(syms.map(async (s) => { try { etf[s] = await Data.quote(s, force); } catch (e) { errs.push(e.message); } }));
      if (!etf.SPY) throw new Error(errs[0] || 'Could not load market data.');
      S.market = Engine.marketSentiment(etf);
      await Promise.all(S.holdings.map((h) => loadStock(h.t, force)));
      S.updated = new Date();
    } catch (e) { S.error = e.message; }
    S.loading = false; render();
  }

  async function loadStock(t, force) {
    try {
      const [q, m, p, r] = await Promise.all([Data.quote(t, force), Data.metric(t), Data.profile(t), Data.recs(t)]);
      if (!q || !q.c) throw new Error(`No price found for ${t} — check the ticker.`);
      S.raw[t] = { q, m: m || {}, p: p || {}, r };
    } catch (e) { S.raw[t] = { error: e.message }; }
  }

  function analyses() {
    if (!S.market) return [];
    return S.holdings.map((h) => {
      const d = S.raw[h.t];
      if (!d || d.error) return { sym: h.t, holding: h, error: d ? d.error : 'Loading…' };
      const a = Engine.analyzeStock({ sym: h.t, ...d, holding: h, market: S.market });
      a.value = h.shares * a.q.c; a.dayChg = h.shares * a.q.d; a.costBasis = h.shares * h.cost;
      return a;
    });
  }

  function totals(list) {
    const ok = list.filter((a) => !a.error);
    const value = ok.reduce((s, a) => s + a.value, 0);
    const cost = ok.reduce((s, a) => s + a.costBasis, 0);
    const day = ok.reduce((s, a) => s + a.dayChg, 0);
    const prev = value - day;
    const w = (f) => (value ? ok.reduce((s, a) => s + (num(f(a)) ? f(a) * a.value : 0), 0) / value : 0);
    return { ok, value, cost, day, dayPct: prev ? (day / prev) * 100 : 0, gain: value - cost, gainPct: cost ? (value / cost - 1) * 100 : 0, beta: w((a) => a.beta), rel13: w((a) => a.rel13) };
  }

  // ---------- widgets ----------
  const badge = (a) => `<span class="badge ${a.plan.tone}">${a.plan.action}</span>`;
  const link = (sym) => `#/stock/${encodeURIComponent(sym)}`;

  const WIDGETS = {
    value: { title: 'Portfolio value', render: (L, T) => `<div class="big">${usd(T.value)}</div><div class="sub">Cost basis ${usd(T.cost)} · ${T.ok.length} positions</div>` },
    day: { title: "Today's change", render: (L, T) => `<div class="big ${cls(T.day)}">${signedMoney(T.day)}</div><div class="sub ${cls(T.dayPct)}">${pct(T.dayPct, 2)} today</div>` },
    gain: { title: 'Total gain / loss', render: (L, T) => `<div class="big ${cls(T.gain)}">${signedMoney(T.gain)}</div><div class="sub ${cls(T.gainPct)}">${pct(T.gainPct)} all-time</div>` },
    vsMarket: {
      title: 'You vs the S&P 500', render: (L, T) => {
        const diff = T.dayPct - S.market.spy;
        return `<div class="big ${cls(diff)}">${pct(diff, 2)}</div>
          <div class="sub">Portfolio ${pct(T.dayPct, 2)} vs S&P ${pct(S.market.spy, 2)} today</div>
          <div class="sub">3-month relative: <b class="${cls(T.rel13)}">${pct(T.rel13)}</b></div>`;
      },
    },
    sentiment: {
      title: 'Market sentiment', render: () => {
        const m = S.market;
        return `<div class="gauge"><div class="gauge-bar"></div><div class="gauge-needle" style="left:${m.score}%"></div></div>
          <div class="gauge-labels"><span>Fear</span><span>Neutral</span><span>Greed</span></div>
          <div class="big-sm"><span class="badge ${m.tone}">${m.label}</span> ${m.score}/100</div>
          <div class="sub">${m.up} of ${m.total} sectors up · S&P ${pct(m.spy, 2)}</div>`;
      },
    },
    rundown: { title: 'Market rundown', wide: true, render: () => `<ul class="lines">${S.market.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><a class="more" href="#/market">Full market view →</a>` },
    movers: {
      title: 'Over- & underperformers', wide: true, render: (L) => {
        const key = { day: (a) => a.dayRel, '3m': (a) => a.rel13, cost: (a) => a.gainPct }[S.period];
        const ok = L.filter((a) => !a.error && num(key(a))).sort((x, y) => key(y) - key(x));
        const over = ok.filter((a) => key(a) >= 0).slice(0, 3), under = ok.filter((a) => key(a) < 0).reverse().slice(0, 3);
        const row = (a) => `<a class="mover" href="${link(a.sym)}"><div class="mover-top"><b>${esc(a.sym)}</b><span class="${cls(key(a))}">${pct(key(a))}</span></div><div class="sub">${esc(Engine.explainPerf(a, S.period))}</div></a>`;
        const tabs = [['day', 'Today vs S&P'], ['3m', '3 mo vs S&P'], ['cost', 'Since purchase']]
          .map(([k, n]) => `<button class="tab ${S.period === k ? 'active' : ''}" data-period="${k}">${n}</button>`).join('');
        return `<div class="tabs">${tabs}</div><div class="two-col">
          <div><h4 class="up">▲ Outperforming</h4>${over.map(row).join('') || '<p class="sub">None</p>'}</div>
          <div><h4 class="down">▼ Underperforming</h4>${under.map(row).join('') || '<p class="sub">None</p>'}</div></div>`;
      },
    },
    plans: {
      title: 'Plan of attack', wide: true, render: (L) => `<div class="plans">${L.filter((a) => !a.error).map((a) =>
        `<a class="plan-row" href="${link(a.sym)}"><b>${esc(a.sym)}</b>${badge(a)}<span>${esc(a.plan.headline)}</span></a>`).join('')}</div>`,
    },
    allocation: { title: 'Allocation', render: (L, T) => donut(T) },
    sectors: {
      title: 'Sector heatmap', render: () => `<div class="heat">${Object.entries(Engine.SECTORS).map(([s, n]) => {
        const v = S.market.etf[s] ? S.market.etf[s].dp : null;
        const a = num(v) ? Math.min(Math.abs(v) / 2.5, 1) : 0;
        const bg = num(v) ? (v >= 0 ? `rgba(34,197,94,${0.15 + a * 0.6})` : `rgba(239,68,68,${0.15 + a * 0.6})`) : 'var(--card2)';
        return `<div class="heat-cell" style="background:${bg}"><b>${n}</b><span>${pct(v)}</span></div>`;
      }).join('')}</div>`,
    },
    risk: {
      title: 'Risk snapshot', render: (L, T) => {
        const top = T.ok.slice().sort((a, b) => b.value - a.value)[0];
        const nearSup = T.ok.filter((a) => num(a.supDist) && a.supDist <= 4).length;
        return `<div class="kv"><span>Portfolio beta</span><b>${T.beta.toFixed(2)}</b></div>
          <div class="kv"><span>If S&P falls 1%</span><b class="down">${signedMoney(-T.value * T.beta / 100)}</b></div>
          <div class="kv"><span>Largest position</span><b>${top ? `${esc(top.sym)} ${(top.value / T.value * 100).toFixed(0)}%` : '—'}</b></div>
          <div class="kv"><span>Near major support</span><b>${nearSup} of ${T.ok.length}</b></div>`;
      },
    },
    actions: {
      title: 'Action counts', render: (L) => {
        const c = {};
        L.filter((a) => !a.error).forEach((a) => { c[a.plan.action] = (c[a.plan.action] || 0) + 1; });
        return Object.entries(c).map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('') || '<p class="sub">No positions</p>';
      },
    },
  };

  const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#f87171', '#2dd4bf', '#fb923c', '#94a3b8', '#e879f9'];
  function donut(T) {
    if (!T.value) return '<p class="sub">No positions</p>';
    const items = T.ok.slice().sort((a, b) => b.value - a.value);
    let acc = 0;
    const R = 42, C = 2 * Math.PI * R;
    const arcs = items.map((a, i) => {
      const frac = a.value / T.value, dash = frac * C;
      const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="18" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 60 60)"/>`;
      acc += frac; return s;
    }).join('');
    const legend = items.map((a, i) => `<div class="leg"><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(a.sym)}<span>${(a.value / T.value * 100).toFixed(1)}%</span></div>`).join('');
    return `<div class="donut"><svg viewBox="0 0 120 120" width="130" height="130">${arcs}</svg><div class="legend">${legend}</div></div>`;
  }

  // ---------- pages ----------
  function pageDashboard() {
    const L = analyses(), T = totals(L);
    const custom = S.customizing ? `<div class="card customize"><h3>Customize your dashboard</h3><p class="sub">Toggle statistics on or off and reorder them.</p>
      ${[...S.widgets, ...Object.keys(WIDGETS).filter((k) => !S.widgets.includes(k))].map((k) => {
        const on = S.widgets.includes(k);
        return `<div class="cust-row"><label><input type="checkbox" data-toggle="${k}" ${on ? 'checked' : ''}> ${WIDGETS[k].title}</label>
          ${on ? `<span><button class="btn btn-ghost sm" data-move="${k}" data-dir="-1">↑</button><button class="btn btn-ghost sm" data-move="${k}" data-dir="1">↓</button></span>` : ''}</div>`;
      }).join('')}<button class="btn" data-reset-widgets>Reset to default</button></div>` : '';
    const errs = L.filter((a) => a.error).map((a) => `<div class="notice bad">${esc(a.sym)}: ${esc(a.error)}</div>`).join('');
    return `<div class="page-head"><h1>Dashboard</h1><button class="btn" data-customize>${S.customizing ? 'Done' : '⚙ Customize'}</button></div>
      ${custom}${errs}
      <div class="grid">${S.widgets.filter((k) => WIDGETS[k]).map((k) => {
        const w = WIDGETS[k];
        return `<section class="card ${w.wide ? 'wide' : ''}"><h3>${w.title}</h3>${w.render(L, T)}</section>`;
      }).join('')}</div>`;
  }

  function pagePortfolio() {
    const L = analyses(), T = totals(L);
    const rows = L.map((a) => a.error
      ? `<tr><td><b>${esc(a.sym)}</b></td><td colspan="7" class="down">${esc(a.error)}</td><td><button class="btn btn-ghost sm" data-remove="${esc(a.sym)}">✕</button></td></tr>`
      : `<tr class="click" data-go="${esc(a.sym)}">
          <td><b>${esc(a.sym)}</b><div class="sub">${esc(a.p.name || '')}</div></td>
          <td>${a.holding.shares}</td><td>${usd(a.q.c)}</td>
          <td class="${cls(a.q.dp)}">${pct(a.q.dp, 2)}</td>
          <td class="${cls(a.dayRel)}">${pct(a.dayRel, 2)}</td>
          <td>${money0(a.value)}</td>
          <td class="${cls(a.gainPct)}">${pct(a.gainPct)}</td>
          <td>${badge(a)}</td>
          <td><button class="btn btn-ghost sm" data-remove="${esc(a.sym)}" title="Remove">✕</button></td></tr>`).join('');
    return `<div class="page-head"><h1>Portfolio</h1><div class="sub">${usd(T.value)} · <span class="${cls(T.day)}">${signedMoney(T.day)} today</span></div></div>
      <form class="card add-form" id="add-form">
        <input name="t" placeholder="Ticker (e.g. AAPL)" required maxlength="10">
        <input name="shares" type="number" step="any" min="0" placeholder="Shares" required>
        <input name="cost" type="number" step="any" min="0" placeholder="Avg cost / share" required>
        <button class="btn" type="submit">+ Add stock</button>
      </form>
      <div class="card table-wrap"><table>
        <thead><tr><th>Stock</th><th>Shares</th><th>Price</th><th>Today</th><th>vs S&P</th><th>Value</th><th>Gain</th><th>Plan</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="sub">No stocks yet — add one above.</td></tr>'}</tbody></table></div>
      <p class="sub">Click a row for the full rundown and plan of attack.</p>`;
  }

  function pageMarket() {
    const m = S.market, e = m.etf;
    const tile = (s, n) => `<div class="card mini"><div class="sub">${n} · ${s}</div><div class="big-sm">${usd(e[s] && e[s].c)}</div><div class="${cls(e[s] && e[s].dp)}">${pct(e[s] && e[s].dp, 2)}</div></div>`;
    return `<div class="page-head"><h1>Market conditions</h1><span class="badge ${m.tone}">${m.label} · ${m.score}/100</span></div>
      <div class="grid">${Object.entries(Engine.INDICES).map(([s, n]) => tile(s, n)).join('')}</div>
      <section class="card"><h3>Rundown</h3><ul class="lines">${m.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>
      <section class="card"><h3>Sectors</h3>${WIDGETS.sectors.render()}</section>
      <section class="card"><h3>How the sentiment score works</h3><p class="sub">Starts at 50, then adjusts for the S&P 500's move, breadth (share of the 11 sector ETFs that are up),
      defensive-vs-growth rotation (XLU/XLP/XLV vs XLK/XLY/XLC), and small caps vs large caps (IWM vs SPY). Below 42 = cautious/risk-off, above 58 = constructive/risk-on.</p></section>`;
  }

  function pageStock(sym) {
    const a = analyses().find((x) => x.sym === sym);
    if (!a) return `<div class="page-head"><h1>${esc(sym)}</h1></div><div class="notice">This stock isn't in your portfolio. <a href="#/portfolio">Add it on the Portfolio page.</a></div>`;
    if (a.error) return `<div class="page-head"><h1>${esc(sym)}</h1></div><div class="notice bad">${esc(a.error)}</div>`;
    const P = a.plan;
    const ladder = [...a.lv.resist.slice(0, 4).reverse().map((x) => ({ ...x, side: 'res' })), { p: a.q.c, label: 'Current price', side: 'now' }, ...a.lv.supports.slice(0, 5).map((x) => ({ ...x, side: 'sup' }))];
    const ladderHtml = ladder.map((x) => `<div class="lvl ${x.side} ${x.kind || ''}"><span>${esc(x.label)}</span><b>${usd(x.p)}</b><em>${x.side === 'now' ? '' : pct((x.p / a.q.c - 1) * 100)}</em></div>`).join('');
    setTimeout(() => loadNews(sym), 0);
    return `<a class="back" href="#/portfolio">← Portfolio</a>
      <div class="page-head stock-head"><div><h1>${esc(sym)} <span class="sub">${esc(a.p.name || '')}</span></h1>
        <div class="price">${usd(a.q.c)} <span class="${cls(a.q.dp)}">${a.q.d > 0 ? '+' : ''}${num(a.q.d) ? a.q.d.toFixed(2) : ''} (${pct(a.q.dp, 2)})</span></div></div>
        <div class="kv-inline"><span>Your position</span><b>${a.holding.shares} sh · ${money0(a.value)}</b><span class="${cls(a.gainPct)}">${pct(a.gainPct)} vs cost ${usd(a.holding.cost)}</span></div></div>

      <section class="card plan ${P.tone}"><div class="plan-head"><span class="badge big ${P.tone}">${P.action}</span><h2>${esc(P.headline)}</h2></div>
        <div class="two-col"><div><h4>Why</h4><ul class="lines">${P.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
        <div><h4>Plan</h4><ol class="lines">${P.steps.map((w) => `<li>${esc(w)}</li>`).join('')}</ol></div></div>
        <div class="plan-levels"><div><span>Add zone</span><b>${P.addZone}</b></div><div><span>Stop</span><b class="down">${usd(P.stop)}</b></div><div><span>Target</span><b class="up">${usd(P.target)}</b></div></div>
      </section>

      <div class="grid g2">
        <section class="card"><h3>Market conditions affecting ${esc(sym)}</h3>
          <div class="kv"><span>Affected by market sentiment</span><b>${a.sensitivity}</b></div>
          ${a.conditions.map((c) => `<div class="cond"><b>${esc(c.k)}</b><p>${esc(c.v)}</p></div>`).join('')}
        </section>
        <section class="card"><h3>Support & resistance</h3><div class="ladder">${ladderHtml}</div>
          <p class="sub">Pivots come from today's high/low/close; retracements from the 52-week range. Structural levels (retracements, 52-week high/low) drive the plan.</p></section>
      </div>
      <div class="grid g2">
        <section class="card"><h3>Fundamentals score</h3><div class="big">${a.f.score}<span class="sub">/100</span> <span class="badge ${a.f.score >= 60 ? 'good' : a.f.score >= 42 ? 'neutral' : 'bad'}">${a.f.label}</span></div>
          <div class="kv"><span>EPS growth (TTM YoY)</span><b class="${cls(a.f.eps)}">${pct(a.f.eps)}</b></div>
          <div class="kv"><span>Revenue growth (TTM YoY)</span><b class="${cls(a.f.rev)}">${pct(a.f.rev)}</b></div>
          <div class="kv"><span>P/E (TTM)</span><b>${num(a.m.peTTM) ? a.m.peTTM.toFixed(1) : '—'}</b></div>
          <div class="kv"><span>Beta</span><b>${a.beta.toFixed(2)}</b></div>
          <div class="kv"><span>Analysts (Buy / Sell)</span><b>${a.f.analyst ? `${a.f.analyst.buyPct}% / ${a.f.analyst.sellPct}%` : '—'}</b></div>
          <div class="kv"><span>52-week range</span><b>${usd(a.m['52WeekLow'])} – ${usd(a.m['52WeekHigh'])}</b></div></section>
        <section class="card"><h3>Recent headlines</h3><div id="news"><p class="sub">${Data.isLive() ? 'Loading…' : 'Add a free Finnhub API key in Settings to see live headlines.'}</p></div></section>
      </div>`;
  }

  async function loadNews(sym) {
    if (!Data.isLive()) return;
    const el = document.getElementById('news');
    try {
      const items = await Data.news(sym);
      if (!el.isConnected) return;
      el.innerHTML = items && items.length ? items.map((n) => {
        const url = /^https?:\/\//.test(n.url || '') ? n.url : '#';
        const date = n.datetime ? new Date(n.datetime * 1000).toLocaleDateString() : '';
        return `<a class="news" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><b>${esc(n.headline)}</b><span class="sub">${esc(n.source)} · ${date}</span></a>`;
      }).join('') : '<p class="sub">No headlines in the last 7 days.</p>';
    } catch (e) { if (el.isConnected) el.innerHTML = `<p class="sub">${esc(e.message)}</p>`; }
  }

  function pageSettings() {
    return `<div class="page-head"><h1>Settings</h1></div>
      <section class="card"><h3>Live market data (free)</h3>
        <p>StockPilot runs on sample data until you add a free <a href="https://finnhub.io/register" target="_blank" rel="noopener">Finnhub</a> API key (free tier: 60 calls/min, no credit card).
        The key is stored only in this browser — it is never committed to the site.</p>
        <form id="key-form" class="add-form"><input name="key" type="password" placeholder="Finnhub API key" value="${esc(Data.getKey())}" autocomplete="off">
          <button class="btn" type="submit">Save key</button>${Data.isLive() ? '<button class="btn btn-ghost" type="button" data-clear-key>Use demo data</button>' : ''}</form>
        <p class="sub">Mode: <b>${Data.isLive() ? 'Live (Finnhub)' : 'Demo data'}</b></p></section>
      <section class="card"><h3>Portfolio</h3><p class="sub">Your holdings are saved in this browser.</p>
        <button class="btn btn-ghost" data-reset-portfolio>Reset to sample portfolio</button>
        <button class="btn btn-ghost" data-clear-portfolio>Clear all holdings</button></section>
      <section class="card"><h3>About the analysis</h3><p class="sub">All analysis is rule-based (no paid AI calls). Each stock gets a fundamentals score (EPS & revenue growth, analyst ratings, 3-month relative strength),
      support/resistance levels (daily pivots, 52-week range retracements), and a market-sensitivity breakdown (beta × S&P move vs the actual move). Those are combined with the market sentiment score to pick HOLD / ADD / TRIM / REDUCE / WATCH.</p></section>`;
  }

  // ---------- render ----------
  function render() {
    const route = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === (route[0] === 'stock' ? 'portfolio' : route[0])));
    const pill = document.getElementById('mode-pill');
    pill.textContent = Data.isLive() ? '● Live' : '● Demo data';
    pill.className = 'pill ' + (Data.isLive() ? 'live' : 'demo');
    document.getElementById('banner').innerHTML = Data.isLive() ? ''
      : `<div class="banner">You're viewing <b>sample data</b> (a risk-off market day). <a href="#/settings">Add a free API key</a> for live prices on any ticker.</div>`;

    const app = document.getElementById('app');
    if (route[0] === 'settings') { app.innerHTML = pageSettings(); return; }
    if (S.error) { app.innerHTML = `<div class="notice bad">${esc(S.error)}</div>`; return; }
    if (!S.market) { app.innerHTML = `<div class="loading">Loading market data…</div>`; return; }
    if (route[0] === 'portfolio') app.innerHTML = pagePortfolio();
    else if (route[0] === 'market') app.innerHTML = pageMarket();
    else if (route[0] === 'stock') app.innerHTML = pageStock(decodeURIComponent(route[1] || '').toUpperCase());
    else app.innerHTML = pageDashboard();
    if (S.loading) app.insertAdjacentHTML('afterbegin', '<div class="loading-bar"></div>');
    if (S.updated) app.insertAdjacentHTML('beforeend', `<p class="sub updated">Updated ${S.updated.toLocaleTimeString()}</p>`);
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
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
    else if (d.remove) { S.holdings = S.holdings.filter((h) => h.t !== d.remove); save(LS.holdings, S.holdings); render(); }
    else if ('clearKey' in d) { Data.setKey(''); S.raw = {}; S.market = null; render(); loadAll(); }
    else if ('resetPortfolio' in d) { S.holdings = DEFAULT_HOLDINGS.slice(); save(LS.holdings, S.holdings); loadAll(); location.hash = '#/portfolio'; }
    else if ('clearPortfolio' in d) { S.holdings = []; save(LS.holdings, S.holdings); location.hash = '#/portfolio'; render(); }
  });

  document.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.toggle;
    if (!k) return;
    S.widgets = e.target.checked ? [...S.widgets, k] : S.widgets.filter((w) => w !== k);
    save(LS.widgets, S.widgets); render();
  });

  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (e.target.id === 'add-form') {
      const t = String(f.get('t')).toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
      const shares = parseFloat(f.get('shares')), cost = parseFloat(f.get('cost'));
      if (!t || !(shares > 0) || !(cost > 0)) return;
      const existing = S.holdings.find((h) => h.t === t);
      if (existing) { // merge into a weighted average cost
        existing.cost = (existing.cost * existing.shares + cost * shares) / (existing.shares + shares);
        existing.shares += shares;
      } else S.holdings.push({ t, shares, cost });
      save(LS.holdings, S.holdings);
      await loadStock(t); render();
    } else if (e.target.id === 'key-form') {
      Data.setKey(String(f.get('key') || ''));
      S.raw = {}; S.market = null; location.hash = '#/dashboard'; loadAll();
    }
  });

  document.getElementById('refresh').addEventListener('click', () => loadAll(true));
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  render();
  loadAll();
})();
