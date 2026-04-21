/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.resizeTail(600, 420);

    const BUFFER = 100;
    const HOME_RESERVE = 20;
    const REFRESH_INTERVAL = 30000; 

    // Performance tracking variables
    let threadHistory = [];
    const HISTORY_SIZE = 10; // Keep track of the last 10 seconds

    const getAllServers = (ns) => {
        let servers = new Set(["home"]);
        servers.forEach(s => ns.scan(s).forEach(n => servers.add(n)));
        return Array.from(servers);
    };

    let allServers = getAllServers(ns);
    let lastLevel = ns.getHackingLevel();
    let lastServerCount = ns.getPurchasedServers().length;
    let lastRefresh = Date.now();

    while (true) {
        let currentLevel = ns.getHackingLevel();
        let currentServerCount = ns.getPurchasedServers().length;
        let currentTime = Date.now();
        let threadsStartedThisTick = 0;

        if (currentLevel > lastLevel || currentServerCount !== lastServerCount || (currentTime - lastRefresh) > REFRESH_INTERVAL) {
            allServers = getAllServers(ns);
            lastLevel = currentLevel;
            lastServerCount = currentServerCount;
            lastRefresh = currentTime;
        }

        let mainTarget = "n00dles";
        let maxMoney = 0;
        allServers.forEach(s => {
            if (ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > maxMoney && ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel()) {
                maxMoney = ns.getServerMaxMoney(s);
                mainTarget = s;
            }
        });

        let rootServers = allServers.filter(s => ns.hasRootAccess(s));
        let totalMaxRam = 0;
        let totalUsedRam = 0;

        for (let host of rootServers) {
            let hostRam = ns.getServerMaxRam(host);
            let hostUsed = ns.getServerUsedRam(host);
            totalMaxRam += hostRam;
            totalUsedRam += hostUsed;

            let freeRam = hostRam - hostUsed;
            if (host === "home") freeRam -= HOME_RESERVE;
            if (freeRam < 1.75) continue;

            let target = (host.startsWith("serv-") || host === "home") ? mainTarget : host;
            if (ns.getServerMaxMoney(target) <= 0) target = mainTarget;

            let tMax = ns.getServerMaxMoney(target);
            let tCur = ns.getServerMoneyAvailable(target);
            let tMinSec = ns.getServerMinSecurityLevel(target);
            let tCurSec = ns.getServerSecurityLevel(target);
            
            let threads = Math.floor(freeRam / 1.75);

            if (tCurSec > tMinSec + 0.1) {
                ns.exec("weaken.js", host, threads, target);
                threadsStartedThisTick += threads;
            } else if (tCur < tMax * 0.95) {
                ns.exec("grow.js", host, threads, target);
                threadsStartedThisTick += threads;
            } else {
                let hThreads = Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, tMax * 0.02)));
                let gThreads = Math.ceil(ns.growthAnalyze(target, 1.05));
                let wThreads = Math.ceil((hThreads * 0.002 + gThreads * 0.004) / 0.05) + 1;
                let batchRam = (hThreads + gThreads + wThreads) * 1.75;

                while (freeRam >= batchRam) {
                    let id = Date.now() + Math.random();
                    ns.exec("weaken.js", host, wThreads, target, id + "w");
                    ns.exec("grow.js", host, gThreads, target, id + "g");
                    ns.exec("hack.js", host, hThreads, target, id);
                    let totalBatchThreads = (hThreads + gThreads + wThreads);
                    threadsStartedThisTick += totalBatchThreads;
                    freeRam -= batchRam;
                }
            }
        }

        // Performance Math: Calculate threads per second
        threadHistory.push(threadsStartedThisTick);
        if (threadHistory.length > (1000 / BUFFER) * HISTORY_SIZE) threadHistory.shift();
        let avgThreadsPerSec = threadHistory.reduce((a, b) => a + b, 0) / (threadHistory.length * (BUFFER / 1000));

        ns.clearLog();
        ns.print(`--- TITAN VERSION ---`);
        ns.print(`TARGET:   ${mainTarget.toUpperCase()}`);
        ns.print(`MONEY:    ${ns.formatNumber(ns.getServerMoneyAvailable(mainTarget))} / ${ns.formatNumber(ns.getServerMaxMoney(mainTarget))}`);
        ns.print(`SECURITY: +${(ns.getServerSecurityLevel(mainTarget) - ns.getServerMinSecurityLevel(mainTarget)).toFixed(3)}`);
        ns.print(`----------------------------------`);
        ns.print(`NETWORK RAM:  ${ns.formatRam(totalUsedRam)} / ${ns.formatRam(totalMaxRam)}`);
        ns.print(`ROOT ACCESS:  ${rootServers.length} / ${allServers.length} Servers`);
        ns.print(`AVG SPEED:    ${ns.formatNumber(avgThreadsPerSec, 0)} Threads/s`);
        ns.print(`TOTAL ACTIVE: ${ns.formatNumber(totalUsedRam / 1.75, 0)} Running`);
        
        await ns.sleep(BUFFER);
    }
}
