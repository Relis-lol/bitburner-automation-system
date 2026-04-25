/** @param {NS} ns **/
export async function main(ns) {

  // Thresholds for trading
  const LONG_BUY = 0.62;  
  const LONG_SELL = 0.55; 

  // Risk management settings
  const MAX_POSITIONS = 6;    
  const RESERVE = 0.20;       
  const MAX_PER_STOCK = 0.25; 

  try {
    ns.stock.getForecast(ns.stock.getSymbols()[0]);
  } catch (e) {
    ns.tprint("ERROR: 4S Market Data TIX API missing.");
    return;
  }

  ns.tprint("✅ Stock Trader started (Long-only)");

  const symbols = ns.stock.getSymbols();

  while (true) {
    await ns.stock.nextUpdate();

    const data = symbols.map(sym => {
      const [shares, avgPrice] = ns.stock.getPosition(sym);
      return {
        sym,
        forecast: ns.stock.getForecast(sym),
        price: ns.stock.getPrice(sym),
        maxShares: ns.stock.getMaxShares(sym),
        shares,
        avgPrice
      };
    });

    // ---- PHASE 1: SELL ----
    for (const s of data) {
      if (s.shares > 0 && s.forecast <= LONG_SELL) {
        const sellPrice = ns.stock.sellStock(s.sym, s.shares);
        if (sellPrice > 0) {
          const totalValue = sellPrice * s.shares;
          const profit = totalValue - (s.avgPrice * s.shares);
          
          // Terminal Output for Sales
          ns.tprint(`💰 SOLD ${s.sym}: ${ns.formatNumber(totalValue)} (Profit: ${ns.formatNumber(profit)})`);
        }
      }
    }

    // ---- PHASE 2: BUY ----
    let held = data.filter(s => s.shares > 0).length;
    let money = ns.getServerMoneyAvailable("home");
    let totalBudget = money * (1 - RESERVE);

    data.sort((a, b) => b.forecast - a.forecast);

    for (const s of data) {
      if (held >= MAX_POSITIONS) break;
      if (s.shares > 0) continue;
      if (s.forecast < LONG_BUY) continue;

      money = ns.getServerMoneyAvailable("home");
      const remainingSlots = Math.max(1, MAX_POSITIONS - held);
      const perPositionBudget = totalBudget / remainingSlots;

      const budget = Math.min(perPositionBudget, money * MAX_PER_STOCK);
      const sharesToBuy = Math.min(
        s.maxShares,
        Math.floor(budget / s.price)
      );

      if (sharesToBuy > 0) {
        const buyPrice = ns.stock.buyStock(s.sym, sharesToBuy);
        if (buyPrice > 0) {
          held++;
          // Terminal Output for Buys
          ns.tprint(`📈 BOUGHT ${s.sym}: ${ns.formatNumber(sharesToBuy * buyPrice)}`);
        }
      }
    }
  }
}
