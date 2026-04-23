/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.resizeTail(700, 540);

    const UPDATE_MS = 1000; // 1s
    const HISTORY_LENGTH = 300; // 5 min rolling average at 1s intervals
    const MAX_PURCHASED_SERVERS = 25;
    const ACTIVE_TARGET_COUNT = 4;

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

        // INCOME CALC (real script income, smoothed internally over 5 minutes)
        let incomePerSecLive = Math.max(0, ns.getTotalScriptIncome()[0]);
        incomeHistory.push(incomePerSecLive);
        if (incomeHistory.length > HISTORY_LENGTH) {
            incomeHistory.shift();
        }

        let incomePerSec = incomeHistory.length > 0
            ? incomeHistory.reduce((a, b) => a + b, 0) / incomeHistory.length
            : 0;

        let incomePerDay = incomePerSec * 86400;

        // RAM CALC
        let totalFreeRam = totalMaxRam - totalUsedRam;
        let usagePercent = totalMaxRam > 0 ? (totalUsedRam / totalMaxRam) * 100 : 0;

        // PURCHASED SUMMARY
        let highestPurchased = purchasedServers.length > 0 ? purchasedServers[0] : null;
        let lowestPurchased = purchasedServers.length > 0 ? purchasedServers[purchasedServers.length - 1] : null;

        // ACTIVE TARGETS
        let activeTargets = hackedServers
            .map(s => {
                let curM = ns.getServerMoneyAvailable(s);
                let maxM = ns.getServerMaxMoney(s);
                let minSec = ns.getServerMinSecurityLevel(s);
                let curSec = ns.getServerSecurityLevel(s);

                let moneyRatio = maxM > 0 ? (curM / maxM) * 100 : 0;
                let secDelta = curSec - minSec;

                let pressureScore = (100 - moneyRatio) + (secDelta * 12);

                return {
                    name: s,
                    moneyRatio,
                    secDelta,
                    pressureScore,
                };
            })
            .sort((a, b) => b.pressureScore - a.pressureScore)
            .slice(0, ACTIVE_TARGET_COUNT);

        // UI
        ns.clearLog();

        ns.print(`=== HACKED SERVERS (${hackedServers.length}/${allServers.length - 1}) ===`);
        ns.print(`${"NAME".padEnd(18)} | ${"RAM".padStart(8)} | ${"MONEY / MAX MONEY"}`);
        ns.print("-".repeat(60));
        for (let s of hackedServers) {
            let curM = ns.getServerMoneyAvailable(s);
            let maxM = ns.getServerMaxMoney(s);
            let ram = ns.getServerMaxRam(s);
            ns.print(
                `${s.padEnd(18)} | ${ns.formatRam(ram).padStart(8)} | ` +
                `${ns.formatNumber(curM).padStart(8)} / ${ns.formatNumber(maxM)}`
            );
        }

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

        ns.print(`\n=== ACTIVE TARGETS ===`);
        if (activeTargets.length === 0) {
            ns.print("No active rooted money targets found.");
        } else {
            ns.print(`${"NAME".padEnd(18)} | ${"MONEY".padStart(7)} | ${"SEC"}`);
            ns.print("-".repeat(46));
            for (let t of activeTargets) {
                ns.print(
                    `${t.name.padEnd(18)} | ` +
                    `${(t.moneyRatio.toFixed(1) + "%").padStart(7)} | ` +
                    `+${t.secDelta.toFixed(2)}`
                );
            }
        }

        ns.print(`\n=== NETWORK RAM ===`);
        ns.print(`Total : ${ns.formatRam(totalMaxRam)}`);
        ns.print(`Used  : ${ns.formatRam(totalUsedRam)}`);
        ns.print(`Free  : ${ns.formatRam(totalFreeRam)}`);
        ns.print(`Usage : ${usagePercent.toFixed(2)}%`);

        ns.print(`\n=== INCOME [${new Date().toLocaleTimeString()}] ===`);
        ns.print(`$/s : ${ns.formatNumber(incomePerSec)}`);
        ns.print(`$/d : ${ns.formatNumber(incomePerDay)}`);

        await ns.sleep(UPDATE_MS);
    }
}
