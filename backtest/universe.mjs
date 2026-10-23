// 40 large US stocks across all 11 sectors: [industry (Finnhub-style), name].
// The engine maps the industry string to a sector ETF exactly as it does live.
export const UNIVERSE = {
  AAPL: ['Technology', 'Apple'], MSFT: ['Technology', 'Microsoft'], NVDA: ['Semiconductors', 'NVIDIA'], AMD: ['Semiconductors', 'AMD'],
  ORCL: ['Technology', 'Oracle'], CRM: ['Technology', 'Salesforce'], ADBE: ['Technology', 'Adobe'], INTC: ['Semiconductors', 'Intel'],
  GOOGL: ['Media', 'Alphabet'], META: ['Media', 'Meta Platforms'], NFLX: ['Media', 'Netflix'], DIS: ['Media', 'Walt Disney'],
  AMZN: ['Retail', 'Amazon'], TSLA: ['Automobiles', 'Tesla'], HD: ['Retail', 'Home Depot'], NKE: ['Textiles, Apparel & Luxury Goods', 'Nike'],
  MCD: ['Hotels, Restaurants & Leisure', "McDonald's"],
  KO: ['Beverages', 'Coca-Cola'], PG: ['Household Products', 'Procter & Gamble'], WMT: ['Food & Staples Retailing', 'Walmart'], COST: ['Food & Staples Retailing', 'Costco'],
  JPM: ['Banking', 'JPMorgan Chase'], BAC: ['Banking', 'Bank of America'], GS: ['Capital Markets', 'Goldman Sachs'], V: ['Financial Services', 'Visa'],
  JNJ: ['Pharmaceuticals', 'Johnson & Johnson'], UNH: ['Health Care', 'UnitedHealth'], PFE: ['Pharmaceuticals', 'Pfizer'], LLY: ['Pharmaceuticals', 'Eli Lilly'],
  XOM: ['Energy', 'Exxon Mobil'], CVX: ['Energy', 'Chevron'], COP: ['Energy', 'ConocoPhillips'],
  CAT: ['Machinery', 'Caterpillar'], BA: ['Aerospace & Defense', 'Boeing'], UPS: ['Logistics & Transportation', 'UPS'],
  NEE: ['Utilities', 'NextEra Energy'], DUK: ['Utilities', 'Duke Energy'],
  LIN: ['Chemicals', 'Linde'], FCX: ['Metals & Mining', 'Freeport-McMoRan'], PLD: ['Real Estate', 'Prologis'],
};
export const ETFS = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLC', 'XLY', 'XLP', 'XLF', 'XLV', 'XLE', 'XLI', 'XLB', 'XLU', 'XLRE'];
export const START = '2020-06-01';      // one extra year of history for 52-week levels and beta
export const TEST_START = '2021-10-25'; // 5-year test window
export const HORIZON = 20;              // trading days (~1 month) to judge each signal
