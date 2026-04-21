/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.resizeTail(600, 400);

    const HACK_PROFIT = 0.05; // Steals exactly 5%
    const HOME_RESERVE = 20;  // RAM buffer on Home (set to 20GB)
    const scriptRAM = 1.75;

    while (true) {
        // 1. SCAN
        let servers = ["home"];
        for (let i = 0; i < servers.length; i++) {
            let scanRes = ns.scan(servers[i]);
            for (let s of scanRes) {
                if (!servers.includes(s)) servers.push(s);
            }
        }

        // 2. TARGET (Best reachable server)
        let target = "n00dles";
        let maxMoney = 0;
        for (let s of servers) {
            if (ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > maxMoney) {
                if (ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel()) {
                    maxMoney = ns.getServerMaxMoney(s);
                    target = s;
                }
            }
        }

        let minSec = ns.getServerMinSecurityLevel(target);
        let curSec = ns.getServerSecurityLevel(target);
        let tMaxMoney = ns.getServerMaxMoney(target);
        let curMoney = ns.getServerMoneyAvailable(target);

        // 3. THREAD CALCULATION
        let hThreads = Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, tMaxMoney * HACK_PROFIT)));
        let gThreads = Math.ceil(ns.growthAnalyze(target, 1.06)); // 6% Grow to offset 5% Hack + buffer
        let wThreads = Math.ceil((hThreads * 0.002 + gThreads * 0.004) / 0.05);
        
        let batchRam = (hThreads + gThreads + wThreads) * scriptRAM;

        // 4. EXECUTION
        let hosts = servers.filter(s => ns.hasRootAccess(s));
        for (let host of hosts) {
            let freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
            if (host === "home") freeRam -= HOME_RESERVE;
            if (freeRam < scriptRAM) continue;

            let availableThreads = Math.floor(freeRam / scriptRAM);

            // EMERGENCY RECOVERY (If server is "unhealthy")
            if (curSec > minSec + 0.1) {
                ns.exec("weaken.js", host, availableThreads, target);
            } else if (curMoney < tMaxMoney * 0.98) {
                ns.exec("grow.js", host, availableThreads, target);
            } else {
                // BALANCED BATCHING
                if (freeRam >= batchRam) {
                    ns.exec("hack.js", host, hThreads, target);
                    ns.exec("grow.js", host, gThreads, target);
                    ns.exec("weaken.js", host, wThreads, target);
                } else {
                    // Small server contribution (Ratio 1:7:2)
                    let w = Math.max(1, Math.floor(availableThreads * 0.2));
                    let g = Math.max(1, Math.floor(availableThreads * 0.7));
                    let h = Math.max(0, availableThreads - w - g);
                    if (w > 0) ns.exec("weaken.js", host, w, target);
                    if (g > 0) ns.exec("grow.js", host, g, target);
                    if (h > 0) ns.exec("hack.js", host, h, target);
                }
            }
        }

        ns.clearLog();
        ns.print(`TARGET:   ${target}`);
        ns.print(`MONEY:    ${ns.formatNumber(curMoney)} / ${ns.formatNumber(tMaxMoney)}`);
        ns.print(`SECURITY: +${(curSec - minSec).toFixed(3)}`);
        ns.print(`BATCH:    ${ns.formatRam(batchRam)}`);
        
        await ns.sleep(1000);
    }
}
