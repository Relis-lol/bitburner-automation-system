/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const CFG = {
    HACK_SCRIPT: "hack2.js",
    GROW_SCRIPT: "grow2.js",
    WEAKEN_SCRIPT: "weaken2.js",

    GLOBAL_FREE_RAM_SHARE: 0.05,
    HOME_RESERVE: 50,
    LOOP_MS: 1000,

    HEALTH_MONEY_TARGET: 0.94,
    HACK_MONEY_FLOOR: 0.60,
    RECOVER_MONEY_THRESHOLD: 0.70,

    HEALTH_SEC_BUFFER: 1.0,
    RECOVER_SEC_THRESHOLD: 2.5,

    FOCUS_COUNT: 8,
    BATCH_GAP: 200,

    MAX_BATCHES_PER_TARGET: 2,
    DESIRED_HACK_FRACTION: 0.018,
    MAX_ACTUAL_HACK_FRACTION: 0.035,
    BATCH_MONEY_SAFETY_FLOOR: 0.78,

    MIN_FREE_RAM_BUFFER: 0,

    AUX_MIN_NETWORK_RAM: 100,
    AUX_REPAIR_SHARE: 0.16,
    AUX_TITAN_SHARE: 0.05,

    SUPPORT_MIN_NETWORK_RAM: 100,
    SUPPORT_SHARE: 0.14,
    SUPPORT_SEC_THRESHOLD: 0.6,
    SUPPORT_MONEY_THRESHOLD: 0.92,
    SUPPORT_TARGET_MONEY: 0.98,

    LOG_EVERY: 5,
  };

  const ramHack = ns.getScriptRam(CFG.HACK_SCRIPT, "home");
  const ramGrow = ns.getScriptRam(CFG.GROW_SCRIPT, "home");
  const ramWeaken = ns.getScriptRam(CFG.WEAKEN_SCRIPT, "home");
  const minScriptRam = Math.min(ramHack, ramGrow, ramWeaken);

  if (ramHack === 0 || ramGrow === 0 || ramWeaken === 0) {
    ns.tprint("ERROR: hack2.js / grow2.js / weaken2.js missing on home.");
    return;
  }

  const hasFormulas = ns.fileExists("Formulas.exe", "home");
  const state = new Map();
  let loop = 0;

  while (true) {
    const now = Date.now();

    const allServers = discoverAllServers(ns);
    const rootedServers = allServers.filter(s => ns.hasRootAccess(s));

    const totalNetworkRam = rootedServers.reduce((sum, s) => sum + ns.getServerMaxRam(s), 0);
    const globalFreeRamReserve = Math.max(minScriptRam, totalNetworkRam * CFG.GLOBAL_FREE_RAM_SHARE);

    let hostsBase = buildHostPool(ns, allServers, minScriptRam, CFG);
    hostsBase = reserveGlobalRam(hostsBase, globalFreeRamReserve);

    const targets = allServers
      .filter(s => s !== "home")
      .filter(s => ns.hasRootAccess(s))
      .filter(s => ns.getServerMaxMoney(s) > 0)
      .filter(s => ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel());

    purgeState(state, now);

    const metrics = targets.map(target => {
      const health = getHealth(ns, target, CFG);
      const score = scoreTarget(ns, target, health, hasFormulas);
      const tState = getState(state, target);

      if (
        health.moneyRatio < CFG.RECOVER_MONEY_THRESHOLD ||
        health.secDelta > CFG.RECOVER_SEC_THRESHOLD
      ) {
        tState.recovering = true;
      } else if (
        tState.recovering &&
        health.moneyRatio >= CFG.HEALTH_MONEY_TARGET &&
        health.secDelta <= CFG.HEALTH_SEC_BUFFER
      ) {
        tState.recovering = false;
      }

      return { target, health, score, state: tState };
    }).sort((a, b) => b.score - a.score);

    const focusTargets = selectFocusTargets(metrics, CFG.FOCUS_COUNT);
    const focusSet = new Set(focusTargets);

    let mainHosts = cloneHosts(hostsBase);
    let repairHosts = [];
    let titanHosts = [];
    let supportHosts = [];

    if (totalNetworkRam >= CFG.AUX_MIN_NETWORK_RAM) {
      const repairBudget = totalNetworkRam * CFG.AUX_REPAIR_SHARE;
      const titanBudget = totalNetworkRam * CFG.AUX_TITAN_SHARE;

      repairHosts = allocateBudgetPool(mainHosts, repairBudget, minScriptRam);
      titanHosts = allocateBudgetPool(mainHosts, titanBudget, minScriptRam);
    }

    if (totalNetworkRam >= CFG.SUPPORT_MIN_NETWORK_RAM) {
      const supportBudget = totalNetworkRam * CFG.SUPPORT_SHARE;
      supportHosts = allocateBudgetPool(mainHosts, supportBudget, minScriptRam);
    }

    const recoveryOrder = [...metrics].sort((a, b) => {
      const af = focusSet.has(a.target) ? 1 : 0;
      const bf = focusSet.has(b.target) ? 1 : 0;
      if (af !== bf) return bf - af;

      const ac = a.health.critical ? 1 : 0;
      const bc = b.health.critical ? 1 : 0;
      if (ac !== bc) return bc - ac;

      if (a.health.secDelta !== b.health.secDelta) return b.health.secDelta - a.health.secDelta;
      return a.health.moneyRatio - b.health.moneyRatio;
    });

    for (const entry of recoveryOrder) {
      if (totalFreeRam(mainHosts) < minScriptRam) break;
      const aggressive = focusSet.has(entry.target);

      tryRecovery(
        ns,
        entry.target,
        entry.health,
        entry.state,
        mainHosts,
        CFG,
        { hack: ramHack, grow: ramGrow, weaken: ramWeaken },
        hasFormulas,
        aggressive
      );
    }

    for (const target of focusTargets) {
      const tState = getState(state, target);
      const health = getHealth(ns, target, CFG);

      if (tState.recovering) continue;
      if (health.moneyRatio < CFG.HEALTH_MONEY_TARGET) continue;
      if (health.secDelta > CFG.HEALTH_SEC_BUFFER) continue;

      while (totalFreeRam(mainHosts) >= minScriptRam + CFG.MIN_FREE_RAM_BUFFER) {
        const launched = tryBusinessBatch(
          ns,
          target,
          tState,
          mainHosts,
          CFG,
          { hack: ramHack, grow: ramGrow, weaken: ramWeaken },
          hasFormulas
        );
        if (!launched) break;
      }
    }

    let supportActions = 0;
    if (supportHosts.length > 0) {
      const focusSupportMetrics = metrics
        .filter(m => focusSet.has(m.target))
        .filter(m =>
          m.health.moneyRatio < CFG.SUPPORT_MONEY_THRESHOLD ||
          m.health.secDelta > CFG.SUPPORT_SEC_THRESHOLD
        )
        .sort((a, b) => {
          const aPressure = (1 - a.health.moneyRatio) * 100 + a.health.secDelta * 10;
          const bPressure = (1 - b.health.moneyRatio) * 100 + b.health.secDelta * 10;
          return bPressure - aPressure;
        });

      for (const entry of focusSupportMetrics) {
        if (totalFreeRam(supportHosts) < minScriptRam) break;

        const st = getState(state, entry.target);
        if (now < st.nextSupportAt) continue;

        const h = entry.health;
        const target = entry.target;

        if (h.secDelta > CFG.SUPPORT_SEC_THRESHOLD) {
          const weakenThreads = Math.ceil(h.secDelta / ns.weakenAnalyze(1));
          const ok = runPhaseDistributed(
            ns,
            supportHosts,
            CFG.WEAKEN_SCRIPT,
            ramWeaken,
            weakenThreads,
            target,
            0,
            "supW"
          );

          if (ok) {
            st.nextSupportAt = now + ns.getWeakenTime(target) + 500;
            supportActions++;
            continue;
          }
        }

        if (h.moneyRatio < CFG.SUPPORT_MONEY_THRESHOLD && totalFreeRam(supportHosts) >= minScriptRam) {
          const desiredMoney = h.maxMoney * CFG.SUPPORT_TARGET_MONEY;
          let growThreads = calcGrowThreads(
            ns,
            target,
            h.money,
            desiredMoney,
            hasFormulas
          );
          if (growThreads < 1) growThreads = 1;

          const growSec = ns.growthAnalyzeSecurity(growThreads, target, 1);
          const weakenThreads = Math.ceil(growSec / ns.weakenAnalyze(1));

          const weakenTime = ns.getWeakenTime(target);
          const growTime = ns.getGrowTime(target);
          const growDelay = Math.max(0, weakenTime - growTime - 150);

          const plan = planPhases(supportHosts, [
            { script: CFG.WEAKEN_SCRIPT, ram: ramWeaken, threads: weakenThreads, delay: 0, tag: "supW" },
            { script: CFG.GROW_SCRIPT, ram: ramGrow, threads: growThreads, delay: growDelay, tag: "supG" },
          ], target);

          if (plan && execPlan(ns, plan)) {
            st.nextSupportAt = now + weakenTime + 500;
            supportActions++;
          }
        }
      }
    }

    let repairActions = 0;
    if (repairHosts.length > 0) {
      const nonFocusMetrics = metrics.filter(m => !focusSet.has(m.target));

      for (const entry of nonFocusMetrics) {
        if (totalFreeRam(repairHosts) < minScriptRam) break;

        const st = getState(state, entry.target);
        if (now < st.nextRepairAt) continue;

        const h = entry.health;
        if (!h.needsMoney && !h.needsSec) continue;

        if (h.secDelta > 1.0) {
          const weakenThreads = Math.ceil(h.secDelta / ns.weakenAnalyze(1));
          const ok = runPhaseDistributed(
            ns,
            repairHosts,
            CFG.WEAKEN_SCRIPT,
            ramWeaken,
            weakenThreads,
            entry.target,
            0,
            "auxW"
          );

          if (ok) {
            st.nextRepairAt = now + ns.getWeakenTime(entry.target) + 500;
            repairActions++;
          }
        } else if (h.moneyRatio < 0.90) {
          const desiredMoney = h.maxMoney * 0.94;
          let growThreads = calcGrowThreads(
            ns,
            entry.target,
            h.money,
            desiredMoney,
            hasFormulas
          );
          if (growThreads < 1) growThreads = 1;

          const growSec = ns.growthAnalyzeSecurity(growThreads, entry.target, 1);
          const weakenThreads = Math.ceil(growSec / ns.weakenAnalyze(1));

          const weakenTime = ns.getWeakenTime(entry.target);
          const growTime = ns.getGrowTime(entry.target);
          const growDelay = Math.max(0, weakenTime - growTime - 150);

          const plan = planPhases(repairHosts, [
            { script: CFG.WEAKEN_SCRIPT, ram: ramWeaken, threads: weakenThreads, delay: 0, tag: "auxW" },
            { script: CFG.GROW_SCRIPT, ram: ramGrow, threads: growThreads, delay: growDelay, tag: "auxG" },
          ], entry.target);

          if (plan && execPlan(ns, plan)) {
            st.nextRepairAt = now + weakenTime + 500;
            repairActions++;
          }
        }
      }
    }

    if (repairHosts.length > 0 && totalFreeRam(repairHosts) >= minScriptRam) {
      mergeHostPools(titanHosts, repairHosts);
    }

    let titanActions = 0;
    if (titanHosts.length > 0 && totalFreeRam(titanHosts) >= minScriptRam) {
      const titanTargets = targets
        .filter(t => !focusSet.has(t))
        .sort((a, b) => {
          const aMax = ns.getServerMaxMoney(a);
          const bMax = ns.getServerMaxMoney(b);
          const aCur = Math.max(1, ns.getServerMoneyAvailable(a));
          const bCur = Math.max(1, ns.getServerMoneyAvailable(b));
          return (bMax * (bCur / bMax)) - (aMax * (aCur / aMax));
        });

      for (const host of titanHosts) {
        let freeRam = host.freeRam;
        if (freeRam < minScriptRam) continue;

        let threads = Math.floor(freeRam / minScriptRam);
        if (threads < 1) continue;

        let target = titanTargets[0];
        if (!target) break;

        if (
          !host.host.startsWith("serv-") &&
          host.host !== "home" &&
          ns.getServerMaxMoney(host.host) > 0 &&
          !focusSet.has(host.host)
        ) {
          target = host.host;
        }

        const st = getState(state, target);
        if (now < st.nextTitanAt) continue;

        const tMax = ns.getServerMaxMoney(target);
        const tCur = ns.getServerMoneyAvailable(target);
        const tMin = ns.getServerMinSecurityLevel(target);
        const tSec = ns.getServerSecurityLevel(target);

        if (tSec > tMin + 1) {
          const pid = ns.exec(CFG.WEAKEN_SCRIPT, host.host, threads, target, 0, "titanW");
          if (pid !== 0) {
            host.freeRam -= threads * ramWeaken;
            st.nextTitanAt = now + ns.getWeakenTime(target) + 500;
            titanActions++;
          }
          continue;
        }

        if (tCur < tMax * 0.85) {
          const pid = ns.exec(CFG.GROW_SCRIPT, host.host, threads, target, 0, "titanG");
          if (pid !== 0) {
            host.freeRam -= threads * ramGrow;
            st.nextTitanAt = now + ns.getGrowTime(target) + 500;
            titanActions++;
          }
          continue;
        }

        let hackThreads = Math.floor(ns.hackAnalyzeThreads(target, Math.max(1, tCur * 0.025)));
        if (hackThreads < 1) hackThreads = 1;
        if (hackThreads > threads) hackThreads = threads;

        const pidHack = ns.exec(CFG.HACK_SCRIPT, host.host, hackThreads, target, 0, "titanH");
        if (pidHack !== 0) {
          host.freeRam -= hackThreads * ramHack;
          st.nextTitanAt = now + ns.getHackTime(target) + 500;
          titanActions++;
        }

        const remaining = Math.floor(host.freeRam / ramWeaken);
        if (remaining > 0) {
          const pidWeak = ns.exec(CFG.WEAKEN_SCRIPT, host.host, remaining, target, 0, "titanW2");
          if (pidWeak !== 0) {
            host.freeRam -= remaining * ramWeaken;
            st.nextTitanAt = Math.max(st.nextTitanAt, now + ns.getWeakenTime(target) + 500);
            titanActions++;
          }
        }
      }
    }

    if (loop % CFG.LOG_EVERY === 0) {
      const unhealthy = metrics.filter(m => m.health.needsMoney || m.health.needsSec).length;
      ns.clearLog();
      ns.print(`focus=${focusTargets.join(", ") || "-"} | targets=${targets.length} | unhealthy=${unhealthy}`);
      ns.print(`mainFree=${formatGb(totalFreeRam(mainHosts))} | netRam=${formatGb(totalNetworkRam)} | reserve=${formatGb(globalFreeRamReserve)}`);
      ns.print(`support=${supportActions} | repair=${repairActions} | titan=${titanActions}`);
      ns.print(`supportFree=${formatGb(totalFreeRam(supportHosts))} | repairFree=${formatGb(totalFreeRam(repairHosts))} | titanFree=${formatGb(totalFreeRam(titanHosts))}`);
    }

    loop++;
    await ns.sleep(CFG.LOOP_MS);
  }
}

