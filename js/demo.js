// Sample data used when no Finnhub key is set. Scenario: a broad risk-off
// session (S&P 500 down ~1.4%, defensives leading). Values are illustrative.
const DEMO = (() => {
  const q = (c, pc, h, l) => ({ c, pc, h, l, o: pc, d: +(c - pc).toFixed(2), dp: +((c / pc - 1) * 100).toFixed(2) });

  const etf = {
    SPY: q(661.2, 670.7, 671.5, 659.8), QQQ: q(590.4, 602.8, 603.6, 589.1),
    IWM: q(241.3, 245.9, 246.2, 240.7), DIA: q(458.9, 463.3, 463.9, 457.8),
    XLK: q(281.6, 288.2, 288.9, 280.9), XLY: q(229.4, 233.8, 234.2, 228.7),
    XLC: q(113.2, 115.0, 115.3, 112.9), XLF: q(52.9, 53.2, 53.4, 52.7),
    XLI: q(150.3, 152.0, 152.4, 149.9), XLB: q(89.6, 90.4, 90.7, 89.3),
    XLE: q(91.8, 90.5, 92.0, 90.3), XLV: q(139.6, 140.0, 140.6, 139.1),
    XLP: q(79.3, 79.0, 79.5, 78.8), XLU: q(84.7, 84.2, 84.9, 84.0),
    XLRE: q(41.9, 42.2, 42.4, 41.8),
  };

  const m = (o) => ({
    '52WeekHigh': o.hi, '52WeekLow': o.lo, beta: o.beta,
    epsGrowthTTMYoy: o.eps, revenueGrowthTTMYoy: o.rev,
    '13WeekPriceReturnDaily': o.r13, '26WeekPriceReturnDaily': o.r26,
    '52WeekPriceReturnDaily': o.r52, 'priceRelativeToS&P50013Week': o.rel13,
    peTTM: o.pe, marketCapitalization: o.cap,
  });
  const r = (strongBuy, buy, hold, sell, strongSell) => ({ strongBuy, buy, hold, sell, strongSell, period: '2026-10-01' });

  const stocks = {
    NVDA: { q: q(176.2, 182.9, 183.5, 175.4), p: { name: 'NVIDIA Corp', finnhubIndustry: 'Semiconductors' },
      m: m({ hi: 195.6, lo: 86.6, beta: 1.8, eps: 55, rev: 62, r13: 9, r26: 38, r52: 41, rel13: 6, pe: 52, cap: 4290000 }), r: r(25, 30, 5, 1, 0) },
    AAPL: { q: q(228.4, 232.1, 233.0, 227.1), p: { name: 'Apple Inc', finnhubIndustry: 'Technology' },
      m: m({ hi: 260.1, lo: 169.2, beta: 1.2, eps: 10, rev: 6, r13: 4, r26: 12, r52: -3, rel13: -2, pe: 34, cap: 3390000 }), r: r(12, 20, 14, 1, 0) },
    MSFT: { q: q(512.3, 517.0, 518.0, 509.8), p: { name: 'Microsoft Corp', finnhubIndustry: 'Technology' },
      m: m({ hi: 555.5, lo: 344.8, beta: 0.9, eps: 15, rev: 15, r13: 3, r26: 22, r52: 19, rel13: 1, pe: 37, cap: 3810000 }), r: r(20, 33, 4, 0, 0) },
    AMZN: { q: q(219.8, 222.0, 223.0, 218.6), p: { name: 'Amazon.com Inc', finnhubIndustry: 'Retail' },
      m: m({ hi: 242.5, lo: 161.4, beta: 1.3, eps: 33, rev: 11, r13: -3, r26: 8, r52: 17, rel13: -6, pe: 33, cap: 2340000 }), r: r(22, 40, 3, 0, 0) },
    TSLA: { q: q(418.5, 438.9, 440.1, 415.0), p: { name: 'Tesla Inc', finnhubIndustry: 'Automobiles' },
      m: m({ hi: 488.5, lo: 214.3, beta: 2.3, eps: -38, rev: -3, r13: 18, r26: 30, r52: 72, rel13: 10, pe: 240, cap: 1390000 }), r: r(8, 14, 17, 9, 4) },
    JPM: { q: q(296.4, 297.2, 299.0, 294.8), p: { name: 'JPMorgan Chase & Co', finnhubIndustry: 'Banking' },
      m: m({ hi: 318.0, lo: 202.2, beta: 1.05, eps: 8, rev: 3, r13: 2, r26: 15, r52: 31, rel13: 0, pe: 15, cap: 815000 }), r: r(6, 12, 9, 1, 0) },
    XOM: { q: q(114.7, 112.9, 115.3, 112.6), p: { name: 'Exxon Mobil Corp', finnhubIndustry: 'Energy' },
      m: m({ hi: 120.8, lo: 97.8, beta: 0.5, eps: -12, rev: -5, r13: 2, r26: 6, r52: -4, rel13: -4, pe: 16, cap: 489000 }), r: r(5, 9, 14, 2, 0) },
    KO: { q: q(69.4, 68.9, 69.6, 68.7), p: { name: 'Coca-Cola Co', finnhubIndustry: 'Beverages' },
      m: m({ hi: 74.4, lo: 60.6, beta: 0.45, eps: 4, rev: 2, r13: -2, r26: 1, r52: 6, rel13: -5, pe: 24, cap: 298000 }), r: r(6, 12, 7, 0, 0) },
  };

  return { etf, stocks };
})();
