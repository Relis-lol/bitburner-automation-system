/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.resizeTail(600, 420);

    const SLEEP_TIME = 100;
    const HOME_RESERVE_RAM = 20;

    // Helper to find every server in the network
    const getAllServers = () => {
        let serverList = new Set(["home"]);
        serverList.forEach(host => ns.scan(host).forEach(neighbor => serverList.add(neighbor)));
        return Array.from(serverList);
    };

    while (true) {
        let allServers = getAllServers();
        let crackedServers = allServers.filter(s => ns.hasRootAccess(s));

        let networkMaxRam = 0;
        let networkUsedRam = 0;

        // Collect servers that actually have money to steal
        let validTargets = crackedServers.filter(s => ns.getServerMaxMoney(s) > 0);

        // Sort targets by current value (Balance vs. Max Money)
        validTargets.sort((a, b) => {
            let scoreA = ns.getServerMaxMoney(a) * (ns.getServerMoneyAvailable(a) / ns.getServerMaxMoney(a));
            let scoreB = ns.getServerMaxMoney(b) * (ns.getServerMoneyAvailable(b) / ns.getServerMaxMoney(b));
            return scoreB - scoreA;
        });

        for (let host of crackedServers) {
            let maxRam = ns.getServerMaxRam(host);
            let usedRam = ns.getServerUsedRam(host);

            networkMaxRam += maxRam;
            networkUsedRam += usedRam;

            let availableRam = maxRam - usedRam;
            if (host === "home") availableRam -= HOME_RESERVE_RAM;
            
            // Skip if not enough RAM for a single basic hack script (1.75GB)
            if (availableRam < 1.75) continue;

            let totalThreads = Math.floor(availableRam / 1.75);

            // Primary strategy: Target the most profitable server
            let primaryTarget = validTargets[0];

            // If it's a weak local server (not a purchased one), let it hack itself
            if (!host.startsWith("serv-") && host !== "home") {
                primaryTarget = host;
            }

            let maxMoney = ns.getServerMaxMoney(primaryTarget);
            let currentMoney = ns.getServerMoneyAvailable(primaryTarget);
            let minSecurity = ns.getServerMinSecurityLevel(primaryTarget);
            let currentSecurity = ns.getServerSecurityLevel(primaryTarget);

            // STABILITY LOGIC: Lower security first
            if (currentSecurity > minSecurity + 1) {
                ns.exec("weaken.js", host, totalThreads, primaryTarget);
                continue;
            }

            // GROWTH LOGIC: Refill money if below 75%
            if (currentMoney < maxMoney * 0.75) {
                ns.exec("grow.js", host, totalThreads, primaryTarget);
                continue;
            }

            // CONTROLLED HACKING: Steal approx 5% to avoid draining it
            let hackThreads = Math.floor(ns.hackAnalyzeThreads(primaryTarget, currentMoney * 0.05));

            if (hackThreads < 1) hackThreads = 1;
            if (hackThreads > totalThreads) hackThreads = totalThreads;

            ns.exec("hack.js", host, hackThreads, primaryTarget);

            // Use leftover threads on the same host to keep security low
            let remainingThreads = totalThreads - hackThreads;
            if (remainingThreads > 0) {
                ns.exec("weaken.js", host, remainingThreads, primaryTarget);
            }
        }

        // UI Dashboard
        ns.clearLog();
        ns.print(`--- NETWORK MONITOR ---`);
        ns.print(`TARGETS AVAILABLE:  ${validTargets.length}`);
        ns.print(`----------------------------------`);
        ns.print(`NETWORK RAM: ${ns.formatRam(networkUsedRam)} / ${ns.formatRam(networkMaxRam)}`);
        ns.print(`ROOT ACCESSES: ${crackedServers.length}`);

        await ns.sleep(SLEEP_TIME);
    }
}