function discoverAllServers(ns) {
  const seen = new Set(["home"]);
  const queue = ["home"];

  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of ns.scan(current)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return [...seen];
}

function buildHostPool(ns, allServers, minScriptRam, CFG) {
  const hosts = [];

  for (const host of allServers) {
    if (!ns.hasRootAccess(host)) continue;

    const maxRam = ns.getServerMaxRam(host);
    if (maxRam < minScriptRam) continue;

    let freeRam = maxRam - ns.getServerUsedRam(host);
    if (host === "home") freeRam -= CFG.HOME_RESERVE;

    if (freeRam < minScriptRam) continue;

    hosts.push({ host, freeRam });
  }

  hosts.sort((a, b) => b.freeRam - a.freeRam);
  return hosts;
}

function reserveGlobalRam(hosts, reserveRam) {
  let remaining = reserveRam;
  const out = hosts.map(h => ({ ...h }));

  out.sort((a, b) => a.freeRam - b.freeRam);

  for (const host of out) {
    if (remaining <= 0) break;

    const take = Math.min(host.freeRam, remaining);
    host.freeRam -= take;
    remaining -= take;
  }

  return out
    .filter(h => h.freeRam > 0)
    .sort((a, b) => b.freeRam - a.freeRam);
}

function cloneHosts(hosts) {
  return hosts.map(h => ({ host: h.host, freeRam: h.freeRam }));
}

