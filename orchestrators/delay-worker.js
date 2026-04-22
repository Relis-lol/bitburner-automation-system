/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const CFG = {
        HACK_SCRIPT: "hack2.js",
        GROW_SCRIPT: "grow2.js",
        WEAKEN_SCRIPT: "weaken2.js",

        HOME_RESERVE: 15,
        LOOP_MS: 1000,

        HEALTH_MONEY_TARGET: 0.90,
        HACK_MONEY_FLOOR: 0.40,
        RECOVER_MONEY_THRESHOLD: 0.55,

        HEALTH_SEC_BUFFER: 1.5,
        RECOVER_SEC_THRESHOLD: 4,

        FOCUS_COUNT: 2,
        BATCH_GAP: 200,

        MAX_BATCHES_PER_TARGET: 5,
        DESIRED_HACK_FRACTION: 0.08,
        MIN_FREE_RAM_BUFFER: 0,

        LOG_EVERY: 5,

        // Auxiliary systems only activate once the whole rooted network is large enough
        AUX_MIN_NETWORK_RAM: 100,
        AUX_REPAIR_SHARE: 0.10,
        AUX_TITAN_SHARE: 0.10,
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
        const hostsBase = buildHostPool(ns, allServers, minScriptRam, CFG);

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

        // Build host pools
        let mainHosts = cloneHosts(hostsBase);
        let repairHosts = [];
        let titanHosts = [];

        if (totalNetworkRam >= CFG.AUX_MIN_NETWORK_RAM) {
            const repairBudget = totalNetworkRam * CFG.AUX_REPAIR_SHARE;
            const titanBudget = totalNetworkRam * CFG.AUX_TITAN_SHARE;

            repairHosts = allocateBudgetPool(mainHosts, repairBudget, minScriptRam);
            titanHosts = allocateBudgetPool(mainHosts, titanBudget, minScriptRam);
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

        // 1) Main recovery / prep first
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

        // 2) Main business batches only on healthy focus targets
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

        // 3) Auxiliary repair pool on non-focus targets only
        let repairActions = 0;
        if (repairHosts.length > 0) {
            const nonFocusMetrics = metrics.filter(m => !focusSet.has(m.target));

            for (const entry of nonFocusMetrics) {
                if (totalFreeRam(repairHosts) < minScriptRam) break;

                const h = entry.health;
                if (!h.needsMoney && !h.needsSec) continue;

                if (h.secDelta > 1.5) {
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
                    if (ok) repairActions++;
                } else if (h.moneyRatio < 0.85) {
                    let desiredMoney = h.maxMoney * 0.90;
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

                    if (plan && execPlan(ns, plan)) repairActions++;
                }
            }
        }

        // 4) Unused repair RAM joins the Titan support pool
        if (repairHosts.length > 0 && totalFreeRam(repairHosts) >= minScriptRam) {
            mergeHostPools(titanHosts, repairHosts);
        }

        // 5) Titan-style support pool on non-focus targets
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

                // Remote non-purchased servers self-farm, purchased/home assist the best titan target
                if (!host.host.startsWith("serv-") && host.host !== "home" && ns.getServerMaxMoney(host.host) > 0 && !focusSet.has(host.host)) {
                    target = host.host;
                }

                let tMax = ns.getServerMaxMoney(target);
                let tCur = ns.getServerMoneyAvailable(target);
                let tMin = ns.getServerMinSecurityLevel(target);
                let tSec = ns.getServerSecurityLevel(target);

                if (tSec > tMin + 1) {
                    const pid = ns.exec(CFG.WEAKEN_SCRIPT, host.host, threads, target, 0, "titanW");
                    if (pid !== 0) {
                        host.freeRam -= threads * ramWeaken;
                        titanActions++;
                    }
                    continue;
                }

                if (tCur < tMax * 0.75) {
                    const pid = ns.exec(CFG.GROW_SCRIPT, host.host, threads, target, 0, "titanG");
                    if (pid !== 0) {
                        host.freeRam -= threads * ramGrow;
                        titanActions++;
                    }
                    continue;
                }

                let hackThreads = Math.floor(ns.hackAnalyzeThreads(target, Math.max(1, tCur * 0.05)));
                if (hackThreads < 1) hackThreads = 1;
                if (hackThreads > threads) hackThreads = threads;

                const pidHack = ns.exec(CFG.HACK_SCRIPT, host.host, hackThreads, target, 0, "titanH");
                if (pidHack !== 0) {
                    host.freeRam -= hackThreads * ramHack;
                    titanActions++;
                }

                let remaining = Math.floor(host.freeRam / ramWeaken);
                if (remaining > 0) {
                    const pidWeak = ns.exec(CFG.WEAKEN_SCRIPT, host.host, remaining, target, 0, "titanW2");
                    if (pidWeak !== 0) {
                        host.freeRam -= remaining * ramWeaken;
                        titanActions++;
                    }
                }
            }
        }

        if (loop % CFG.LOG_EVERY === 0) {
            const unhealthy = metrics.filter(m => m.health.needsMoney || m.health.needsSec).length;
            ns.clearLog();
            ns.print(`focus=${focusTargets.join(", ") || "-"} | targets=${targets.length} | unhealthy=${unhealthy}`);
            ns.print(`mainFree=${formatGb(totalFreeRam(mainHosts))} | netRam=${formatGb(totalNetworkRam)}`);
            ns.print(`auxActive=${totalNetworkRam >= CFG.AUX_MIN_NETWORK_RAM ? "YES" : "NO"} | repair=${repairActions} | titan=${titanActions}`);
            ns.print(`repairFree=${formatGb(totalFreeRam(repairHosts))} | titanFree=${formatGb(totalFreeRam(titanHosts))}`);
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
        } catch {}
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

    const desiredMoneyRatio = aggressive ? 0.97 : CFG.HEALTH_MONEY_TARGET;
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

    const hackPctPerThread = calcHackPctPerThread(ns, target, hasFormulas);
    if (!Number.isFinite(hackPctPerThread) || hackPctPerThread <= 0) return false;

    let hackThreads = Math.floor(CFG.DESIRED_HACK_FRACTION / hackPctPerThread);

    if (hackThreads < 1) {
        hackThreads = Math.floor((1 - CFG.HACK_MONEY_FLOOR) / hackPctPerThread);
    }
    if (hackThreads < 1) return false;

    const actualHackPct = hackThreads * hackPctPerThread;
    if (actualHackPct >= (1 - CFG.HACK_MONEY_FLOOR)) return false;

    const softConcurrent = Math.max(1, Math.floor((1 - CFG.HEALTH_MONEY_TARGET) / actualHackPct));
    const hardConcurrent = Math.max(1, Math.floor((1 - CFG.HACK_MONEY_FLOOR) / actualHackPct));
    const maxConcurrent = Math.min(CFG.MAX_BATCHES_PER_TARGET, softConcurrent, hardConcurrent);

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
    tState.inflight.push({ completeAt: anchor + 2 * CFG.BATCH_GAP });

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
        } catch {}
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

// Adjustments if fail
//FOCUS_COUNT: 1
//DESIRED_HACK_FRACTION: 0.05
//MAX_BATCHES_PER_TARGET: 3
//AUX_REPAIR_SHARE: 0.08
//AUX_TITAN_SHARE: 0.08
