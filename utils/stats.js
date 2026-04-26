/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.resizeTail(700, 520);

    const UPDATE_MS = 1000;
    const HISTORY_LENGTH = 300;
    const MAX_PURCHASED_SERVERS = 25;

    let incomeHistory = [];
    let lastMoney = ns.getServerMoneyAvailable("home");

    while (true) {
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
        let totalThreads = 0;

        for (let s of allServers) {
            let serverInfo = ns.getServer(s);

            let maxRam = ns.getServerMaxRam(s);
            let usedRam = ns.getServerUsedRam(s);

            totalMaxRam += maxRam;
            totalUsedRam += usedRam;

            let processes = ns.ps(s);
            for (let proc of processes) {
                totalThreads += proc.threads;
            }

            if (serverInfo.purchasedByPlayer && s !== "home") {
                purchasedServers.push(s);
            } else if (ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > 0 && !serverInfo.purchasedByPlayer) {
                hackedServers.push(s);
            }
        }

        purchasedServers.sort((a, b) => {
            const ramDiff = ns.getServerMaxRam(b) - ns.getServerMaxRam(a);
            if (ramDiff !== 0) return ramDiff;

            const aNum = parseInt(a.replace("serv-", ""), 10);
            const bNum = parseInt(b.replace("serv-", ""), 10);
            return aNum - bNum;
        });

        hackedServers.sort((a, b) => ns.getServerMaxMoney(b) - ns.getServerMaxMoney(a));

        let currentMoney = ns.getServerMoneyAvailable("home");
        let delta = currentMoney - lastMoney;
        let incomeThisTick = delta > 0 ? delta : 0; 
        
        incomeHistory.push(incomeThisTick);
        if (incomeHistory.length > HISTORY_LENGTH) {
            incomeHistory.shift();
        }

        let incomePerSec = incomeHistory.length > 0
            ? incomeHistory.reduce((a, b) => a + b, 0) / incomeHistory.length
            : 0;

        let incomePerDay = incomePerSec * 86400;
        
        let hackIncomeOnly = ns.getTotalScriptIncome()[0]; 
        let hackShare = 0;
        let otherShare = 0;

        if (incomePerSec > 0) {
            hackShare = (hackIncomeOnly / incomePerSec) * 100;
            if (hackShare > 100) hackShare = 100;
            if (hackShare < 0) hackShare = 0;
            otherShare = 100 - hackShare;
        }

        lastMoney = currentMoney;

        let totalFreeRam = totalMaxRam - totalUsedRam;
        let usagePercent = totalMaxRam > 0 ? (totalUsedRam / totalMaxRam) * 100 : 0;

        let highestPurchased = purchasedServers.length > 0 ? purchasedServers[0] : null;
        let lowestPurchased = purchasedServers.length > 0 ? purchasedServers[purchasedServers.length - 1] : null;

        ns.clearLog();

        ns.print(`=== HACKED SERVERS (${hackedServers.length}/${allServers.length - 1}) ===`);
        ns.print(`${"NAME".padEnd(18)} | ${"RAM".padStart(8)} | ${"MONEY / MAX MONEY"}`);
        ns.print("-".repeat(60));
        for (let s of hackedServers.slice(0, 10)) {
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
            ns.print(`Highest RAM : ${highestPurchased.padEnd(10)} | ${ns.formatRam(used)} / ${ns.formatRam(max)}`);
        } else {
            ns.print("Highest RAM : -");
        }

        if (lowestPurchased) {
            const max = ns.getServerMaxRam(lowestPurchased);
            const used = ns.getServerUsedRam(lowestPurchased);
            ns.print(`Lowest RAM  : ${lowestPurchased.padEnd(10)} | ${ns.formatRam(used)} / ${ns.formatRam(max)}`);
        } else {
            ns.print("Lowest RAM  : -");
        }

        ns.print(`\n=== NETWORK RAM ===`);
        ns.print(`Total   : ${ns.formatRam(totalMaxRam)}`);
        ns.print(`Used    : ${ns.formatRam(totalUsedRam)}`);
        ns.print(`Free    : ${ns.formatRam(totalFreeRam)}`);
        ns.print(`Usage   : ${usagePercent.toFixed(2)}%`);
        ns.print(`Threads : ${totalThreads.toLocaleString()}`);

        ns.print(`\n=== INCOME [${new Date().toLocaleTimeString()}] ===`);
        ns.print(`$/s : ${ns.formatNumber(incomePerSec)}`);
        ns.print(`$/d : ${ns.formatNumber(incomePerDay)}`);
        
        if (incomePerSec > 0) {
            ns.print(`Share: Hacking ${hackShare.toFixed(1)}% | Others ${otherShare.toFixed(1)}%`);
        } else {
            ns.print(`Share: Calculating...`);
        }

        await ns.sleep(UPDATE_MS);
    }
}