function allocateBudgetPool(mainHosts, budgetRam, minScriptRam) {
  const pool = [];
  let remainingBudget = budgetRam;

  for (const host of mainHosts) {
    if (remainingBudget < minScriptRam) break;
    if (host.freeRam < minScriptRam) continue;

    const take = Math.min(host.freeRam, remainingBudget);
    if (take < minScriptRam) continue;

    host.freeRam -= take;
    pool.push({ host: host.host, freeRam: take });
    remainingBudget -= take;
  }

  return pool;
}

function mergeHostPools(targetPool, sourcePool) {
  for (const src of sourcePool) {
    if (src.freeRam <= 0) continue;

    const existing = targetPool.find(h => h.host === src.host);
    if (existing) {
      existing.freeRam += src.freeRam;
    } else {
      targetPool.push({ host: src.host, freeRam: src.freeRam });
    }
    src.freeRam = 0;
  }

  targetPool.sort((a, b) => b.freeRam - a.freeRam);
}

function getHealth(ns, target, CFG) {
  const maxMoney = ns.getServerMaxMoney(target);
  const money = Math.max(0, ns.getServerMoneyAvailable(target));
  const minSec = ns.getServerMinSecurityLevel(target);
  const sec = ns.getServerSecurityLevel(target);

  const moneyRatio = maxMoney > 0 ? money / maxMoney : 0;
  const secDelta = Math.max(0, sec - minSec);

  return {
    maxMoney,
    money,
    minSec,
    sec,
    moneyRatio,
    secDelta,
    critical:
      moneyRatio < CFG.RECOVER_MONEY_THRESHOLD ||
      secDelta > CFG.RECOVER_SEC_THRESHOLD,
    needsMoney: moneyRatio < CFG.HEALTH_MONEY_TARGET,
    needsSec: secDelta > CFG.HEALTH_SEC_BUFFER,
  };
}

