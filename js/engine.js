// Rule-based analysis: market sentiment, support/resistance, and a plan of attack per stock.
const Engine = (() => {
  const INDICES = { SPY: 'S&P 500', QQQ: 'Nasdaq 100', IWM: 'Russell 2000', DIA: 'Dow 30' };
  const SECTORS = {
    XLK: 'Technology', XLC: 'Communication', XLY: 'Consumer Disc.', XLP: 'Consumer Staples',
    XLF: 'Financials', XLV: 'Health Care', XLE: 'Energy', XLI: 'Industrials',
    XLB: 'Materials', XLU: 'Utilities', XLRE: 'Real Estate',
  };
  const SECTOR_RULES = [
    ['XLU', /utilit/], ['XLRE', /real estate|reit/],
    ['XLK', /semicon|technolog|software|hardware|electronic|it services|computer/],
    ['XLC', /media|entertain|telecom|communicat|interactive/],
    ['XLE', /energy|oil|gas|coal/],
    ['XLF', /bank|financ|insurance|capital market/],
    ['XLV', /pharma|biotech|health|life science|medical/],
    ['XLP', /beverage|food|tobacco|household|personal/],
    ['XLY', /retail|automobile|hotel|restaurant|leisure|textile|apparel|consumer|distribut/],
    ['XLB', /chemical|metal|mining|material|paper|packag/],
    ['XLI', /aerospace|defense|airline|machinery|industrial|transport|logistic|road|marine|building|electrical|commercial|construct|trading/],
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v) => typeof v === 'number' && isFinite(v);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const pct = (v, d = 1) => (num(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)}%` : '—');
  const usd = (v) => (num(v) ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');

  function sectorFor(industry) {
    const s = (industry || '').toLowerCase();
    for (const [sym, re] of SECTOR_RULES) if (re.test(s)) return sym;
    return 'SPY';
  }

  function marketSentiment(etf) {
    const dp = (s) => (etf[s] && num(etf[s].dp) ? etf[s].dp : 0);
    const spy = dp('SPY');
    const secs = Object.keys(SECTORS).filter((s) => etf[s]);
    const up = secs.filter((s) => dp(s) > 0).length;
    const breadth = secs.length ? up / secs.length : 0.5;
    const rotation = avg(['XLU', 'XLP', 'XLV'].map(dp)) - avg(['XLK', 'XLY', 'XLC'].map(dp));
    const smallVsLarge = dp('IWM') - spy;

    let score = 50 + clamp(spy * 9, -30, 30) + (breadth - 0.5) * 30 - clamp(rotation * 2.5, -12, 12) + clamp(smallVsLarge * 3, -6, 6);
    score = clamp(Math.round(score), 0, 100);
    const label = score < 25 ? 'Risk-off' : score < 42 ? 'Cautious' : score < 58 ? 'Neutral' : score < 75 ? 'Constructive' : 'Risk-on';
    const tone = score < 42 ? 'bad' : score < 58 ? 'neutral' : 'good';

    const ranked = secs.slice().sort((a, b) => dp(b) - dp(a));
    const best = ranked[0], worst = ranked[ranked.length - 1];
    const lines = [
      `S&P 500 ${pct(spy, 2)}, Nasdaq 100 ${pct(dp('QQQ'), 2)}, Russell 2000 ${pct(dp('IWM'), 2)}, Dow ${pct(dp('DIA'), 2)}.`,
      `Breadth: ${up} of ${secs.length} sectors are higher${breadth < 0.35 ? ' — selling is broad-based' : breadth > 0.7 ? ' — a broad rally' : ''}.`,
      rotation > 0.5
        ? 'Defensive sectors (utilities, staples, health care) are leading while growth lags — classic risk-off rotation.'
        : rotation < -0.5
          ? 'Growth sectors (tech, discretionary, communications) are leading — investors are leaning into risk.'
          : 'No clear rotation between growth and defensive sectors.',
      best ? `Strongest sector: ${SECTORS[best]} (${pct(dp(best))}). Weakest: ${SECTORS[worst]} (${pct(dp(worst))}).` : '',
      Math.abs(smallVsLarge) > 0.4 ? `Small caps are ${smallVsLarge < 0 ? 'underperforming' : 'outperforming'} large caps by ${Math.abs(smallVsLarge).toFixed(1)} pts${smallVsLarge < 0 ? ', another sign of caution' : ', a sign of risk appetite'}.` : '',
      score < 42
        ? 'Implication: high-beta holdings feel this most. Strong stocks sitting on support are usually better held than sold into fear.'
        : score >= 58
          ? 'Implication: tailwind for most holdings. Laggards in a rising market deserve a closer look.'
          : 'Implication: stock-specific news and levels matter more than the overall tape today.',
    ].filter(Boolean);

    return { score, label, tone, spy, breadth, up, total: secs.length, rotation, lines, etf };
  }

  function levels(q, m) {
    const out = [];
    const { c, h, l, pc } = q;
    if (h && l && c) {
      const P = (h + l + c) / 3, R = h - l;
      out.push({ p: 2 * P - h, label: 'Pivot S1', kind: 'pivot' }, { p: P - R, label: 'Pivot S2', kind: 'pivot' },
        { p: 2 * P - l, label: 'Pivot R1', kind: 'pivot' }, { p: P + R, label: 'Pivot R2', kind: 'pivot' });
    }
    const H = m['52WeekHigh'], L = m['52WeekLow'];
    if (num(H) && num(L) && H > L) {
      out.push({ p: H, label: '52-week high', kind: 'major' }, { p: L, label: '52-week low', kind: 'major' });
      [[0.236, '23.6%'], [0.382, '38.2%'], [0.5, '50%'], [0.618, '61.8%']]
        .forEach(([f, n]) => out.push({ p: H - f * (H - L), label: `${n} retracement`, kind: 'fib' }));
    }
    if (pc) out.push({ p: pc, label: 'Prior close', kind: 'minor' });
    const structural = (x) => x.kind === 'fib' || x.kind === 'major';
    const supports = out.filter((x) => x.p < c).sort((a, b) => b.p - a.p);
    const resist = out.filter((x) => x.p > c).sort((a, b) => a.p - b.p);
    // A structural level the stock was above at the prior close and is now under = fresh breakdown.
    const broken = out.filter((x) => structural(x) && pc > x.p && x.p >= c).sort((a, b) => b.p - a.p)[0] || null;
    return { all: out, supports, resist, broken, majorSup: supports.filter(structural), majorRes: resist.filter(structural) };
  }

  function fundamentals(m, r) {
    let s = 50;
    const notes = [];
    const eps = num(m.epsGrowthTTMYoy) ? m.epsGrowthTTMYoy : m.epsGrowthQuarterlyYoy;
    const rev = num(m.revenueGrowthTTMYoy) ? m.revenueGrowthTTMYoy : m.revenueGrowthQuarterlyYoy;
    if (num(eps)) { s += clamp(eps / 2.5, -15, 15); notes.push(`EPS ${pct(eps, 0)} YoY`); }
    if (num(rev)) { s += clamp(rev / 2, -12, 12); notes.push(`revenue ${pct(rev, 0)} YoY`); }
    let analyst = null;
    if (r) {
      const tot = (r.strongBuy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strongSell || 0);
      if (tot) {
        const cons = (2 * r.strongBuy + r.buy - r.sell - 2 * r.strongSell) / tot;
        s += cons * 8;
        analyst = { tot, buyPct: Math.round(((r.strongBuy + r.buy) / tot) * 100), sellPct: Math.round(((r.sell + r.strongSell) / tot) * 100) };
        notes.push(`${analyst.buyPct}% of ${tot} analysts rate it a Buy`);
      }
    }
    const rel = m['priceRelativeToS&P50013Week'];
    if (num(rel)) s += clamp(rel / 2, -8, 8);
    const score = clamp(Math.round(s), 0, 100);
    const label = score >= 60 ? 'Strong' : score >= 42 ? 'Mixed' : 'Weak';
    return { score, label, notes, analyst, eps, rev };
  }

  function analyzeStock({ sym, q, m, p, r, holding, market }) {
    const etf = market.etf;
    const spy = market.spy;
    const beta = num(m.beta) ? m.beta : 1;
    const secSym = sectorFor(p && p.finnhubIndustry);
    const secDp = etf[secSym] ? etf[secSym].dp : null;
    const lv = levels(q, m);
    const ns = lv.majorSup[0] || null, nr = lv.majorRes[0] || null;
    const supDist = ns ? ((q.c - ns.p) / q.c) * 100 : null;
    const resDist = nr ? ((nr.p - q.c) / q.c) * 100 : null;
    const f = fundamentals(m, r);
    const expected = beta * spy, idio = q.dp - expected;
    const dayRel = q.dp - spy;
    const rel13 = m['priceRelativeToS&P50013Week'];
    const gainPct = holding && holding.cost ? (q.c / holding.cost - 1) * 100 : null;
    const H = m['52WeekHigh'], L = m['52WeekLow'];
    const rangePos = num(H) && num(L) && H > L ? ((q.c - L) / (H - L)) * 100 : null;

    // How much of today's move does the market explain?
    let attribution;
    if (Math.abs(idio) < 0.5) attribution = 'the move is almost entirely market-driven';
    else if (Math.sign(idio) === Math.sign(expected) && Math.abs(expected) >= Math.abs(idio)) attribution = `mostly market-driven, plus ${pct(idio)} of stock-specific ${idio < 0 ? 'selling' : 'buying'}`;
    else if (idio > 0) attribution = `it's showing relative strength (${pct(idio)} better than its beta implies)`;
    else attribution = `there's stock-specific selling (${pct(idio)} beyond what the market explains)`;
    const share = Math.abs(expected) / (Math.abs(expected) + Math.abs(idio) || 1);
    const sensitivity = beta >= 1.4 || share > 0.7 ? 'High' : beta >= 0.8 || share > 0.4 ? 'Moderate' : 'Low';

    const conditions = [
      { k: 'Market', v: `${market.label} tape (sentiment ${market.score}/100). S&P 500 ${pct(spy, 2)} today.` },
      secSym !== 'SPY' && num(secDp)
        ? { k: 'Sector', v: `${SECTORS[secSym]} (${secSym}) ${pct(secDp)} — ${secDp < spy ? 'lagging' : 'beating'} the S&P 500.` } : null,
      { k: 'Market sensitivity', v: `Beta ${beta.toFixed(2)}: the market alone implies ${pct(expected)}; actual ${pct(q.dp)}, so ${attribution}.` },
      { k: 'Fundamentals', v: f.notes.length ? `${f.label} — ${f.notes.join(', ')}.` : 'Not enough data.' },
      { k: 'Trend', v: [
        num(m['13WeekPriceReturnDaily']) ? `3-month ${pct(m['13WeekPriceReturnDaily'])}` : null,
        num(m['26WeekPriceReturnDaily']) ? `6-month ${pct(m['26WeekPriceReturnDaily'])}` : null,
        num(rel13) ? `${pct(rel13)} vs S&P over 3 months` : null,
        num(rangePos) ? `trading at ${Math.round(rangePos)}% of its 52-week range` : null,
      ].filter(Boolean).join(', ') + '.' },
    ].filter(Boolean);

    const plan = decide({ q, f, market, lv, ns, nr, supDist, resDist, dayRel, gainPct, H });
    return { sym, q, m, p, r, holding, beta, secSym, secDp, lv, ns, nr, supDist, resDist, f, expected, idio, dayRel, rel13, gainPct, rangePos, attribution, sensitivity, conditions, plan };
  }

  function decide({ q, f, market, lv, ns, nr, supDist, resDist, dayRel, gainPct, H }) {
    const strong = f.score >= 60, weak = f.score < 42;
    const mWeak = market.score < 42, mStrong = market.score >= 58;
    const nearSup = supDist !== null && supDist <= 4;
    const nearRes = resDist !== null && resDist <= 2;
    const broke = lv.broken;
    const s1 = lv.all.find((x) => x.label === 'Pivot S1');
    const nextSup = broke ? lv.majorSup.find((x) => x.p < broke.p) || ns : ns;
    const stop = nextSup ? Math.max(nextSup.p * 0.98, q.c * 0.88) : q.c * 0.9;
    const target = nr ? nr.p : num(H) ? H : null;
    const addLo = ns ? ns.p : s1 ? s1.p : null;
    const addHi = s1 && ns && s1.p > ns.p ? s1.p : null;
    const addZone = addLo ? (addHi ? `${usd(addLo)} – ${usd(addHi)}` : usd(addLo)) : '—';
    const fnotes = f.notes.slice(0, 2).join(', ');
    let action, tone, headline, why = [], steps = [];

    if (strong && broke) {
      action = 'HOLD'; tone = 'warn';
      headline = `Strong business, but it just slipped under its ${broke.label} (${usd(broke.p)}). Hold while it stays above ${usd(nextSup ? nextSup.p : stop)}.`;
      why.push(`Fundamentals are still ${f.label.toLowerCase()} (${fnotes}).`, `Today's ${pct(q.dp)} move took out a level buyers had been defending.`);
      steps.push(`Hold — one bad day doesn't change the thesis.`, `A close back above ${usd(broke.p)} = failed breakdown, a bullish signal.`, `Stop: daily close below ${usd(stop)}.`);
    } else if (strong && nearSup && mWeak) {
      action = 'HOLD'; tone = 'good';
      headline = 'Market-driven pullback into support — keep holding.';
      why.push(`The company keeps posting strong numbers (${fnotes}), but the ${market.label.toLowerCase()} market is dragging it lower.`,
        `It's ${supDist.toFixed(1)}% above the ${ns.label} at ${usd(ns.p)} — a likely bounce zone.`);
      steps.push(`Hold the position; don't sell a strong stock into market-wide fear.`, `Optional add zone: ${addZone} if support holds.`, `Stop: daily close below ${usd(stop)}.`, target ? `Upside target: ${usd(target)} (${nr ? nr.label : '52-week high'}).` : null);
    } else if (strong && nearSup) {
      action = 'ADD'; tone = 'good';
      headline = 'Strong name resting on support — favorable risk/reward to add.';
      why.push(`${f.label} fundamentals (${fnotes}).`, `Only ${supDist.toFixed(1)}% above the ${ns.label} (${usd(ns.p)}), so risk is well defined.`);
      steps.push(`Add in the ${addZone} zone.`, `Stop: daily close below ${usd(stop)}.`, target ? `Target: ${usd(target)}.` : null);
    } else if (strong && nearRes && !mWeak) {
      action = 'HOLD'; tone = 'good';
      headline = `Pressing into resistance at ${usd(nr.p)} — let the winner run.`;
      why.push(`${f.label} fundamentals (${fnotes}) and a supportive market.`, `${nr.label} sits ${resDist.toFixed(1)}% overhead.`);
      steps.push(`Hold. A breakout above ${usd(nr.p)} opens the next leg.`, `If it's rejected there, trim 10–20% and re-buy near ${addZone}.`, `Raise stop to ${usd(stop)}.`);
    } else if (strong && mWeak) {
      action = 'HOLD'; tone = 'neutral';
      headline = `Quality name in a weak tape — hold, and wait for a better entry near ${addZone}.`;
      why.push(`${f.label} fundamentals (${fnotes}).`, `The market backdrop is ${market.label.toLowerCase()}, so new money can be patient.`);
      steps.push(`Hold the core position.`, `Look to add near ${addZone}.`, `Stop: daily close below ${usd(stop)}.`);
    } else if (strong) {
      action = 'HOLD'; tone = 'good';
      headline = `Healthy setup — hold; add on dips toward ${addZone}.`;
      why.push(`${f.label} fundamentals (${fnotes}).`, `Market backdrop is ${market.label.toLowerCase()}.`);
      steps.push(`Hold.`, `Add on pullbacks to ${addZone}.`, target ? `Next resistance: ${usd(target)}.` : null);
    } else if (weak && (broke || (mWeak && !nearSup))) {
      action = 'REDUCE'; tone = 'bad';
      headline = broke ? `Weak fundamentals and it just broke the ${broke.label} — reduce exposure.` : 'Weak fundamentals in a weak market, with no support nearby — reduce exposure.';
      why.push(`Fundamentals are ${f.label.toLowerCase()} (${fnotes || 'limited data'}).`, mWeak ? `The ${market.label.toLowerCase()} market removes the safety net.` : `Price action confirms the weakness.`);
      steps.push(`Cut the position by a third to a half.`, `Hard stop on the rest: ${usd(stop)}.`, broke ? `Re-evaluate only if it reclaims ${usd(broke.p)}.` : null);
    } else if (weak && mStrong && dayRel < 0) {
      action = 'TRIM'; tone = 'bad';
      headline = 'Lagging a rising market — stock-specific weakness.';
      why.push(`Down ${pct(dayRel)} vs the S&P 500 on an up day.`, `Fundamentals are ${f.label.toLowerCase()} (${fnotes}).`);
      steps.push(`Trim into any bounce toward ${nr ? usd(nr.p) : 'resistance'}.`, `Stop: ${usd(stop)}.`);
    } else if (weak && nearSup) {
      action = 'WATCH'; tone = 'warn';
      headline = `Sitting on support at ${usd(ns.p)}, but fundamentals don't justify adding.`;
      why.push(`Fundamentals are ${f.label.toLowerCase()} (${fnotes}).`, `Support is only ${supDist.toFixed(1)}% below — a bounce is possible, but don't count on it.`);
      steps.push(`Hold with a tight stop at ${usd(stop)}.`, `Don't add until fundamentals improve.`);
    } else if (weak) {
      action = 'TRIM'; tone = 'warn';
      headline = `Fundamentals deteriorating — trim into strength${nr ? ` near ${usd(nr.p)}` : ''}.`;
      why.push(`Fundamentals are ${f.label.toLowerCase()} (${fnotes}).`);
      steps.push(`Trim 25–33% on rallies.`, `Stop: ${usd(stop)}.`);
    } else if (broke) {
      action = 'WATCH'; tone = 'warn';
      headline = `Mixed fundamentals and it lost the ${broke.label} (${usd(broke.p)}) — on watch.`;
      why.push(`Fundamentals are mixed (${fnotes}).`, `Breakdowns without strong numbers behind them often follow through.`);
      steps.push(`Hold only while above ${usd(stop)}.`, `Reclaiming ${usd(broke.p)} would cancel the warning.`);
    } else if (nearRes) {
      action = 'TRIM'; tone = 'neutral';
      headline = `Approaching resistance at ${usd(nr.p)} with mixed fundamentals — take some profit into strength.`;
      why.push(`Fundamentals are mixed (${fnotes}).`, `${nr.label} is ${resDist.toFixed(1)}% above.`);
      steps.push(`Trim 10–25% near ${usd(nr.p)}.`, `Re-buy on a pullback to ${addZone}.`);
    } else if (nearSup) {
      action = 'HOLD'; tone = 'neutral';
      headline = `Holding support at ${usd(ns.p)} — hold with a defined stop.`;
      why.push(`Fundamentals are mixed (${fnotes}).`, `Support is ${supDist.toFixed(1)}% below.`);
      steps.push(`Hold.`, `Stop: daily close below ${usd(stop)}.`);
    } else {
      action = 'HOLD'; tone = 'neutral';
      headline = 'No strong edge either way — hold and monitor.';
      why.push(`Fundamentals are mixed (${fnotes || 'limited data'}) and price is between key levels.`);
      steps.push(`Hold.`, `Watch ${ns ? usd(ns.p) : 'support'} below and ${nr ? usd(nr.p) : 'resistance'} above.`);
    }

    if (num(gainPct) && gainPct > 50 && action !== 'REDUCE') steps.push(`You're up ${gainPct.toFixed(0)}% on this position — consider raising your stop to lock in part of the gain.`);
    if (num(gainPct) && gainPct < -15) steps.push(`You're down ${Math.abs(gainPct).toFixed(0)}% from cost — decide your max-loss line now, not in the moment.`);

    return { action, tone, headline, why, steps: steps.filter(Boolean), stop, target, addZone };
  }

  // One-line "why" for the over/underperformer lists.
  function explainPerf(a, period) {
    if (period === 'day') {
      const parts = [`${pct(a.q.dp)} vs S&P ${pct(a.q.dp - a.dayRel)}.`];
      parts.push(Math.abs(a.idio) < 0.5 ? `Beta ${a.beta.toFixed(1)} explains the move — market-driven.`
        : a.idio > 0 ? `${pct(a.idio)} better than its beta implies — relative strength.`
          : `${pct(a.idio)} worse than its beta implies — stock-specific selling.`);
      if (a.secSym !== 'SPY' && num(a.secDp)) parts.push(`Sector ${a.secSym} ${pct(a.secDp)}.`);
      return parts.join(' ');
    }
    if (period === '3m') {
      return `${pct(a.rel13)} vs S&P over 3 months. Fundamentals ${a.f.label.toLowerCase()}${a.f.notes[0] ? ` (${a.f.notes[0]})` : ''}.`;
    }
    return `${pct(a.gainPct)} since purchase at ${usd(a.holding.cost)}. ${a.f.label} fundamentals.`;
  }

  return { INDICES, SECTORS, sectorFor, marketSentiment, analyzeStock, explainPerf, pct, usd, num };
})();
