/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.resizeTail(700, 500);

    let lastMoney = ns.getServerMoneyAvailable("home");
    let lastTime = Date.now();

    while (true) {
        // 1. SCAN ALL SERVERS
        let allServers = ["home"];
        for (let i = 0; i < allServers.length; i++) {
            let scanRes = ns.scan(allServers[i]);
            for (let s of scanRes) {
                if (!allServers.includes(s)) allServers.push(s);
            }
        }

        let purchasedServers = [];
        let hackedServers = [];

        let totalMaxRam = 0;
        let totalUsedRam = 0;

        for (let s of allServers) {
            let serverInfo = ns.getServer(s);

            let maxRam = ns.getServerMaxRam(s);
            let usedRam = ns.getServerUsedRam(s);

            totalMaxRam += maxRam;
            totalUsedRam += usedRam;

            if (serverInfo.purchasedByPlayer && s !== "home") {
                purchasedServers.push(s);
            } 
            else if (ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > 0 && !serverInfo.purchasedByPlayer) {
                hackedServers.push(s);
            }
        }

        // SORTING
        purchasedServers.sort((a, b) => ns.getServerMaxRam(b) - ns.getServerMaxRam(a));
        hackedServers.sort((a, b) => ns.getServerMaxMoney(b) - ns.getServerMaxMoney(a));

        // INCOME CALC
        let currentMoney = ns.getServerMoneyAvailable("home");
        let currentTime = Date.now();

        let deltaMoney = currentMoney - lastMoney;
        let deltaTime = (currentTime - lastTime) / 1000;

        let incomePerSec = 0;
        let incomePerMin = 0;
        let incomePerHour = 0;
        let incomePerDay = 0;

        if (Number.isFinite(deltaMoney) && Number.isFinite(deltaTime) && deltaTime > 0) {
            incomePerSec = deltaMoney / deltaTime;
            incomePerMin = incomePerSec * 60;
            incomePerHour = incomePerSec * 3600;
            incomePerDay = incomePerSec * 86400;
        }

        // optional: negative spikes durch Käufe etc. nicht anzeigen
        incomePerSec = Math.max(0, incomePerSec);
        incomePerMin = Math.max(0, incomePerMin);
        incomePerHour = Math.max(0, incomePerHour);
        incomePerDay = Math.max(0, incomePerDay);

        lastMoney = currentMoney;
        lastTime = currentTime;

        // RAM CALC
        let totalFreeRam = totalMaxRam - totalUsedRam;
        let usagePercent = totalMaxRam > 0 ? (totalUsedRam / totalMaxRam) * 100 : 0;

        // UI
        ns.clearLog();
        ns.print(`[${new Date().toLocaleTimeString()}] UPDATE EVERY 30S`);

        // PURCHASED
        ns.print("\n=== PURCHASED SERVERS ===");
        ns.print(`${"NAME".padEnd(18)} | ${"USED RAM".padStart(10)} / ${"MAX RAM"}`);
        ns.print("-".repeat(50));
        for (let s of purchasedServers) {
            let ram = ns.getServerMaxRam(s);
            let used = ns.getServerUsedRam(s);
            ns.print(`${s.padEnd(18)} | ${ns.formatRam(used).padStart(10)} / ${ns.formatRam(ram)}`);
        }

        // HACKED
        ns.print("\n=== HACKED SERVERS ===");
        ns.print(`${"NAME".padEnd(18)} | ${"RAM".padStart(8)} | ${"MONEY / MAX MONEY"}`);
        ns.print("-".repeat(60));
        for (let s of hackedServers) {
            let curM = ns.getServerMoneyAvailable(s);
            let maxM = ns.getServerMaxMoney(s);
            let ram = ns.getServerMaxRam(s);
            ns.print(`${s.padEnd(18)} | ${ns.formatRam(ram).padStart(8)} | ${ns.formatNumber(curM).padStart(8)} / ${ns.formatNumber(maxM)}`);
        }

        // RAM STATS
        ns.print("\n=== NETWORK RAM ===");
        ns.print(`Total : ${ns.formatRam(totalMaxRam)}`);
        ns.print(`Used  : ${ns.formatRam(totalUsedRam)}`);
        ns.print(`Free  : ${ns.formatRam(totalFreeRam)}`);
        ns.print(`Usage : ${usagePercent.toFixed(2)}%`);

        // INCOME STATS
        ns.print("\n=== INCOME ===");
        ns.print(`$ / sec  : ${ns.formatNumber(incomePerSec)}`);
        ns.print(`$ / min  : ${ns.formatNumber(incomePerMin)}`);
        ns.print(`$ / hour : ${ns.formatNumber(incomePerHour)}`);
        ns.print(`$ / day  : ${ns.formatNumber(incomePerDay)}`);

        await ns.sleep(10000);
    }
}