function scoreTarget(ns, target, health, hasFormulas) {
  let hackPct = ns.hackAnalyze(target);
  const chance = ns.hackAnalyzeChance(target);
  const hackTime = Math.max(1, ns.getHackTime(target));

  if (hasFormulas) {
    try {
      const server = ns.getServer(target);
      server.hackDifficulty = server.minDifficulty;
      server.moneyAvailable = server.moneyMax;
      hackPct = ns.formulas.hacking.hackPercent(server, ns.getPlayer());
    } catch { }
  }

  return health.maxMoney * Math.max(0, chance) * Math.max(0, hackPct) / hackTime;
}

function selectFocusTargets(metrics, count) {
  const healthy = metrics.filter(m => !m.state.recovering);
  const out = [];

  for (const m of healthy) {
    out.push(m.target);
    if (out.length >= count) return out;
  }

  for (const m of metrics) {
    if (!out.includes(m.target)) {
      out.push(m.target);
      if (out.length >= count) return out;
    }
  }

  return out;
}

function getState(stateMap, target) {
  if (!stateMap.has(target)) {
    stateMap.set(target, {
      recovering: false,
      nextRecoveryAt: 0,
      nextBatchAnchor: 0,
      nextSupportAt: 0,
      nextRepairAt: 0,
      nextTitanAt: 0,
      inflight: [],
    });
  }
  return stateMap.get(target);
}

