import { setLock, clearLock, getLock } from "lock-manager.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const CFG = {
    TARGET_SERVER: "joesguns",
    TARGET_STOCK: "JGN",

    HACK_SCRIPT: "stock-hack.js",
    GROW_SCRIPT: "stock-grow.js",
    WEAKEN_SCRIPT: "weaken2.js",

    OWNER: "market-controller",
    TTL: 90000,

    REFRESH_MS: 5000,
    ROOT_CHECK_MS: 30000,
    RAM_CHECK_MS: 30000,

    HOME_RESERVE_GB: 75,

    MIN_FREE_RAM_GB: 700000,
    MAX_RAM_USE_GB: 1100000,
    TRADE_COMMISSION: 100000,

    MONEY_HIGH: 0.90,
    MONEY_LOW: 0.30,
    SEC_BUFFER: 3.0,

    HACK_FRACTION: 0.25,
    GROW_BUFFER: 1.30,
    WEAKEN_BUFFER: 1.30,

    LONG_BUY: 0.55,
    LONG_SELL: 0.51,
    SHORT_BUY: 0.45,
    SHORT_SELL: 0.49,
  };

  const tradeTracker = {
    long: {},
    short: {},
    totalLongProfit: 0,
    totalShortProfit: 0,
  };

  ns.atExit(() => {
    clearLock(ns, CFG.TARGET_SERVER, CFG.OWNER);
    clearLock(ns, CFG.TARGET_STOCK, CFG.OWNER);
  });

  // ----------------- ROOT GATE -----------------
  ns.tprint(`⏳ Reserving ${CFG.TARGET_SERVER} / ${CFG.TARGET_STOCK} and waiting for root access...`);

  while (!ns.hasRootAccess(CFG.TARGET_SERVER)) {
    setLock(ns, CFG.TARGET_SERVER, CFG.OWNER, CFG.TTL, {
      type: "server",
      stock: CFG.TARGET_STOCK,
      status: "waiting-for-root",
    });

    setLock(ns, CFG.TARGET_STOCK, CFG.OWNER, CFG.TTL, {
      type: "stock",
      server: CFG.TARGET_SERVER,
      status: "waiting-for-root",
    });

    ns.clearLog();
    ns.print("=== MARKET CONTROLLER WAITING FOR ROOT ===");
    ns.print(`Target Server : ${CFG.TARGET_SERVER}`);
    ns.print(`Target Stock  : ${CFG.TARGET_STOCK}`);
    ns.print(`Root Access   : ${ns.hasRootAccess(CFG.TARGET_SERVER)}`);
    ns.print(`Next Check    : ${CFG.ROOT_CHECK_MS / 1000}s`);

    await ns.sleep(CFG.ROOT_CHECK_MS);
  }

  ns.tprint(`✅ Root access confirmed on ${CFG.TARGET_SERVER}.`);

  // ----------------- RAM GATE -----------------
  ns.tprint(`⏳ Waiting for ${ns.formatRam(CFG.MIN_FREE_RAM_GB)} free RAM before activation...`);

  while (getTotalFreeRam(ns, CFG.HOME_RESERVE_GB) < CFG.MIN_FREE_RAM_GB) {
    setLock(ns, CFG.TARGET_SERVER, CFG.OWNER, CFG.TTL, {
      type: "server",
      stock: CFG.TARGET_STOCK,
      status: "waiting-for-ram",
    });

    setLock(ns, CFG.TARGET_STOCK, CFG.OWNER, CFG.TTL, {
      type: "stock",
      server: CFG.TARGET_SERVER,
      status: "waiting-for-ram",
    });

    const freeRam = getTotalFreeRam(ns, CFG.HOME_RESERVE_GB);

    ns.clearLog();
    ns.print("=== MARKET CONTROLLER WAITING FOR RAM ===");
    ns.print(`Target Server : ${CFG.TARGET_SERVER}`);
    ns.print(`Target Stock  : ${CFG.TARGET_STOCK}`);
    ns.print(`Required RAM  : ${ns.formatRam(CFG.MIN_FREE_RAM_GB)}`);
    ns.print(`Free RAM      : ${ns.formatRam(freeRam)}`);
    ns.print(`Missing RAM   : ${ns.formatRam(Math.max(0, CFG.MIN_FREE_RAM_GB - freeRam))}`);
    ns.print(`Max Use Limit : ${ns.formatRam(CFG.MAX_RAM_USE_GB)}`);

    await ns.sleep(CFG.RAM_CHECK_MS);
  }

  ns.tprint(`✅ Enough free RAM detected. Starting Market Controller.`);
  ns.tprint(`RAM cap: ${ns.formatRam(CFG.MAX_RAM_USE_GB)}`);

  const shortsEnabled = (() => {
    try {
      ns.stock.shortStock(CFG.TARGET_STOCK, 0);
      return true;
    } catch {
      return false;
    }
  })();

  ns.tprint(`🚫 Market Controller active: ${CFG.TARGET_SERVER} / ${CFG.TARGET_STOCK}`);
  ns.tprint(`Manipulation + auto-trading. Shorts: ${shortsEnabled ? "ENABLED" : "DISABLED"}`);

  let mode = "DUMP";

  while (true) {
    setLock(ns, CFG.TARGET_SERVER, CFG.OWNER, CFG.TTL, {
      type: "server",
      stock: CFG.TARGET_STOCK,
      status: "active",
    });

    setLock(ns, CFG.TARGET_STOCK, CFG.OWNER, CFG.TTL, {
      type: "stock",
      server: CFG.TARGET_SERVER,
      status: "active",
    });

    const state = getState(ns, CFG);
    const hosts = getUsableHosts(ns, CFG.HOME_RESERVE_GB, CFG);

    if (
      isLockedByOther(ns, CFG.TARGET_SERVER, CFG.OWNER) ||
      isLockedByOther(ns, CFG.TARGET_STOCK, CFG.OWNER)
    ) {
      ns.print("Target locked by another owner. Waiting...");
      await ns.sleep(CFG.REFRESH_MS);
      continue;
    }

    if (state.secGap > CFG.SEC_BUFFER) {
      const weakenThreads = Math.ceil((state.secGap / ns.weakenAnalyze(1)) * CFG.WEAKEN_BUFFER);

      runDistributed(ns, hosts, CFG.WEAKEN_SCRIPT, CFG.TARGET_SERVER, 0, weakenThreads, "mc-weaken");

      printStatus(ns, CFG, state, mode, `WEAKEN ${weakenThreads}`, tradeTracker, hosts);
      await ns.sleep(CFG.REFRESH_MS);
      continue;
    }

    if (mode === "DUMP") {
      if (state.moneyRatio <= CFG.MONEY_LOW) {
        mode = "PUMP";
      } else {
        const hackThreads = calcHackThreads(ns, CFG.TARGET_SERVER, CFG.HACK_FRACTION);
        const weakenThreads = Math.ceil(
          (ns.hackAnalyzeSecurity(hackThreads, CFG.TARGET_SERVER) / ns.weakenAnalyze(1)) *
          CFG.WEAKEN_BUFFER
        );

        runDistributed(ns, hosts, CFG.HACK_SCRIPT, CFG.TARGET_SERVER, 0, hackThreads, "mc-dump-stock", true);

        runDistributed(
          ns,
          hosts,
          CFG.WEAKEN_SCRIPT,
          CFG.TARGET_SERVER,
          ns.getHackTime(CFG.TARGET_SERVER) + 200,
          weakenThreads,
          "mc-dump-weaken"
        );

        tryBuy(ns, CFG, tradeTracker);
        if (shortsEnabled) tryShort(ns, CFG, tradeTracker);

        printStatus(ns, CFG, state, mode, `STOCK-HACK ${hackThreads}`, tradeTracker, hosts);
      }
    }

    if (mode === "PUMP") {
      if (state.moneyRatio >= CFG.MONEY_HIGH) {
        mode = "DUMP";
      } else {
        const growThreads = calcGrowThreads(
          ns,
          CFG.TARGET_SERVER,
          state.money,
          state.maxMoney * CFG.MONEY_HIGH,
          CFG.GROW_BUFFER
        );

        const weakenThreads = Math.ceil(
          (ns.growthAnalyzeSecurity(growThreads, CFG.TARGET_SERVER) / ns.weakenAnalyze(1)) *
          CFG.WEAKEN_BUFFER
        );

        runDistributed(ns, hosts, CFG.GROW_SCRIPT, CFG.TARGET_SERVER, 0, growThreads, "mc-pump-stock", true);

        runDistributed(
          ns,
          hosts,
          CFG.WEAKEN_SCRIPT,
          CFG.TARGET_SERVER,
          ns.getGrowTime(CFG.TARGET_SERVER) + 200,
          weakenThreads,
          "mc-pump-weaken"
        );

        tryBuy(ns, CFG, tradeTracker);
        if (shortsEnabled) tryShort(ns, CFG, tradeTracker);

        printStatus(ns, CFG, state, mode, `STOCK-GROW ${growThreads}`, tradeTracker, hosts);
      }
    }

    await ns.sleep(CFG.REFRESH_MS);
  }
}

