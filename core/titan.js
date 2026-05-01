/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tprint("--- TITAN SOLO STARTED ---");

    const LOOP_DELAY = 3000;
    const HOME_RESERVE = 8;

    const HACK_SCRIPT = "hack2.js";
    const GROW_SCRIPT = "grow2.js";
    const WEAKEN_SCRIPT = "weaken2.js";

    const WORKER_SCRIPTS = [HACK_SCRIPT, GROW_SCRIPT, WEAKEN_SCRIPT];

    function getAllServers() {
        const found = new Set(["home"]);
        const stack = ["home"];

        while (stack.length > 0) {
            const server = stack.pop();

            for (const next of ns.scan(server)) {
                if (!found.has(next)) {
                    found.add(next);
                    stack.push(next);
                }
            }
        }

        return [...found];
    }

    function tryRoot(server) {
        if (server === "home") return true;
        if (ns.hasRootAccess(server)) return true;

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
            return true;
        }

        return false;
    }

    async function deployScripts(server) {
        if (server === "home") return;

        for (const script of WORKER_SCRIPTS) {
            if (!ns.fileExists(script, server)) {
                await ns.scp(script, server);
            }
        }
    }

    function getBestTarget(servers) {
        const playerSkill = ns.getHackingLevel();

        const targets = servers
            .filter(s =>
                ns.hasRootAccess(s) &&
                ns.getServerMaxMoney(s) > 0 &&
                ns.getServerRequiredHackingLevel(s) <= playerSkill
            )
            .map(s => {
                const maxMoney = ns.getServerMaxMoney(s);
                const curMoney = ns.getServerMoneyAvailable(s);
                const minSec = ns.getServerMinSecurityLevel(s);
                const curSec = ns.getServerSecurityLevel(s);
                const growth = ns.getServerGrowth(s);

                const moneyRatio = curMoney / maxMoney;
                const secPenalty = Math.max(1, curSec - minSec + 1);

                const score = (maxMoney * moneyRatio * growth) / secPenalty;

                return { name: s, score };
            })
            .sort((a, b) => b.score - a.score);

        return targets.length > 0 ? targets[0].name : null;
    }

    while (true) {
        const allServers = getAllServers();

        let rooted = 0;
        let usableHosts = 0;
        let totalMaxRam = 0;
        let totalUsedRam = 0;

        const actions = {
            hack: 0,
            grow: 0,
            weaken: 0
        };

        for (const server of allServers) {
            tryRoot(server);

            if (ns.hasRootAccess(server)) {
                rooted++;
                await deployScripts(server);
            }
        }

        const rootServers = allServers.filter(s => ns.hasRootAccess(s));
        const bestTarget = getBestTarget(rootServers);

        for (const host of rootServers) {
            const maxRam = ns.getServerMaxRam(host);
            const usedRam = ns.getServerUsedRam(host);

            totalMaxRam += maxRam;
            totalUsedRam += usedRam;

            if (maxRam <= 0) continue;

            let freeRam = maxRam - usedRam;

            if (host === "home") {
                freeRam -= HOME_RESERVE;
            }

            if (freeRam <= 0) continue;

            const hackRam = ns.getScriptRam(HACK_SCRIPT, host);
            const growRam = ns.getScriptRam(GROW_SCRIPT, host);
            const weakenRam = ns.getScriptRam(WEAKEN_SCRIPT, host);

            const minWorkerRam = Math.min(hackRam, growRam, weakenRam);

            if (freeRam < minWorkerRam) continue;

            usableHosts++;

            let target = bestTarget;

            const hostCanSelfHack =
                host !== "home" &&
                ns.getServerMaxMoney(host) > 0 &&
                ns.getServerRequiredHackingLevel(host) <= ns.getHackingLevel();

            if (hostCanSelfHack) {
                target = host;
            }

            if (!target) continue;

            const maxMoney = ns.getServerMaxMoney(target);
            const curMoney = ns.getServerMoneyAvailable(target);
            const minSec = ns.getServerMinSecurityLevel(target);
            const curSec = ns.getServerSecurityLevel(target);

            let script;
            let ramPerThread;

            if (curSec > minSec + 3) {
                script = WEAKEN_SCRIPT;
                ramPerThread = weakenRam;
                actions.weaken++;
            } else if (curMoney < maxMoney * 0.70) {
                script = GROW_SCRIPT;
                ramPerThread = growRam;
                actions.grow++;
            } else {
                script = HACK_SCRIPT;
                ramPerThread = hackRam;
                actions.hack++;
            }

            let threads = Math.floor(freeRam / ramPerThread);

            if (threads < 1) continue;

            if (script === HACK_SCRIPT) {
                const wantedHackThreads = Math.floor(
                    ns.hackAnalyzeThreads(target, curMoney * 0.05)
                );

                threads = Math.max(1, Math.min(threads, wantedHackThreads));
            }

            ns.exec(script, host, threads, target);
        }

        ns.clearLog();
        ns.print("--- TITAN SOLO RUNNING ---");
        ns.print(`Best Target:   ${bestTarget ?? "none"}`);
        ns.print(`Root Access:   ${rooted} / ${allServers.length}`);
        ns.print(`Usable Hosts:  ${usableHosts}`);
        ns.print(`Network RAM:   ${ns.formatRam(totalUsedRam)} / ${ns.formatRam(totalMaxRam)}`);
        ns.print("--------------------------------");
        ns.print(`Hack Jobs:     ${actions.hack}`);
        ns.print(`Grow Jobs:     ${actions.grow}`);
        ns.print(`Weaken Jobs:   ${actions.weaken}`);

        await ns.sleep(LOOP_DELAY);
    }
}
