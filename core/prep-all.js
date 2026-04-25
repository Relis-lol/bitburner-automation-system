/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const CFG = {
    GROW_SCRIPT: "grow2.js",
    WEAKEN_SCRIPT: "weaken2.js",
    RESTART_SCRIPT: "restart.js",

    HOME_RESERVE: 135,
    LOOP_MS: 100,
    BATCH_GAP: 50,

    MONEY_TARGET: 0.995,
    SEC_BUFFER: 0.05,
    MAX_TARGETS_PER_LOOP: 50,
  };

  if (!ns.scriptRunning(CFG.RESTART_SCRIPT, "home")) {
    const pid = ns.run(CFG.RESTART_SCRIPT, 1);

    if (pid === 0) {
      ns.tprint(`WARNING: Failed to start ${CFG.RESTART_SCRIPT}. Check home RAM.`);
    } else {
      ns.tprint(`Started ${CFG.RESTART_SCRIPT} with PID ${pid}`);
    }
  }

  const ramGrow = ns.getScriptRam(CFG.GROW_SCRIPT, "home");
  const ramWeaken = ns.getScriptRam(CFG.WEAKEN_SCRIPT, "home");
  const minRam = Math.min(ramGrow, ramWeaken);

  if (ramGrow === 0 || ramWeaken === 0) {
    ns.tprint(`ERROR: ${CFG.GROW_SCRIPT} or ${CFG.WEAKEN_SCRIPT} missing on home.`);
    return;
  }

  ns.tprint("🛠️ PREP-ALL Turbo: Executing Parallel Fix Cycles.");

  while (true) {
    const allServers = discoverAllServers(ns);
    const hosts = buildHostPool(ns, allServers, minRam, CFG);

    const targets = allServers
      .filter(s => s !== "home")
      .filter(s => ns.hasRootAccess(s))
      .filter(s => ns.getServerMaxMoney(s) > 0)
      .filter(s => ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel())
      .map(s => getTargetState(ns, s))
      .filter(t => t.moneyRatio < CFG.MONEY_TARGET || t.secDelta > CFG.SEC_BUFFER)
      .sort((a, b) => b.secDelta - a.secDelta)
      .slice(0, CFG.MAX_TARGETS_PER_LOOP);

    let actions = 0;

    for (const t of targets) {
      if (totalFreeRam(hosts) < minRam) break;

      const weakenThreadsForSec = Math.ceil(t.secDelta / ns.weakenAnalyze(1));

      const targetMoney = t.maxMoney * CFG.MONEY_TARGET;
      const growThreads = calcGrowThreads(ns, t.name, t.money, targetMoney);
      const growSec = ns.growthAnalyzeSecurity(growThreads, t.name, 1);
      const weakenThreadsForGrow = Math.ceil(growSec / ns.weakenAnalyze(1));

      const totalWeaken = weakenThreadsForSec + weakenThreadsForGrow;

      if (totalWeaken > 0 || growThreads > 0) {
        const weakenTime = ns.getWeakenTime(t.name);
        const growTime = ns.getGrowTime(t.name);
        const growDelay = Math.max(0, weakenTime - growTime - CFG.BATCH_GAP);

        const plan = planPhases(hosts, [
          {
            script: CFG.WEAKEN_SCRIPT,
            ram: ramWeaken,
            threads: totalWeaken,
            target: t.name,
            delay: 0,
            tag: "prepW",
          },
          {
            script: CFG.GROW_SCRIPT,
            ram: ramGrow,
            threads: growThreads,
            target: t.name,
            delay: growDelay,
            tag: "prepG",
          },
        ]);

        if (plan && execPlan(ns, plan)) actions++;
      }
    }

    ns.clearLog();
    ns.print("=== TURBO PREP STATUS ===");
    ns.print(`Targets needing fix : ${targets.length}`);
    ns.print(`Batches launched    : ${actions}`);
    ns.print(`Free Network RAM    : ${formatGb(totalFreeRam(hosts))}`);

    if (targets.length === 0) {
      ns.tprint("✅ All servers fully prepared and optimized.");
      return;
    }

    await ns.sleep(CFG.LOOP_MS);
  }
}

/** HELPER FUNCTIONS **/

function discoverAllServers(ns) {
  const seen = new Set(["home"]);
  const queue = ["home"];

  while (queue.length > 0) {
    const cur = queue.shift();

    for (const next of ns.scan(cur)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return [...seen];
}

function buildHostPool(ns, allServers, minRam, CFG) {
  const hosts = [];

  for (const host of allServers) {
    if (!ns.hasRootAccess(host)) continue;

    const maxRam = ns.getServerMaxRam(host);
    let freeRam = maxRam - ns.getServerUsedRam(host);

    if (host === "home") freeRam -= CFG.HOME_RESERVE;

    if (freeRam >= minRam) {
      hosts.push({ host, freeRam });
    }
  }

  return hosts.sort((a, b) => b.freeRam - a.freeRam);
}

function getTargetState(ns, name) {
  const maxMoney = ns.getServerMaxMoney(name);
  const money = Math.max(1, ns.getServerMoneyAvailable(name));
  const minSec = ns.getServerMinSecurityLevel(name);
  const sec = ns.getServerSecurityLevel(name);

  return {
    name,
    maxMoney,
    money,
    moneyRatio: maxMoney > 0 ? money / maxMoney : 0,
    minSec,
    sec,
    secDelta: Math.max(0, sec - minSec),
  };
}

function calcGrowThreads(ns, target, currentMoney, targetMoney) {
  const cur = Math.max(1, currentMoney);
  const goal = Math.max(cur, targetMoney);

  if (goal <= cur) return 0;

  return Math.ceil(ns.growthAnalyze(target, goal / cur, 1));
}

function planPhases(hosts, phases) {
  const sim = hosts.map(h => ({ ...h }));
  const plan = [];

  for (const phase of phases) {
    let remaining = phase.threads;

    if (remaining <= 0) continue;

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
    ns.exec(
      p.script,
      p.host,
      p.threads,
      p.target,
      Math.floor(p.delay),
      p.tag
    );
  }

  return true;
}

function totalFreeRam(hosts) {
  return hosts.reduce((sum, h) => sum + h.freeRam, 0);
}

function formatGb(v) {
  return `${Math.round(v * 10) / 10}GB`;
}