// ----------------- TRADING FUNCTIONS -----------------

function tryBuy(ns, CFG, tradeTracker) {
  const sym = CFG.TARGET_STOCK;
  const [longShares, longAvg] = ns.stock.getPosition(sym);
  const price = ns.stock.getPrice(sym);
  const forecast = ns.stock.getForecast(sym);

  if (forecast >= CFG.LONG_BUY && longShares === 0) {
    const maxShares = ns.stock.getMaxShares(sym);
    const shares = Math.min(maxShares, Math.floor((ns.getServerMoneyAvailable("home") * 0.2) / price));

    if (shares > 0) {
      ns.stock.buyStock(sym, shares);

      tradeTracker.long[sym] = {
        startedAt: Date.now(),
        buyPrice: price,
        shares,
        buyForecast: forecast,
      };

      ns.tprint(
        `📈 BUY LONG ${sym} | Shares: ${ns.formatNumber(shares)} | Price: ${ns.formatNumber(price)} | Value: ${ns.formatNumber(shares * price)} | Forecast: ${forecast.toFixed(3)}`
      );
    }
  } else if (longShares > 0 && forecast <= CFG.LONG_SELL) {
    const opened = tradeTracker.long[sym];
    const duration = opened ? formatDuration(Date.now() - opened.startedAt) : "unknown";

    const grossProfit = (price - longAvg) * longShares;
    const netProfit = grossProfit - CFG.TRADE_COMMISSION * 2;

    ns.stock.sellStock(sym, longShares);

    tradeTracker.totalLongProfit += netProfit;
    delete tradeTracker.long[sym];

    ns.tprint(
      `💰 SELL LONG ${sym} | Shares: ${ns.formatNumber(longShares)} | Buy Avg: ${ns.formatNumber(longAvg)} | Sell: ${ns.formatNumber(price)} | Gross: ${ns.formatNumber(grossProfit)} | Net: ${ns.formatNumber(netProfit)} | Held: ${duration} | Forecast: ${forecast.toFixed(3)}`
    );
  }
}

