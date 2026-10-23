# StockPilot

A portfolio tracker that explains how current market conditions affect each of your stocks, and gives each one a plan of attack based on support levels and market sentiment.

**Live site:** https://colehmattingly-coder.github.io/stockpilot/

## Features
- **Portfolio:** add tickers with shares and average cost. Everything is saved in your browser.
- **Customizable dashboard:** turn widgets on or off and reorder them (value, day change, gain, vs S&P 500, sentiment gauge, over/underperformers, plan of attack, market rundown, allocation, sector heatmap, risk snapshot, action counts).
- **Market sentiment score (0–100):** built from the S&P 500 move, sector breadth, defensive-vs-growth rotation, and small caps vs large caps.
- **Per-stock rundown:** sector move, beta-based split of each move into market-driven vs stock-specific, fundamentals, trend, and headlines.
- **Plan of attack:** HOLD / ADD / TRIM / REDUCE / WATCH, with an add zone, a stop, and a target taken from support and resistance (daily pivots and 52-week retracements).
- **Over/underperformers:** ranked vs the S&P 500 (today or 3 months) or vs your cost, each with a one-line reason.

## Cost
- Hosting: free on GitHub Pages, with no backend.
- Data: free [Finnhub](https://finnhub.io/register) tier (60 calls/min). You enter the key in **Settings**, and it's stored only in your browser.
- Analysis: rule-based, so there are no AI API calls.
- Without a key, the site runs on built-in **demo data** (a risk-off market day), so it always works when you present it.

## Run locally
```bash
python -m http.server 8765
```
Then open http://localhost:8765.

## Structure
- `index.html`: page shell
- `css/style.css`: styling
- `js/data.js`: Finnhub client with caching and rate limiting, plus a demo fallback
- `js/demo.js`: sample data
- `js/engine.js`: sentiment, support/resistance, fundamentals score, plan-of-attack rules
- `js/app.js`: routing, dashboard widgets, pages

_Educational class project. Not investment advice._
