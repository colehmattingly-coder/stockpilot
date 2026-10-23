# StockPilot

Look up any stock and get a plain-English read: what the market is doing, how much of the stock's move comes from the market, where its support and resistance sit, and a plan of attack (HOLD / ADD / TRIM / REDUCE / WATCH) with a buy zone, stop and target.

**Live site:** https://colehmattingly-coder.github.io/stockpilot/

## How to use it
1. Type a ticker in the search bar and press **Analyze**.
2. Click **Add to my stocks** to follow it. Shares are optional: fill in **Your position** on the stock's page to see value and gains.
3. **Overview** shows the market mood, your plans, and your leaders and laggards. Use **Customize** to pick and reorder its panels.
4. **Track record** shows how the signals performed over the last 5 years.

## Data
- **Without a key:** real closing prices for 40 large US stocks from the latest snapshot (`data/snapshot.json`).
- **With a free [Finnhub](https://finnhub.io/register) key** (entered in Settings, stored only in your browser): live prices for any ticker, plus earnings growth, analyst ratings and headlines.
- The analysis is rule-based, so it makes no AI API calls. Hosting is free on GitHub Pages.

## Accuracy (5-year backtest)
`backtest/run.mjs` runs the site's own `js/engine.js` on every trading day from Oct 2021 to Sep 2026 for 40 stocks (49,400 stock-days). On each day it uses only data available that day, then checks the next 20 trading days. Results are in `data/backtest.json`, and the site's Track record page presents them.

- **Signals:** only slightly better than chance. Stocks rose a month later 53.2% of the time overall, 54% after HOLD, and 51.4% after TRIM.
- **Support levels:** held 54.1% of the time vs 50.9% by chance. The 23.6% retracement and the 52-week low worked best. The 50% and 61.8% retracements showed no edge.
- **Mood score:** describes the day but doesn't predict the next month.
- **Not tested:** earnings and analyst inputs, because no free historical source exists.

Re-run it:
```bash
node backtest/fetch.mjs
node backtest/run.mjs
```

## Structure
- `index.html`, `css/style.css`: page shell and styles
- `js/data.js`: Finnhub client (cache and rate limit) plus the snapshot fallback
- `js/engine.js`: market mood, support/resistance, fundamentals score, plan rules
- `js/app.js`: pages and interactions
- `backtest/`: price download and backtest scripts

_Educational class project. Not investment advice._