function purgeState(stateMap, now) {
  for (const st of stateMap.values()) {
    st.inflight = st.inflight.filter(x => x.completeAt > now);
  }
}

function tryRecovery(ns, target, health, tState, hosts, CFG, ram, hasFormulas, aggressive) {
  const now = Date.now();
  if (now < tState.nextRecoveryAt) return false;

  const weakenPower = ns.weakenAnalyze(1);

  if (health.secDelta > CFG.HEALTH_SEC_BUFFER) {
    const weakenThreads = Math.ceil(health.secDelta / weakenPower);
    const ok = runPhaseDistributed(ns, hosts, CFG.WEAKEN_SCRIPT, ram.weaken, weakenThreads, target, 0, "prepW");
    if (!ok) return false;

    tState.nextRecoveryAt = now + ns.getWeakenTime(target) + 50;
    return true;
  }

  const desiredMoneyRatio = aggressive ? 0.98 : CFG.HEALTH_MONEY_TARGET;
  if (health.moneyRatio < desiredMoneyRatio) {
    let growThreads = calcGrowThreads(
      ns,
      target,
      health.money,
      health.maxMoney * desiredMoneyRatio,
      hasFormulas
    );

    if (growThreads < 1) growThreads = 1;

    const growSec = ns.growthAnalyzeSecurity(growThreads, target, 1);
    const weakenThreads = Math.ceil(growSec / weakenPower);

    const weakenTime = ns.getWeakenTime(target);
    const growTime = ns.getGrowTime(target);
    const growDelay = Math.max(0, weakenTime - growTime - CFG.BATCH_GAP);

    const plan = planPhases(hosts, [
      { script: CFG.WEAKEN_SCRIPT, ram: ram.weaken, threads: weakenThreads, delay: 0, tag: "prepW" },
      { script: CFG.GROW_SCRIPT, ram: ram.grow, threads: growThreads, delay: growDelay, tag: "prepG" },
    ], target);

    if (!plan) return false;
    if (!execPlan(ns, plan)) return false;

    tState.nextRecoveryAt = now + ns.getWeakenTime(target) + CFG.BATCH_GAP + 50;
    return true;
  }

  return false;
}

