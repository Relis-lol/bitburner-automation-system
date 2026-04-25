/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const CFG = {
    LONG_BUY: 0.60,
    LONG_SELL: 0.54,

    SHORT_BUY: 0.40,
    SHORT_SELL: 0.46,

    MAX_POSITIONS: 8,
    RESERVE: 0.15,
    MAX_PER_STOCK: 0.18,

    MIN_TRADE_VALUE: 1_000_000,
  };

  try {
    ns.stock.getForecast(ns.stock.getSymbols()[0]);
  } catch {
    ns.tprint("ERROR: 4S Market Data TIX API missing.");
    return;
  }

  const shortsEnabled = canShort(ns);
  ns.tprint(`Fast Stock Trader started. Shorts: ${shortsEnabled ? "ENABLED" : "DISABLED"}`);

  const symbols = ns.stock.getSymbols();

  while (true) {
    await ns.stock.nextUpdate();

    const data = symbols.map(sym => {
      const [longShares, longAvg, shortShares, shortAvg] = ns.stock.getPosition(sym);

      return {
        sym,
        forecast: ns.stock.getForecast(sym),
        price: ns.stock.getPrice(sym),
        maxShares: ns.stock.getMaxShares(sym),
        longShares,
        longAvg,
        shortShares,
        shortAvg,
      };
    });

    // SELL LONGS / COVER SHORTS
    for (const s of data) {
      if (s.longShares > 0 && s.forecast <= CFG.LONG_SELL) {
        const price = ns.stock.sellStock(s.sym, s.longShares);
        if (price > 0) {
          const value = price * s.longShares;
          const profit = value - s.longAvg * s.longShares;
          ns.tprint(`💰 SOLD LONG ${s.sym}: ${ns.formatNumber(value)} | Profit: ${ns.formatNumber(profit)}`);
        }
      }

      if (shortsEnabled && s.shortShares > 0 && s.forecast >= CFG.SHORT_SELL) {
        const price = ns.stock.sellShort(s.sym, s.shortShares);
        if (price > 0) {
          const value = price * s.shortShares;
          const profit = s.shortAvg * s.shortShares - value;
          ns.tprint(`💰 COVERED SHORT ${s.sym}: ${ns.formatNumber(value)} | Profit: ${ns.formatNumber(profit)}`);
        }
      }
    }

    let held = data.filter(s => s.longShares > 0 || s.shortShares > 0).length;

    data.sort((a, b) => Math.abs(b.forecast - 0.5) - Math.abs(a.forecast - 0.5));

    for (const s of data) {
      if (held >= CFG.MAX_POSITIONS) break;
      if (s.longShares > 0 || s.shortShares > 0) continue;

      const money = ns.getServerMoneyAvailable("home");
      const tradeBudget = Math.min(
        money * CFG.MAX_PER_STOCK,
        (money * (1 - CFG.RESERVE)) / Math.max(1, CFG.MAX_POSITIONS - held)
      );

      if (tradeBudget < CFG.MIN_TRADE_VALUE) continue;

      const shares = Math.min(
        s.maxShares,
        Math.floor(tradeBudget / s.price)
      );

      if (shares <= 0) continue;

      if (s.forecast >= CFG.LONG_BUY) {
        const price = ns.stock.buyStock(s.sym, shares);
        if (price > 0) {
          held++;
          ns.tprint(`📈 BOUGHT LONG ${s.sym}: ${ns.formatNumber(shares * price)} | F:${s.forecast.toFixed(3)}`);
        }
      } else if (shortsEnabled && s.forecast <= CFG.SHORT_BUY) {
        const price = ns.stock.shortStock(s.sym, shares);
        if (price > 0) {
          held++;
          ns.tprint(`📉 OPENED SHORT ${s.sym}: ${ns.formatNumber(shares * price)} | F:${s.forecast.toFixed(3)}`);
        }
      }
    }
  }
}

function canShort(ns) {
  const sym = ns.stock.getSymbols()[0];

  try {
    ns.stock.shortStock(sym, 0);
    return true;
  } catch {
    return false;
  }
}
