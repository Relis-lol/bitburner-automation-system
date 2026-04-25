/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    
    // Terminal notification instead of a popup
    ns.tprint("--- TITAN STARTED ---");

    const BUFFER = 100;
    const HOME_RESERVE = 20;

    const getAllServers = () => {
        let set = new Set(["home"]);
        set.forEach(s => ns.scan(s).forEach(n => set.add(n)));
        return Array.from(set);
    };

    while (true) {
        let allServers = getAllServers();
        let rootServers = allServers.filter(s => ns.hasRootAccess(s));

        let totalMaxRam = 0;
        let totalUsedRam = 0;

        // Collect all relevant targets
        let targets = rootServers.filter(s => ns.getServerMaxMoney(s) > 0);

        // Sort targets by "Value + State"
        targets.sort((a, b) => {
            let aScore = ns.getServerMaxMoney(a) * (ns.getServerMoneyAvailable(a) / ns.getServerMaxMoney(a));
            let bScore = ns.getServerMaxMoney(b) * (ns.getServerMoneyAvailable(b) / ns.getServerMaxMoney(b));
            return bScore - aScore;
        });

        for (let host of rootServers) {
            let maxRam = ns.getServerMaxRam(host);
            let usedRam = ns.getServerUsedRam(host);

            totalMaxRam += maxRam;
            totalUsedRam += usedRam;

            let freeRam = maxRam - usedRam;
            if (host === "home") freeRam -= HOME_RESERVE;
            if (freeRam < 1.75) continue;

            let threads = Math.floor(freeRam / 1.75);
            
            // Choose target for this host
            let target = targets[0]; 

            // Small servers work on themselves
            if (!host.startsWith("serv-") && host !== "home") {
                target = host;
            }

            let tMax = ns.getServerMaxMoney(target);
            let tCur = ns.getServerMoneyAvailable(target);
            let tMin = ns.getServerMinSecurityLevel(target);
            let tSec = ns.getServerSecurityLevel(target);

            // STABILITY LOGIC
            if (tSec > tMin + 1) {
                ns.exec("weaken.js", host, threads, target);
                continue;
            }

            if (tCur < tMax * 0.75) {
                ns.exec("grow.js", host, threads, target);
                continue;
            }

            // CONTROLLED HACKING (MAX 5%)
            let hackThreads = Math.floor(ns.hackAnalyzeThreads(target, tCur * 0.05));

            if (hackThreads < 1) hackThreads = 1;
            if (hackThreads > threads) hackThreads = threads;

            ns.exec("hack.js", host, hackThreads, target);

            let remaining = threads - hackThreads;

            if (remaining > 0) {
                ns.exec("weaken.js", host, remaining, target);
            }
        }

        // Dashboard in Log Window
        ns.clearLog();
        ns.print(`--- TITAN RUNNING ---`);
        ns.print(`TARGETS:      ${targets.length}`);
        ns.print(`----------------------------------`);
        ns.print(`NETWORK RAM:  ${ns.formatRam(totalUsedRam)} / ${ns.formatRam(totalMaxRam)}`);
        ns.print(`ROOT ACCESS:  ${rootServers.length}`);

        await ns.sleep(BUFFER);
    }
}
