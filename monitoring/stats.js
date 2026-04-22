/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.resizeTail(700, 500);

    const UPDATE_MS = 10000;
    const HISTORY_LENGTH = 6; // 60s rolling average
    const MAX_PURCHASED_SERVERS = 25;

    let lastMoney = ns.getServerMoneyAvailable("home");
    let lastTime = Date.now();
    let incomeHistory = [];

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
            } else if (ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > 0 && !serverInfo.purchasedByPlayer) {
                hackedServers.push(s);
            }
        }

        // SORTING
        purchasedServers.sort((a, b) => {
            const ramDiff = ns.getServerMaxRam(b) - ns.getServerMaxRam(a);
            if (ramDiff !== 0) return ramDiff;

            const aNum = parseInt(a.replace("serv-", ""), 10);
            const bNum = parseInt(b.replace("serv-", ""), 10);
            return aNum - bNum;
        });

        hackedServers.sort((a, b) => ns.getServerMaxMoney(b) - ns.getServerMaxMoney(a));

        // INCOME CALC
        let currentMoney = ns.getServerMoneyAvailable("home");
        let currentTime = Date.now();

        let deltaMoney = currentMoney - lastMoney;
        let deltaTime = (currentTime - lastTime) / 1000;

        let incomePerSecInstant = 0;

        if (Number.isFinite(deltaMoney) && Number.isFinite(deltaTime) && deltaTime > 0) {
            incomePerSecInstant = deltaMoney / deltaTime;
        }

        incomePerSecInstant = Math.max(0, incomePerSecInstant);

        incomeHistory.push(incomePerSecInstant);
        if (incomeHistory.length > HISTORY_LENGTH) {
            incomeHistory.shift();
        }

        let incomePerSec = incomeHistory.length > 0
            ? incomeHistory.reduce((a, b) => a + b, 0) / incomeHistory.length
            : 0;

        let incomePerMin = incomePerSec * 60;
        let incomePerHour = incomePerSec * 3600;
        let incomePerDay = incomePerSec * 86400;

        lastMoney = currentMoney;
        lastTime = currentTime;

        // RAM CALC
        let totalFreeRam = totalMaxRam - totalUsedRam;
        let usagePercent = totalMaxRam > 0 ? (totalUsedRam / totalMaxRam) * 100 : 0;

        // PURCHASED SUMMARY
        let highestPurchased = purchasedServers.length > 0 ? purchasedServers[0] : null;
        let lowestPurchased = purchasedServers.length > 0 ? purchasedServers[purchasedServers.length - 1] : null;

        // UI
        ns.clearLog();

        // HACKED SERVERS FIRST
        ns.print(`=== HACKED SERVERS (${hackedServers.length}/${allServers.length - 1}) ===`);
        ns.print(`${"NAME".padEnd(18)} | ${"RAM".padStart(8)} | ${"MONEY / MAX MONEY"}`);
        ns.print("-".repeat(60));
        for (let s of hackedServers) {
            let curM = ns.getServerMoneyAvailable(s);
            let maxM = ns.getServerMaxMoney(s);
            let ram = ns.getServerMaxRam(s);
            ns.print(`${s.padEnd(18)} | ${ns.formatRam(ram).padStart(8)} | ${ns.formatNumber(curM).padStart(8)} / ${ns.formatNumber(maxM)}`);
        }

        // PURCHASED SUMMARY SECOND
        ns.print(`\n=== PURCHASED SERVERS (${purchasedServers.length}/${MAX_PURCHASED_SERVERS}) ===`);

        if (highestPurchased) {
            const max = ns.getServerMaxRam(highestPurchased);
            const used = ns.getServerUsedRam(highestPurchased);
            ns.print(`Highest RAM : ${highestPurchased} | ${ns.formatRam(used)} / ${ns.formatRam(max)}`);
        } else {
            ns.print("Highest RAM : -");
        }

        if (lowestPurchased) {
            const max = ns.getServerMaxRam(lowestPurchased);
            const used = ns.getServerUsedRam(lowestPurchased);
            ns.print(`Lowest RAM  : ${lowestPurchased} | ${ns.formatRam(used)} / ${ns.formatRam(max)}`);
        } else {
            ns.print("Lowest RAM  : -");
        }

        // NETWORK RAM
        ns.print("\n=== NETWORK RAM ===");
        ns.print(`Total : ${ns.formatRam(totalMaxRam)}`);
        ns.print(`Used  : ${ns.formatRam(totalUsedRam)}`);
        ns.print(`Free  : ${ns.formatRam(totalFreeRam)}`);
        ns.print(`Usage : ${usagePercent.toFixed(2)}%`);

        // INCOME WITH TIMESTAMP
        ns.print(`\n=== INCOME (60s AVG) [${new Date().toLocaleTimeString()}] ===`);
        ns.print(`$ / sec  : ${ns.formatNumber(incomePerSec)}`);
        ns.print(`$ / min  : ${ns.formatNumber(incomePerMin)}`);
        ns.print(`$ / hour : ${ns.formatNumber(incomePerHour)}`);
        ns.print(`$ / day  : ${ns.formatNumber(incomePerDay)}`);

        await ns.sleep(UPDATE_MS);
    }
}