function tryBusinessBatch(ns, target, tState, hosts, CFG, ram, hasFormulas) {
  const now = Date.now();
  tState.inflight = tState.inflight.filter(x => x.completeAt > now);

  const health = getHealth(ns, target, CFG);

  if (health.moneyRatio < CFG.HEALTH_MONEY_TARGET) return false;
  if (health.secDelta > CFG.HEALTH_SEC_BUFFER) return false;

  const hackPctPerThread = calcHackPctPerThread(ns, target, hasFormulas);
  if (!Number.isFinite(hackPctPerThread) || hackPctPerThread <= 0) return false;

  let hackThreads = Math.floor(CFG.DESIRED_HACK_FRACTION / hackPctPerThread);
  if (hackThreads < 1) hackThreads = 1;

  const actualHackPct = hackThreads * hackPctPerThread;

  if (actualHackPct > CFG.MAX_ACTUAL_HACK_FRACTION) return false;

  const inflightDrain = tState.inflight.reduce((sum, x) => sum + (x.hackPct || 0), 0);
  const projectedMoneyRatio = health.moneyRatio - inflightDrain - actualHackPct;

  if (projectedMoneyRatio < CFG.BATCH_MONEY_SAFETY_FLOOR) return false;

  const softConcurrent = Math.max(
    1,
    Math.floor((health.moneyRatio - CFG.BATCH_MONEY_SAFETY_FLOOR) / actualHackPct)
  );
  const maxConcurrent = Math.min(CFG.MAX_BATCHES_PER_TARGET, softConcurrent);

  if (tState.inflight.length >= maxConcurrent) return false;

  const maxMoney = ns.getServerMaxMoney(target);
  const postHackMoney = Math.max(1, maxMoney * (1 - actualHackPct));
  const growThreads = calcGrowThreads(ns, target, postHackMoney, maxMoney, hasFormulas);
  if (growThreads < 1) return false;

  const weakenPower = ns.weakenAnalyze(1);
  const weakenHackThreads = Math.ceil(ns.hackAnalyzeSecurity(hackThreads, target) / weakenPower);
  const weakenGrowThreads = Math.ceil(ns.growthAnalyzeSecurity(growThreads, target, 1) / weakenPower);

  const hackTime = ns.getHackTime(target);
  const growTime = ns.getGrowTime(target);
  const weakenTime = ns.getWeakenTime(target);

  const anchor = Math.max(now + weakenTime + 25, tState.nextBatchAnchor);

  const phases = [
    {
      script: CFG.HACK_SCRIPT,
      ram: ram.hack,
      threads: hackThreads,
      delay: Math.max(0, anchor - now - hackTime - CFG.BATCH_GAP),
      tag: "H",
    },
    {
      script: CFG.WEAKEN_SCRIPT,
      ram: ram.weaken,
      threads: weakenHackThreads,
      delay: Math.max(0, anchor - now - weakenTime),
      tag: "W1",
    },
    {
      script: CFG.GROW_SCRIPT,
      ram: ram.grow,
      threads: growThreads,
      delay: Math.max(0, anchor - now - growTime + CFG.BATCH_GAP),
      tag: "G",
    },
    {
      script: CFG.WEAKEN_SCRIPT,
      ram: ram.weaken,
      threads: weakenGrowThreads,
      delay: Math.max(0, anchor - now - weakenTime + 2 * CFG.BATCH_GAP),
      tag: "W2",
    },
  ];

  const plan = planPhases(hosts, phases, target);
  if (!plan) return false;
  if (!execPlan(ns, plan)) return false;

  tState.nextBatchAnchor = anchor + 4 * CFG.BATCH_GAP;

  tState.inflight.push({
    completeAt: anchor + 2 * CFG.BATCH_GAP,
    hackPct: actualHackPct,
  });

  return true;
}

