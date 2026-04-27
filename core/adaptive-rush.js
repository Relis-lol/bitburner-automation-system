/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const CFG = {
    TARGET_HL: 450,

    XP_TO_PREP_HL: 90,
    PREP_TO_BRIDGE_HL: 180,

    HOME_RESERVE: 32,
    LOOP_MS: 1500,
    ROOT_INTERVAL_MS: 10000,
    BATCH_GAP_MS: 200,

    MONEY_TARGET: 0.995,
    PREP_SEC_BUFFER: 0.05,

    BRIDGE_READY_MONEY: 0.95,
    BRIDGE_SEC_BUFFER: 0.5,
    BRIDGE_HACK_FRACTION: 0.05,

    XP_MAX_TARGETS: 2,
    XP_SEC_SOFTCAP: 1.5,

    PREP_MAX_TARGETS_PER_LOOP: 24,
    BRIDGE_MAX_TARGETS_PER_LOOP: 8,

    MAX_ACTIVE_JOBS_PER_TARGET: 6,

    WORKERS: {
      HACK: "/adaptive/hack-worker.js",
      GROW: "/adaptive/grow-worker.js",
      WEAKEN: "/adaptive/weaken-worker.js",
    },
  };

  let lastRootCheck = 0;

  ensureWorkers(ns, CFG.WORKERS);

  const RAM = {
    hack: ns.getScriptRam(CFG.WORKERS.HACK, "home"),
    grow: ns.getScriptRam(CFG.WORKERS.GROW, "home"),
    weaken: ns.getScriptRam(CFG.WORKERS.WEAKEN, "home"),
  };

  const minWorkerRam = Math.min(RAM.hack, RAM.grow, RAM.weaken);

  if (minWorkerRam <= 0) {
    ns.tprint("ERROR: Worker scripts could not be created.");
    return;
  }

  ns.tprint("=== ADAPTIVE RUSH STARTED ===");

  while (true) {
    const hl = ns.getHackingLevel();

    if (hl >= CFG.TARGET_HL) {
      await handoffToMainSystem(ns, CFG);
      return;
    }

    const allServers = discoverAllServers(ns);

    const now = Date.now();
    let newRoots = 0;

    if (now - lastRootCheck >= CFG.ROOT_INTERVAL_MS) {
      newRoots = autoRoot(ns, allServers);
      lastRootCheck = now;
    }

    const rooted = allServers.filter((s) => ns.hasRootAccess(s));
    const hosts = buildHostPool(ns, rooted, minWorkerRam, CFG);

    deployWorkers(ns, hosts, Object.values(CFG.WORKERS));

    const targets = rooted
      .filter((s) => s !== "home")
      .filter((s) => ns.getServerMaxMoney(s) > 0)
      .filter((s) => ns.getServerRequiredHackingLevel(s) <= hl)
      .map((s) => getTargetState(ns, s));

    const phase = phaseManager(ns, hl, hosts, targets, CFG);

    let actions = 0;

    if (phase === "xp") {
      actions = runXpPhase(ns, hosts, targets, RAM, CFG);
    } else if (phase === "prep") {
      actions = runPrepPhase(ns, hosts, targets, RAM, CFG);
    } else {
      actions = runBridgePhase(ns, hosts, targets, RAM, CFG);
    }

    render(ns, {
      phase,
      hl,
      actions,
      newRoots,
      rootedCount: rooted.length,
      targetCount: targets.length,
      freeRam: totalFreeRam(hosts),
      usedRam: rooted.reduce((sum, s) => sum + ns.getServerUsedRam(s), 0),
      maxRam: rooted.reduce((sum, s) => sum + ns.getServerMaxRam(s), 0),
      xpRate: ns.getTotalScriptExpGain(),
      incomeRate: ns.getTotalScriptIncome()[0],
      prepBacklog: targets.filter(
        (t) => t.moneyRatio < CFG.MONEY_TARGET || t.secDelta > CFG.PREP_SEC_BUFFER
      ).length,
    });

    await ns.sleep(CFG.LOOP_MS);
  }
}