function tryShort(ns, CFG, tradeTracker) {
  const sym = CFG.TARGET_STOCK;
  const [, , shortShares, shortAvg] = ns.stock.getPosition(sym);
  const price = ns.stock.getPrice(sym);
  const forecast = ns.stock.getForecast(sym);

  if (forecast <= CFG.SHORT_BUY && shortShares === 0) {
    const maxShares = ns.stock.getMaxShares(sym);
    const shares = Math.min(maxShares, Math.floor((ns.getServerMoneyAvailable("home") * 0.2) / price));

    if (shares > 0) {
      ns.stock.shortStock(sym, shares);

      tradeTracker.short[sym] = {
        startedAt: Date.now(),
        shortPrice: price,
        shares,
        shortForecast: forecast,
      };

      ns.tprint(
        `📉 OPEN SHORT ${sym} | Shares: ${ns.formatNumber(shares)} | Price: ${ns.formatNumber(price)} | Value: ${ns.formatNumber(shares * price)} | Forecast: ${forecast.toFixed(3)}`
      );
    }
  } else if (shortShares > 0 && forecast >= CFG.SHORT_SELL) {
    const opened = tradeTracker.short[sym];
    const duration = opened ? formatDuration(Date.now() - opened.startedAt) : "unknown";

    const grossProfit = (shortAvg - price) * shortShares;
    const netProfit = grossProfit - CFG.TRADE_COMMISSION * 2;

    ns.stock.sellShort(sym, shortShares);

    tradeTracker.totalShortProfit += netProfit;
    delete tradeTracker.short[sym];

    ns.tprint(
      `💰 CLOSE SHORT ${sym} | Shares: ${ns.formatNumber(shortShares)} | Short Avg: ${ns.formatNumber(shortAvg)} | Cover: ${ns.formatNumber(price)} | Gross: ${ns.formatNumber(grossProfit)} | Net: ${ns.formatNumber(netProfit)} | Held: ${duration} | Forecast: ${forecast.toFixed(3)}`
    );
  }
}