function calcHackPctPerThread(ns, target, hasFormulas) {
  if (!hasFormulas) return ns.hackAnalyze(target);

  try {
    const server = ns.getServer(target);
    server.hackDifficulty = server.minDifficulty;
    server.moneyAvailable = server.moneyMax;
    return ns.formulas.hacking.hackPercent(server, ns.getPlayer());
  } catch {
    return ns.hackAnalyze(target);
  }
}

function calcGrowThreads(ns, target, currentMoney, targetMoney, hasFormulas) {
  const safeCurrent = Math.max(1, currentMoney);
  const safeTarget = Math.max(safeCurrent, targetMoney);

  if (safeTarget <= safeCurrent) return 0;

  if (hasFormulas) {
    try {
      const server = ns.getServer(target);
      server.hackDifficulty = server.minDifficulty;
      server.moneyAvailable = safeCurrent;
      return Math.ceil(ns.formulas.hacking.growThreads(server, ns.getPlayer(), safeTarget, 1));
    } catch { }
  }

  const mult = Math.max(1.0000001, safeTarget / safeCurrent);
  return Math.ceil(ns.growthAnalyze(target, mult, 1));
}

function runPhaseDistributed(ns, hosts, script, ramPerThread, totalThreads, target, delay, tag) {
  let remaining = totalThreads;

  for (const host of hosts) {
    const maxThreads = Math.floor(host.freeRam / ramPerThread);
    if (maxThreads <= 0) continue;

    const take = Math.min(maxThreads, remaining);
    if (take <= 0) continue;

    const pid = ns.exec(script, host.host, take, target, delay, tag);
    if (pid === 0) continue;

    host.freeRam -= take * ramPerThread;
    remaining -= take;

    if (remaining <= 0) return true;
  }

  return remaining <= 0;
}

function planPhases(hosts, phases, target) {
  const sim = hosts.map(h => ({ ...h }));
  const plan = [];

  for (const phase of phases) {
    let remaining = phase.threads;
    if (!remaining || remaining <= 0) continue;

    for (const host of sim) {
      const possible = Math.floor(host.freeRam / phase.ram);
      if (possible <= 0) continue;

      const take = Math.min(possible, remaining);
      if (take <= 0) continue;

      host.freeRam -= take * phase.ram;
      remaining -= take;

      plan.push({
        host: host.host,
        script: phase.script,
        threads: take,
        target,
        delay: phase.delay,
        tag: phase.tag,
      });

      if (remaining <= 0) break;
    }

    if (remaining > 0) return null;
  }

  for (const h of sim) {
    const real = hosts.find(x => x.host === h.host);
    real.freeRam = h.freeRam;
  }

  return plan;
}

function execPlan(ns, plan) {
  for (const p of plan) {
    const pid = ns.exec(p.script, p.host, p.threads, p.target, Math.floor(p.delay), p.tag);
    if (pid === 0) return false;
  }
  return true;
}

function totalFreeRam(hosts) {
  return hosts.reduce((sum, h) => sum + h.freeRam, 0);
}

function formatGb(v) {
  return `${Math.round(v * 10) / 10}GB`;
}
