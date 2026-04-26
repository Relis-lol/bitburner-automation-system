import { isLocked } from "lock-manager.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  ns.tprint("script starts: apex-hwgw stable engine online");

  const HACK_SCRIPT = "hack2.js";
  const GROW_SCRIPT = "grow2.js";
  const WEAKEN_SCRIPT = "weaken2.js";

  const HOME_RESERVE_GB = 50;

  const MONEY_READY = 0.97;
  const SECURITY_READY_BUFFER = 0.10;

  const BASE_MAX_TARGETS = 20;
  const BASE_MAX_ACTIVE_JOBS_PER_TARGET = 10000;

  const HIGH_RAM_MAX_TARGETS = 50;
  const HIGH_RAM_MAX_ACTIVE_JOBS_PER_TARGET = 30000;
  const HIGH_RAM_THRESHOLD_GB = 3 * 1024 * 1024; // 3 PB

  const LOOP_DELAY = 100;
  const BATCH_COOLDOWN_MS = 60;
  const PREP_COOLDOWN_MS = 3000;
  const BATCH_SPACING = 40;

  const MAX_HACK_FRACTION = 0.40;
  const MIN_HACK_FRACTION = 0.0001;

  const MAX_NETWORK_USAGE = 0.95;

  const BATCH_GROW_BUFFER = 1.60;
  const BATCH_WEAKEN_HACK_BUFFER = 1.50;
  const BATCH_WEAKEN_GROW_BUFFER = 1.80;

  const PREP_GROW_BUFFER = 2.0;
  const PREP_WEAKEN_BUFFER = 2.0;

  const state = {};

  while (true) {
    const hosts = getUsableHosts(ns, HOME_RESERVE_GB);
    const usage = getNetworkUsage(ns, HOME_RESERVE_GB);

    const scaling = getScalingConfig(
      usage.total,
      HIGH_RAM_THRESHOLD_GB,
      BASE_MAX_TARGETS,
      BASE_MAX_ACTIVE_JOBS_PER_TARGET,
      HIGH_RAM_MAX_TARGETS,
      HIGH_RAM_MAX_ACTIVE_JOBS_PER_TARGET
    );

    if (usage.ratio >= MAX_NETWORK_USAGE) {
      await ns.sleep(LOOP_DELAY);
      continue;
    }

    const targets = getBestTargets(ns).slice(0, scaling.maxTargets);

    for (const target of targets) {
      if (!state[target]) {
        state[target] = {
          lastBatch: 0,
          lastPrep: 0,
          prepUntil: 0
        };
      }

      const now = Date.now();
      const moneyRatio = getMoneyRatio(ns, target);
      const secGap = getSecurityGap(ns, target);

      const activeJobs = countActiveJobsForTarget(ns, target, [
        HACK_SCRIPT,
        GROW_SCRIPT,
        WEAKEN_SCRIPT
      ]);

      if (activeJobs >= scaling.maxActiveJobsPerTarget) {
        continue;
      }

      if (secGap > SECURITY_READY_BUFFER || moneyRatio < MONEY_READY) {
        if (now - state[target].lastPrep >= PREP_COOLDOWN_MS) {
          prepTarget(
            ns,
            target,
            hosts,
            HOME_RESERVE_GB,
            MONEY_READY,
            GROW_SCRIPT,
            WEAKEN_SCRIPT,
            PREP_GROW_BUFFER,
            PREP_WEAKEN_BUFFER
          );

          state[target].lastPrep = now;
          state[target].prepUntil =
            now + Math.max(ns.getGrowTime(target), ns.getWeakenTime(target)) + 500;
        }

        continue;
      }

      if (now < state[target].prepUntil) continue;
      if (now - state[target].lastBatch < BATCH_COOLDOWN_MS) continue;

      const availableRam = getTotalAvailableRam(ns, hosts, HOME_RESERVE_GB);

      const batch = calculateBatch(
        ns,
        target,
        availableRam,
        MAX_HACK_FRACTION,
        MIN_HACK_FRACTION,
        HACK_SCRIPT,
        GROW_SCRIPT,
        WEAKEN_SCRIPT,
        BATCH_GROW_BUFFER,
        BATCH_WEAKEN_HACK_BUFFER,
        BATCH_WEAKEN_GROW_BUFFER
      );

      if (!batch) continue;

      const launched = launchBatch(
        ns,
        target,
        hosts,
        batch,
        BATCH_SPACING,
        HOME_RESERVE_GB,
        HACK_SCRIPT,
        GROW_SCRIPT,
        WEAKEN_SCRIPT
      );

      if (launched) {
        state[target].lastBatch = now;

        ns.print(
          `HWGW | ${target} | targets:${scaling.maxTargets} jobs:${scaling.maxActiveJobsPerTarget} | ` +
          `hack ${(batch.hackFraction * 100).toFixed(2)}% | ` +
          `H:${batch.hackThreads} W1:${batch.weakenHackThreads} ` +
          `G:${batch.growThreads} W2:${batch.weakenGrowThreads} | ` +
          `RAM:${formatRam(batch.totalRam)}`
        );
      }
    }

    await ns.sleep(LOOP_DELAY);
  }
}