async function handoffToMainSystem(ns, CFG) {
  ns.tprint(`HL ${ns.getHackingLevel()} reached. Starting main system handoff.`);

  const allServers = discoverAllServers(ns);

  for (const server of allServers) {
    if (server !== "home" && ns.hasRootAccess(server)) {
      ns.killall(server);
    }
  }

  ns.killall("home", true);

  ns.run("prep-all.js", 1);
  await ns.sleep(500);
  ns.run("notes.js", 1);
  await ns.sleep(500);

  ns.tprint("Main system started. Adaptive rush stopping now.");
}

function ensureWorkers(ns, workers) {
  const makeWorker = (op) => `
/** @param {NS} ns **/
export async function main(ns) {
  const target = String(ns.args[0]);
  const delay = Number(ns.args[1] || 0);
  if (delay > 0) await ns.sleep(delay);
  await ns.${op}(target);
}
`;

  ns.write(workers.HACK, makeWorker("hack"), "w");
  ns.write(workers.GROW, makeWorker("grow"), "w");
  ns.write(workers.WEAKEN, makeWorker("weaken"), "w");
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

function autoRoot(ns, servers) {
  let rooted = 0;

  for (const server of servers) {
    if (server === "home") continue;
    if (ns.hasRootAccess(server)) continue;

    let ports = 0;

    if (ns.fileExists("BruteSSH.exe", "home")) {
      ns.brutessh(server);
      ports++;
    }

    if (ns.fileExists("FTPCrack.exe", "home")) {
      ns.ftpcrack(server);
      ports++;
    }

    if (ns.fileExists("relaySMTP.exe", "home")) {
      ns.relaysmtp(server);
      ports++;
    }

    if (ns.fileExists("HTTPWorm.exe", "home")) {
      ns.httpworm(server);
      ports++;
    }

    if (ns.fileExists("SQLInject.exe", "home")) {
      ns.sqlinject(server);
      ports++;
    }

    if (ports >= ns.getServerNumPortsRequired(server)) {
      ns.nuke(server);
      rooted++;
    }
  }

  return rooted;
}

function buildHostPool(ns, rootedServers, minRam, CFG) {
  const hosts = [];

  for (const host of rootedServers) {
    const maxRam = ns.getServerMaxRam(host);
    if (maxRam < minRam) continue;

    let freeRam = maxRam - ns.getServerUsedRam(host);

    if (host === "home") {
      freeRam -= CFG.HOME_RESERVE;
    }

    if (freeRam >= minRam) {
      hosts.push({ host, maxRam, freeRam });
    }
  }

  hosts.sort((a, b) => b.freeRam - a.freeRam);
  return hosts;
}

function deployWorkers(ns, hosts, files) {
  for (const h of hosts) {
    if (h.host !== "home") {
      ns.scp(files, h.host, "home");
    }
  }
}

function getTargetState(ns, name) {
  const server = ns.getServer(name);

  const money = Math.max(1, ns.getServerMoneyAvailable(name));
  const maxMoney = ns.getServerMaxMoney(name);
  const sec = ns.getServerSecurityLevel(name);
  const minSec = ns.getServerMinSecurityLevel(name);
  const req = ns.getServerRequiredHackingLevel(name);
  const growth = ns.getServerGrowth(name);

  const hackTime = ns.getHackTime(name);
  const growTime = ns.getGrowTime(name);
  const weakenTime = ns.getWeakenTime(name);

  const hackPct = ns.hackAnalyze(name);
  const hackChance = ns.hackAnalyzeChance(name);

  const weak1 = ns.weakenAnalyze(1, 1);
  const growSec1 = ns.growthAnalyzeSecurity(1, name, 1);
  const weakPerGrow = growSec1 / Math.max(weak1, 0.000001);

  const baseDifficulty =
    server.baseDifficulty ??
    server.minDifficulty ??
    ns.getServerMinSecurityLevel(name);

  const xpPerThread = 3 + 0.3 * baseDifficulty;
  const xpScore = xpPerThread / Math.max(1, growTime + weakPerGrow * weakenTime);

  const bridgeScore =
    maxMoney > 0
      ? (maxMoney * (money / maxMoney) * hackChance * Math.max(hackPct, 0.000001)) /
        Math.max(1, hackTime)
      : 0;

  return {
    name,
    money,
    maxMoney,
    moneyRatio: maxMoney > 0 ? money / maxMoney : 0,
    sec,
    minSec,
    secDelta: Math.max(0, sec - minSec),
    req,
    growth,
    hackPct,
    hackChance,
    hackTime,
    growTime,
    weakenTime,
    weakPerGrow,
    xpScore,
    bridgeScore,
  };
}

function phaseManager(ns, hl, hosts, targets, CFG) {
  const freeRam = totalFreeRam(hosts);

  const bridgeReady = targets.filter(
    (t) =>
      t.req <= hl &&
      t.moneyRatio >= CFG.BRIDGE_READY_MONEY &&
      t.secDelta <= CFG.BRIDGE_SEC_BUFFER &&
      t.hackChance > 0
  ).length;

  if (hl < CFG.XP_TO_PREP_HL || freeRam < 32) {
    return "xp";
  }

  if (hl < CFG.PREP_TO_BRIDGE_HL || bridgeReady < 3) {
    return "prep";
  }

  return "bridge";
}

function runXpPhase(ns, hosts, targets, RAM, CFG) {
  let actions = 0;

  const xpTargets = [...targets]
    .sort((a, b) => b.xpScore - a.xpScore)
    .slice(0, CFG.XP_MAX_TARGETS);

  for (const t of xpTargets) {
    if (isTargetBusy(ns, t.name, CFG)) continue;
    if (totalFreeRam(hosts) < RAM.weaken) break;

    if (t.secDelta > CFG.XP_SEC_SOFTCAP) {
      const weakenThreads = Math.max(1, Math.ceil(t.secDelta / ns.weakenAnalyze(1, 1)));

      const launched = runDistributed(
        ns,
        hosts,
        CFG.WORKERS.WEAKEN,
        RAM.weaken,
        weakenThreads,
        t.name,
        0
      );

      if (launched > 0) actions++;
      continue;
    }

    const perTargetRam = totalFreeRam(hosts) / Math.max(1, CFG.XP_MAX_TARGETS - actions);

    const growThreads = Math.floor(
      perTargetRam / (RAM.grow + t.weakPerGrow * RAM.weaken)
    );

    if (growThreads < 1) continue;

    const weakenThreads = Math.max(1, Math.ceil(growThreads * t.weakPerGrow));
    const growDelay = Math.max(0, t.weakenTime - t.growTime - CFG.BATCH_GAP_MS);

    const plan = planPhases(hosts, [
      {
        script: CFG.WORKERS.WEAKEN,
        ram: RAM.weaken,
        threads: weakenThreads,
        target: t.name,
        delay: 0,
      },
      {
        script: CFG.WORKERS.GROW,
        ram: RAM.grow,
        threads: growThreads,
        target: t.name,
        delay: growDelay,
      },
    ]);

    if (plan && execPlan(ns, plan)) actions++;
  }

  return actions;
}

function runPrepPhase(ns, hosts, targets, RAM, CFG) {
  let actions = 0;

  const prepTargets = [...targets]
    .filter((t) => t.moneyRatio < CFG.MONEY_TARGET || t.secDelta > CFG.PREP_SEC_BUFFER)
    .sort((a, b) => {
      if (a.secDelta !== b.secDelta) return b.secDelta - a.secDelta;
      if (a.moneyRatio !== b.moneyRatio) return a.moneyRatio - b.moneyRatio;
      return b.growth - a.growth;
    })
    .slice(0, CFG.PREP_MAX_TARGETS_PER_LOOP);

  for (const t of prepTargets) {
    if (isTargetBusy(ns, t.name, CFG)) continue;
    if (totalFreeRam(hosts) < Math.min(RAM.grow, RAM.weaken)) break;

    if (launchPrepForTarget(ns, hosts, t, RAM, CFG)) {
      actions++;
    }
  }

  return actions;
}

function runBridgePhase(ns, hosts, targets, RAM, CFG) {
  let actions = 0;
  const weak1 = ns.weakenAnalyze(1, 1);

  const bridgeTargets = [...targets]
    .filter((t) => t.req <= ns.getHackingLevel())
    .sort((a, b) => b.bridgeScore - a.bridgeScore)
    .slice(0, CFG.BRIDGE_MAX_TARGETS_PER_LOOP);

  for (const t of bridgeTargets) {
    if (isTargetBusy(ns, t.name, CFG)) continue;
    if (totalFreeRam(hosts) < Math.min(RAM.hack, RAM.grow, RAM.weaken)) break;

    if (t.secDelta > CFG.BRIDGE_SEC_BUFFER || t.moneyRatio < CFG.BRIDGE_READY_MONEY) {
      if (launchPrepForTarget(ns, hosts, t, RAM, CFG)) actions++;
      continue;
    }

    let hackThreads = Math.floor(
      ns.hackAnalyzeThreads(t.name, t.money * CFG.BRIDGE_HACK_FRACTION)
    );

    if (!Number.isFinite(hackThreads) || hackThreads < 1) {
      hackThreads = 1;
    }

    const stealFraction = Math.min(0.9, hackThreads * t.hackPct);
    const postHackMoney = Math.max(1, t.money * (1 - stealFraction));

    const growThreads = Math.max(
      1,
      calcGrowThreads(ns, t.name, postHackMoney, t.maxMoney)
    );

    const hackSec = ns.hackAnalyzeSecurity(hackThreads, t.name);
    const growSec = ns.growthAnalyzeSecurity(growThreads, t.name, 1);
    const weakenThreads = Math.max(1, Math.ceil((hackSec + growSec) / weak1));

    const hackDelay = Math.max(0, t.weakenTime - t.hackTime - 2 * CFG.BATCH_GAP_MS);
    const growDelay = Math.max(0, t.weakenTime - t.growTime - CFG.BATCH_GAP_MS);

    const plan = planPhases(hosts, [
      {
        script: CFG.WORKERS.WEAKEN,
        ram: RAM.weaken,
        threads: weakenThreads,
        target: t.name,
        delay: 0,
      },
      {
        script: CFG.WORKERS.GROW,
        ram: RAM.grow,
        threads: growThreads,
        target: t.name,
        delay: growDelay,
      },
      {
        script: CFG.WORKERS.HACK,
        ram: RAM.hack,
        threads: hackThreads,
        target: t.name,
        delay: hackDelay,
      },
    ]);

    if (plan && execPlan(ns, plan)) {
      actions++;
    }
  }

  return actions;
}

function launchPrepForTarget(ns, hosts, t, RAM, CFG) {
  const weak1 = ns.weakenAnalyze(1, 1);

  if (isTargetBusy(ns, t.name, CFG)) return false;

  if (t.secDelta > CFG.PREP_SEC_BUFFER) {
    const weakenThreads = Math.max(1, Math.ceil(t.secDelta / weak1));

    return (
      runDistributed(
        ns,
        hosts,
        CFG.WORKERS.WEAKEN,
        RAM.weaken,
        weakenThreads,
        t.name,
        0
      ) > 0
    );
  }

  if (t.moneyRatio < CFG.MONEY_TARGET) {
    const targetMoney = t.maxMoney * CFG.MONEY_TARGET;
    const growThreads = Math.max(
      1,
      calcGrowThreads(ns, t.name, t.money, targetMoney)
    );

    const growSec = ns.growthAnalyzeSecurity(growThreads, t.name, 1);
    const weakenThreads = Math.max(1, Math.ceil(growSec / weak1));
    const growDelay = Math.max(0, t.weakenTime - t.growTime - CFG.BATCH_GAP_MS);

    const plan = planPhases(hosts, [
      {
        script: CFG.WORKERS.WEAKEN,
        ram: RAM.weaken,
        threads: weakenThreads,
        target: t.name,
        delay: 0,
      },
      {
        script: CFG.WORKERS.GROW,
        ram: RAM.grow,
        threads: growThreads,
        target: t.name,
        delay: growDelay,
      },
    ]);

    return !!(plan && execPlan(ns, plan));
  }

  return false;
}

function isTargetBusy(ns, target, CFG) {
  return countActiveJobsForTarget(ns, target, Object.values(CFG.WORKERS)) >= CFG.MAX_ACTIVE_JOBS_PER_TARGET;
}

function countActiveJobsForTarget(ns, target, workerScripts) {
  let count = 0;

  for (const host of discoverAllServers(ns)) {
    if (!ns.hasRootAccess(host)) continue;

    for (const proc of ns.ps(host)) {
      if (
        workerScripts.includes(proc.filename) &&
        proc.args &&
        proc.args[0] === target
      ) {
        count++;
      }
    }
  }

  return count;
}

function calcGrowThreads(ns, target, currentMoney, targetMoney) {
  const cur = Math.max(1, currentMoney);
  const goal = Math.max(cur, targetMoney);

  if (goal <= cur) return 0;

  return Math.ceil(ns.growthAnalyze(target, goal / cur, 1));
}

function planPhases(hosts, phases) {
  const sim = hosts.map((h) => ({ ...h }));
  const plan = [];

  for (const phase of phases) {
    let remaining = phase.threads;

    for (const host of sim) {
      const possible = Math.floor(host.freeRam / phase.ram);
      if (possible <= 0) continue;

      const take = Math.min(possible, remaining);

      host.freeRam -= take * phase.ram;
      remaining -= take;

      plan.push({
        host: host.host,
        script: phase.script,
        threads: take,
        target: phase.target,
        delay: Math.floor(phase.delay || 0),
      });

      if (remaining <= 0) break;
    }

    if (remaining > 0) return null;
  }

  for (const s of sim) {
    const real = hosts.find((h) => h.host === s.host);
    if (real) real.freeRam = s.freeRam;
  }

  return plan;
}

function execPlan(ns, plan) {
  for (const p of plan) {
    const pid = ns.exec(p.script, p.host, p.threads, p.target, p.delay);

    if (pid === 0) {
      return false;
    }
  }

  return true;
}

function runDistributed(ns, hosts, script, ramPerThread, totalThreads, target, delay = 0) {
  let remaining = totalThreads;
  let launched = 0;

  for (const host of hosts) {
    const possible = Math.floor(host.freeRam / ramPerThread);
    if (possible <= 0) continue;

    const take = Math.min(possible, remaining);

    const pid = ns.exec(script, host.host, take, target, Math.floor(delay));
    if (pid === 0) continue;

    host.freeRam -= take * ramPerThread;
    remaining -= take;
    launched += take;

    if (remaining <= 0) break;
  }

  return launched;
}

function totalFreeRam(hosts) {
  return hosts.reduce((sum, h) => sum + h.freeRam, 0);
}

function render(ns, m) {
  ns.clearLog();
  ns.print("=== ADAPTIVE RUSH ===");
  ns.print(`Phase        : ${m.phase}`);
  ns.print(`Hack level   : ${m.hl}`);
  ns.print(`Rooted       : ${m.rootedCount}`);
  ns.print(`New roots    : ${m.newRoots}`);
  ns.print(`Targets      : ${m.targetCount}`);
  ns.print(`Prep backlog : ${m.prepBacklog}`);
  ns.print(`Actions      : ${m.actions}`);
  ns.print(`RAM          : ${fmtGb(m.usedRam)} / ${fmtGb(m.maxRam)}`);
  ns.print(`Free RAM     : ${fmtGb(m.freeRam)}`);
  ns.print(`XP/sec       : ${round2(m.xpRate)}`);
  ns.print(`$/sec        : ${fmtMoney(m.incomeRate)}`);
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function fmtGb(v) {
  return `${round2(v)}GB`;
}

function fmtMoney(v) {
  const n = Math.abs(v);
  const sign = v < 0 ? "-" : "";

  if (n >= 1e12) return `${sign}$${round2(n / 1e12)}t`;
  if (n >= 1e9) return `${sign}$${round2(n / 1e9)}b`;
  if (n >= 1e6) return `${sign}$${round2(n / 1e6)}m`;
  if (n >= 1e3) return `${sign}$${round2(n / 1e3)}k`;

  return `${sign}$${round2(n)}`;
}