// ----------------- CONTROLLER HELPERS -----------------

function isLockedByOther(ns, key, owner) {
  const lock = getLock(ns, key);
  return Boolean(lock && lock.owner !== owner);
}

function getState(ns, CFG) {
  const money = ns.getServerMoneyAvailable(CFG.TARGET_SERVER);
  const maxMoney = ns.getServerMaxMoney(CFG.TARGET_SERVER);
  const sec = ns.getServerSecurityLevel(CFG.TARGET_SERVER);
  const minSec = ns.getServerMinSecurityLevel(CFG.TARGET_SERVER);
  const forecast = ns.stock.getForecast(CFG.TARGET_STOCK);
  const price = ns.stock.getPrice(CFG.TARGET_STOCK);

  return {
    money,
    maxMoney,
    moneyRatio: maxMoney > 0 ? money / maxMoney : 0,
    sec,
    minSec,
    secGap: sec - minSec,
    forecast,
    price,
  };
}

function printStatus(ns, CFG, state, mode, action, tradeTracker, hosts) {
  const allocatedRam = hosts.reduce((sum, h) => sum + h.freeRam, 0);

  ns.clearLog();
  ns.print("=== MARKET CONTROLLER ===");
  ns.print(`Server  : ${CFG.TARGET_SERVER}`);
  ns.print(`Stock   : ${CFG.TARGET_STOCK}`);
  ns.print(`Mode    : ${mode}`);
  ns.print(`Action  : ${action}`);
  ns.print(`Money   : ${(state.moneyRatio * 100).toFixed(2)}%`);
  ns.print(`SecGap  : ${state.secGap.toFixed(3)}`);
  ns.print(`Forecast: ${state.forecast.toFixed(3)}`);
  ns.print(`Price   : ${ns.formatNumber(state.price)}`);
  ns.print("");
  ns.print("=== RAM BUDGET ===");
  ns.print(`Max Use : ${ns.formatRam(CFG.MAX_RAM_USE_GB)}`);
  ns.print(`Budget  : ${ns.formatRam(allocatedRam)}`);
  ns.print("");
  ns.print("=== TRADE TRACKING ===");
  ns.print(`Long Profit Total : ${ns.formatNumber(tradeTracker.totalLongProfit)}`);
  ns.print(`Short Profit Total: ${ns.formatNumber(tradeTracker.totalShortProfit)}`);

  const longOpen = tradeTracker.long[CFG.TARGET_STOCK];
  const shortOpen = tradeTracker.short[CFG.TARGET_STOCK];

  if (longOpen) {
    ns.print(
      `Open Long : ${ns.formatNumber(longOpen.shares)} shares | Entry: ${ns.formatNumber(longOpen.buyPrice)} | Held: ${formatDuration(Date.now() - longOpen.startedAt)}`
    );
  }

  if (shortOpen) {
    ns.print(
      `Open Short: ${ns.formatNumber(shortOpen.shares)} shares | Entry: ${ns.formatNumber(shortOpen.shortPrice)} | Held: ${formatDuration(Date.now() - shortOpen.startedAt)}`
    );
  }
}