function getScalingConfig(
  totalNetworkRam,
  highRamThresholdGb,
  baseMaxTargets,
  baseMaxJobs,
  highMaxTargets,
  highMaxJobs
) {
  if (totalNetworkRam >= highRamThresholdGb) {
    return {
      maxTargets: highMaxTargets,
      maxActiveJobsPerTarget: highMaxJobs
    };
  }

  return {
    maxTargets: baseMaxTargets,
    maxActiveJobsPerTarget: baseMaxJobs
  };
}

function getAllServers(ns) {
  const found = new Set(["home"]);
  const queue = ["home"];

  while (queue.length > 0) {
    const current = queue.shift();

    for (const next of ns.scan(current)) {
      if (!found.has(next)) {
        found.add(next);
        queue.push(next);
      }
    }
  }

  return [...found];
}

function getUsableHosts(ns, homeReserveGb) {
  return getAllServers(ns)
    .filter(host => ns.hasRootAccess(host))
    .filter(host => ns.getServerMaxRam(host) > 0)
    .map(host => {
      const reserve = host === "home" ? homeReserveGb : 0;

      const freeRam =
        ns.getServerMaxRam(host) -
        ns.getServerUsedRam(host) -
        reserve;

      return {
        name: host,
        freeRam: Math.max(0, freeRam)
      };
    })
    .filter(host => host.freeRam > 2)
    .sort((a, b) => b.freeRam - a.freeRam);
}

function getNetworkUsage(ns, homeReserveGb) {
  let total = 0;
  let used = 0;

  for (const host of getAllServers(ns)) {
    if (!ns.hasRootAccess(host)) continue;

    const maxRam = ns.getServerMaxRam(host);
    if (maxRam <= 0) continue;

    const reserve = host === "home" ? homeReserveGb : 0;
    const usable = Math.max(0, maxRam - reserve);

    total += usable;
    used += Math.min(usable, ns.getServerUsedRam(host));
  }

  return {
    total,
    used,
    free: Math.max(0, total - used),
    ratio: total > 0 ? used / total : 0
  };
}

function getTotalAvailableRam(ns, hosts, homeReserveGb) {
  let total = 0;

  for (const host of hosts) {
    const reserve = host.name === "home" ? homeReserveGb : 0;

    total += Math.max(
      0,
      ns.getServerMaxRam(host.name) -
      ns.getServerUsedRam(host.name) -
      reserve
    );
  }

  return total;
}

