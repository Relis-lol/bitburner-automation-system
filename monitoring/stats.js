/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.resizeTail(700, 500);

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

        for (let s of allServers) {
            let serverInfo = ns.getServer(s);
            
            // Filter Purchased Servers (excluding home)
            if (serverInfo.purchasedByPlayer && s !== "home") {
                purchasedServers.push(s);
            } 
            // Filter Hacked Servers (Root access and money > 0, excluding purchased/home)
            else if (ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > 0 && !serverInfo.purchasedByPlayer) {
                hackedServers.push(s);
            }
        }

        // 2. SORTING
        // Sort purchased servers by Max RAM (highest first)
        purchasedServers.sort((a, b) => ns.getServerMaxRam(b) - ns.getServerMaxRam(a));
        
        // Sort hacked servers by Max Money (highest first)
        hackedServers.sort((a, b) => ns.getServerMaxMoney(b) - ns.getServerMaxMoney(a));

        // 3. UI RENDERING
        ns.clearLog();
        ns.print(`[${new Date().toLocaleTimeString()}] UPDATE EVERY 30S`);
        
        ns.print("\n=== PURCHASED SERVERS (Sorted by RAM) ===");
        ns.print(`${"NAME".padEnd(18)} | ${"USED RAM".padStart(10)} / ${"MAX RAM"}`);
        ns.print("-".repeat(50));
        for (let s of purchasedServers) {
            let ram = ns.getServerMaxRam(s);
            let used = ns.getServerUsedRam(s);
            ns.print(`${s.padEnd(18)} | ${ns.formatRam(used).padStart(10)} / ${ns.formatRam(ram)}`);
        }

        ns.print("\n=== HACKED SERVERS (Sorted by Max Money) ===");
        ns.print(`${"NAME".padEnd(18)} | ${"RAM".padStart(8)} | ${"MONEY / MAX MONEY"}`);
        ns.print("-".repeat(60));
        for (let s of hackedServers) {
            let curM = ns.getServerMoneyAvailable(s);
            let maxM = ns.getServerMaxMoney(s);
            let ram = ns.getServerMaxRam(s);
            ns.print(`${s.padEnd(18)} | ${ns.formatRam(ram).padStart(8)} | ${ns.formatNumber(curM).padStart(8)} / ${ns.formatNumber(maxM)}`);
        }

        // 4. WAIT 30 SECONDS
        await ns.sleep(30000);
    }
}