function calcHackThreads(ns, target, fraction) {
  const perThread = ns.hackAnalyze(target);
  return Math.max(1, Math.floor(fraction / (perThread || 0.001)));
}

function calcGrowThreads(ns, target, currentMoney, targetMoney, buffer) {
  const cur = Math.max(1, currentMoney);
  const goal = Math.max(cur, targetMoney);
  if (goal <= cur) return 0;
  return Math.max(1, Math.ceil(ns.growthAnalyze(target, goal / cur) * buffer));
}

function getAllServers(ns) {
  const found = new Set(["home"]);
  const queue = ["home"];

  while (queue.length > 0) {
    const cur = queue.shift();

    for (const next of ns.scan(cur)) {
      if (!found.has(next)) {
        found.add(next);
        queue.push(next);
      }
    }
  }

  return [...found];
}

function getUsableHosts(ns, homeReserveGb, CFG) {
  const workerScripts = [
    CFG.HACK_SCRIPT,
    CFG.GROW_SCRIPT,
    CFG.WEAKEN_SCRIPT,
  ];

  let remainingRamBudget = CFG.MAX_RAM_USE_GB;

  return getAllServers(ns)
    .filter(h => ns.hasRootAccess(h))
    .filter(h => ns.getServerMaxRam(h) > 0)
    .map(h => {
      if (h !== "home") {
        ns.scp(workerScripts, h, "home");
      }

      const reserve = h === "home" ? homeReserveGb : 0;
      const realFreeRam = Math.max(0, ns.getServerMaxRam(h) - ns.getServerUsedRam(h) - reserve);
      const usableRam = Math.min(realFreeRam, remainingRamBudget);

      remainingRamBudget -= usableRam;

      return {
        name: h,
        freeRam: usableRam,
      };
    })
    .filter(h => h.freeRam > 2)
    .sort((a, b) => b.freeRam - a.freeRam);
}

function getTotalFreeRam(ns, homeReserveGb) {
  return getAllServers(ns)
    .filter(h => ns.hasRootAccess(h))
    .filter(h => ns.getServerMaxRam(h) > 0)
    .reduce((total, h) => {
      const reserve = h === "home" ? homeReserveGb : 0;
      const free = Math.max(0, ns.getServerMaxRam(h) - ns.getServerUsedRam(h) - reserve);
      return total + free;
    }, 0);
}

function runDistributed(ns, hosts, script, target, delay, totalThreads, tag, stock = false) {
  let remaining = totalThreads;
  const ram = ns.getScriptRam(script, "home");

  if (ram <= 0 || remaining <= 0) return false;

  for (const h of hosts) {
    if (remaining <= 0) break;

    const threads = Math.min(Math.floor(h.freeRam / ram), remaining);

    if (threads > 0) {
      const pid = ns.exec(script, h.name, threads, target, delay, tag, stock);

      if (pid !== 0) {
        remaining -= threads;
        h.freeRam -= threads * ram;
      }
    }
  }

  return remaining <= 0;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