function getBestTargets(ns) {
  return getAllServers(ns)
    .filter(target => ns.hasRootAccess(target))
    .filter(target => !isLocked(ns, target))
    .filter(target => ns.getServerMaxMoney(target) > 0)
    .filter(target => ns.getServerRequiredHackingLevel(target) <= ns.getHackingLevel())
    .map(target => {
      const maxMoney = ns.getServerMaxMoney(target);
      const minSec = ns.getServerMinSecurityLevel(target);
      const weakenTime = ns.getWeakenTime(target);
      const hackChance = ns.hackAnalyzeChance(target);
      const hackPercent = ns.hackAnalyze(target);

      const score =
        maxMoney *
        hackChance *
        Math.max(hackPercent, 0.000001) /
        Math.max(1, minSec) /
        Math.max(1, weakenTime);

      return { target, score };
    })
    .filter(x => Number.isFinite(x.score) && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.target);
}

function getMoneyRatio(ns, target) {
  const maxMoney = ns.getServerMaxMoney(target);
  if (maxMoney <= 0) return 0;
  return ns.getServerMoneyAvailable(target) / maxMoney;
}

function getSecurityGap(ns, target) {
  return ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
}

function countActiveJobsForTarget(ns, target, workerScripts) {
  let count = 0;

  for (const host of getAllServers(ns)) {
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

function calculateBatch(
  ns,
  target,
  availableRam,
  maxHackFraction,
  minHackFraction,
  hackScript,
  growScript,
  weakenScript,
  growBuffer,
  weakenHackBuffer,
  weakenGrowBuffer
) {
  const hackPercentPerThread = ns.hackAnalyze(target);

  if (!Number.isFinite(hackPercentPerThread) || hackPercentPerThread <= 0) {
    return null;
  }

  const hackRam = ns.getScriptRam(hackScript, "home");
  const growRam = ns.getScriptRam(growScript, "home");
  const weakenRam = ns.getScriptRam(weakenScript, "home");

  if (hackRam <= 0 || growRam <= 0 || weakenRam <= 0) return null;

  let hackFraction = maxHackFraction;

  while (hackFraction >= minHackFraction) {
    const hackThreads = Math.max(
      1,
      Math.floor(hackFraction / hackPercentPerThread)
    );

    const realHackFraction = Math.min(
      maxHackFraction,
      hackThreads * hackPercentPerThread
    );

    const growMultiplier = 1 / Math.max(0.01, 1 - realHackFraction);

    const growThreads = Math.max(
      1,
      Math.ceil(ns.growthAnalyze(target, growMultiplier) * growBuffer)
    );

    const hackSecurityIncrease = ns.hackAnalyzeSecurity(hackThreads, target);
    const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target);
    const weakenPower = ns.weakenAnalyze(1);

    const weakenHackThreads = Math.max(
      1,
      Math.ceil((hackSecurityIncrease / weakenPower) * weakenHackBuffer)
    );

    const weakenGrowThreads = Math.max(
      1,
      Math.ceil((growSecurityIncrease / weakenPower) * weakenGrowBuffer)
    );

    const totalRam =
      hackThreads * hackRam +
      growThreads * growRam +
      weakenHackThreads * weakenRam +
      weakenGrowThreads * weakenRam;

    if (
      Number.isFinite(totalRam) &&
      totalRam > 0 &&
      totalRam <= availableRam
    ) {
      return {
        hackFraction: realHackFraction,
        hackThreads,
        growThreads,
        weakenHackThreads,
        weakenGrowThreads,
        hackTime: ns.getHackTime(target),
        growTime: ns.getGrowTime(target),
        weakenTime: ns.getWeakenTime(target),
        totalRam
      };
    }

    hackFraction *= 0.70;
  }

  return null;
}

function launchBatch(
  ns,
  target,
  hosts,
  batch,
  spacing,
  homeReserveGb,
  hackScript,
  growScript,
  weakenScript
) {
  const batchId = `${target}-${Date.now()}-${Math.random()}`;

  const hackDelay = Math.max(0, batch.weakenTime - batch.hackTime);
  const weakenHackDelay = spacing;
  const growDelay = Math.max(0, batch.weakenTime + spacing * 2 - batch.growTime);
  const weakenGrowDelay = spacing * 3;

  const jobs = [
    { script: hackScript, threads: batch.hackThreads, delay: hackDelay },
    { script: weakenScript, threads: batch.weakenHackThreads, delay: weakenHackDelay },
    { script: growScript, threads: batch.growThreads, delay: growDelay },
    { script: weakenScript, threads: batch.weakenGrowThreads, delay: weakenGrowDelay }
  ];

  const started = [];

  for (const job of jobs) {
    const result = runDistributed(
      ns,
      hosts,
      job.script,
      target,
      job.delay,
      job.threads,
      homeReserveGb,
      batchId
    );

    started.push(...result.pids);

    if (!result.success) {
      for (const item of started) {
        ns.kill(item.pid, item.host);
      }

      return false;
    }
  }

  return true;
}

function runDistributed(
  ns,
  hosts,
  script,
  target,
  delay,
  totalThreads,
  homeReserveGb,
  batchId
) {
  let remaining = totalThreads;
  const scriptRam = ns.getScriptRam(script, "home");
  const pids = [];

  for (const host of hosts) {
    if (remaining <= 0) break;

    const reserve = host.name === "home" ? homeReserveGb : 0;

    const freeRam = Math.max(
      0,
      ns.getServerMaxRam(host.name) -
      ns.getServerUsedRam(host.name) -
      reserve
    );

    const possibleThreads = Math.floor(freeRam / scriptRam);
    const threads = Math.min(possibleThreads, remaining);

    if (threads > 0) {
      const pid = ns.exec(
        script,
        host.name,
        threads,
        target,
        delay,
        batchId
      );

      if (pid !== 0) {
        pids.push({ host: host.name, pid });
        remaining -= threads;
      }
    }
  }

  return {
    success: remaining <= 0,
    pids
  };
}

function prepTarget(
  ns,
  target,
  hosts,
  homeReserveGb,
  moneyReady,
  growScript,
  weakenScript,
  prepGrowBuffer,
  prepWeakenBuffer
) {
  const moneyRatio = getMoneyRatio(ns, target);
  const secGap = getSecurityGap(ns, target);
  const weakenPower = ns.weakenAnalyze(1);
  const batchId = `prep-${target}-${Date.now()}-${Math.random()}`;

  if (secGap > 0.25) {
    const weakenThreads = Math.max(
      1,
      Math.ceil((secGap / weakenPower) * prepWeakenBuffer)
    );

    runDistributed(
      ns,
      hosts,
      weakenScript,
      target,
      0,
      weakenThreads,
      homeReserveGb,
      batchId
    );

    return;
  }

  if (moneyRatio < moneyReady) {
    const safeMoneyRatio = Math.max(0.01, moneyRatio);
    const growMultiplier = Math.max(1.1, moneyReady / safeMoneyRatio);

    const growThreads = Math.max(
      1,
      Math.ceil(ns.growthAnalyze(target, growMultiplier) * prepGrowBuffer)
    );

    const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target);

    const weakenThreads = Math.max(
      1,
      Math.ceil((growSecurityIncrease / weakenPower) * prepWeakenBuffer)
    );

    runDistributed(
      ns,
      hosts,
      growScript,
      target,
      0,
      growThreads,
      homeReserveGb,
      batchId
    );

    runDistributed(
      ns,
      hosts,
      weakenScript,
      target,
      ns.getGrowTime(target) + 200,
      weakenThreads,
      homeReserveGb,
      batchId
    );
  }
}

function formatRam(ram) {
  if (ram >= 1024 * 1024) return `${(ram / 1024 / 1024).toFixed(2)}PB`;
  if (ram >= 1024) return `${(ram / 1024).toFixed(2)}TB`;
  return `${ram.toFixed(2)}GB`;
}
