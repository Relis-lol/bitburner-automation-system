/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const CFG = {
    GROW_SCRIPT: "grow2.js",
    WEAKEN_SCRIPT: "weaken2.js",

    HOME_RESERVE: 135,        // RAM to keep free on 'home'
    LOOP_MS: 2000,            // Interval between scan cycles

    MONEY_TARGET: 0.995,      // Target 99.5% of max money
    SEC_BUFFER: 0.05,         // Allowable security deviation from minimum

    BATCH_GAP: 200,           // Ms delay between script phases
    MAX_TARGETS_PER_LOOP: 50, // Concurrency limit for simultaneous preps
  };

  const ramGrow = ns.getScriptRam(CFG.GROW_SCRIPT, "home");
  const ramWeaken = ns.getScriptRam(CFG.WEAKEN_SCRIPT, "home");
  const minRam = Math.min(ramGrow, ramWeaken);

  if (ramGrow === 0 || ramWeaken === 0) {
    ns.tprint(`ERROR: ${CFG.GROW_SCRIPT} or ${CFG.WEAKEN_SCRIPT} missing on home.`);
    return;
  }

  ns.tprint("🛠️ PREP-ALL initialized: Executing Grow/Weaken cycles.");

  while (true) {
    const allServers = discoverAllServers(ns);
    const hosts = buildHostPool(ns, allServers, minRam, CFG);

    const targets = allServers
      .filter(s => s !== "home")
      .filter(s => ns.hasRootAccess(s))
      .filter(s => ns.getServerMaxMoney(s) > 0)
      .filter(s => ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel())
      .map(s => getTargetState(ns, s))
      // Filter targets that aren't at min security or max money yet
      .filter(t => t.moneyRatio < CFG.MONEY_TARGET || t.secDelta > CFG.SEC_BUFFER)
      .sort((a, b) => {
        // Prioritize lowering security first, then money ratio
        if (a.secDelta !== b.secDelta) return b.secDelta - a.secDelta;
        return a.moneyRatio - b.moneyRatio;
      })
      .slice(0, CFG.MAX_TARGETS_PER_LOOP);

    let actions = 0;

    for (const t of targets) {
      if (totalFreeRam(hosts) < minRam) break;

      // 1) Reduce security first
      if (t.secDelta > CFG.SEC_BUFFER) {
        const weakenThreads = Math.ceil(t.secDelta / ns.weakenAnalyze(1));

        const ok = runDistributed(
          ns,
          hosts,
          CFG.WEAKEN_SCRIPT,
          ramWeaken,
          weakenThreads,
          t.name,
          0,
          "prepW"
        );

        if (ok) actions++;
        continue;
      }

      // 2) Maximize money and compensate for grow security
      if (t.moneyRatio < CFG.MONEY_TARGET) {
        const targetMoney = t.maxMoney * CFG.MONEY_TARGET;
        let growThreads = calcGrowThreads(ns, t.name, t.money, targetMoney);
        if (growThreads < 1) growThreads = 1;

        const growSec = ns.growthAnalyzeSecurity(growThreads, t.name, 1);
        const weakenThreads = Math.ceil(growSec / ns.weakenAnalyze(1));

        const weakenTime = ns.getWeakenTime(t.name);
        const growTime = ns.getGrowTime(t.name);

        // Delay grow so it finishes just before the weaken completes
        const growDelay = Math.max(0, weakenTime - growTime - CFG.BATCH_GAP);

        const plan = planPhases(hosts, [
          {
            script: CFG.WEAKEN_SCRIPT,
            ram: ramWeaken,
            threads: weakenThreads,
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

    // Console UI Update
    ns.clearLog();
    ns.print("=== NETWORK PREP STATUS ===");
    ns.print(`Targets identified  : ${targets.length}`);
    ns.print(`Operations launched : ${actions}`);
    ns.print(`Remaining free RAM  : ${formatGb(totalFreeRam(hosts))}`);

    if (targets.length === 0) {
      ns.tprint("✅ Network optimization complete: All accessible servers are prepared.");
      return;
    }

    await ns.sleep(CFG.LOOP_MS);
  }
}

/** Network discovery: Returns all reachable server names */
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

/** Resource allocation: Finds servers with root access and free RAM */
function buildHostPool(ns, allServers, minRam, CFG) {
  const hosts = [];

  for (const host of allServers) {
    if (!ns.hasRootAccess(host)) continue;

    const maxRam = ns.getServerMaxRam(host);
    if (maxRam < minRam) continue;

    let freeRam = maxRam - ns.getServerUsedRam(host);

    if (host === "home") {
      freeRam -= CFG.HOME_RESERVE;
    }

    if (freeRam >= minRam) {
      hosts.push({ host, freeRam });
    }
  }

  // Use the biggest hosts first
  hosts.sort((a, b) => b.freeRam - a.freeRam);
  return hosts;
}

/** Gathers current server financials and security status */
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

/** Calculates required grow threads to reach target money */
function calcGrowThreads(ns, target, currentMoney, targetMoney) {
  const cur = Math.max(1, currentMoney);
  const goal = Math.max(cur, targetMoney);

  if (goal <= cur) return 0;

  const mult = Math.max(1.0000001, goal / cur);
  return Math.ceil(ns.growthAnalyze(target, mult, 1));
}

/** Distributes script execution across multiple hosts */
function runDistributed(ns, hosts, script, ramPerThread, totalThreads, target, delay, tag) {
  let remaining = totalThreads;

  for (const host of hosts) {
    const possible = Math.floor(host.freeRam / ramPerThread);
    if (possible <= 0) continue;

    const take = Math.min(possible, remaining);
    if (take <= 0) continue;

    const pid = ns.exec(script, host.host, take, target, delay, tag);
    if (pid === 0) continue;

    host.freeRam -= take * ramPerThread;
    remaining -= take;

    if (remaining <= 0) return true;
  }

  return remaining <= 0;
}

/** Validates and maps a multi-phase operation onto available hardware */
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
      if (take <= 0) continue;

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

    if (remaining > 0) return null; // Not enough total RAM for this phase
  }

  // Update actual host pool RAM after successful simulation
  for (const h of sim) {
    const real = hosts.find(x => x.host === h.host);
    real.freeRam = h.freeRam;
  }

  return plan;
}

/** Executes a pre-validated batch plan */
function execPlan(ns, plan) {
  for (const p of plan) {
    const pid = ns.exec(
      p.script,
      p.host,
      p.threads,
      p.target,
      Math.floor(p.delay),
      p.tag
    );

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
