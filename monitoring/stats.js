/** @param {NS} ns **/
export async function main(ns) {
    // Disable standard logging to keep the UI clean
    ns.disableLog("ALL");
    
    // Modern UI commands (Future-proof)
    ns.ui.openTail(); 
    ns.ui.resizeTail(700, 450); 

    while (true) {
        ns.clearLog();
        
        // 1. NETWORK SCAN
        let allServers = ["home"];
        for (let i = 0; i < allServers.length; i++) {
            let scanRes = ns.scan(allServers[i]);
            for (let server of scanRes) {
                if (!allServers.includes(server)) allServers.push(server);
            }
        }

        // Filter: Only servers with root access
        let rootServers = allServers.filter(s => ns.hasRootAccess(s));

        // Group 1: Player-owned servers (Home + Purchased)
        let myServers = rootServers.filter(s => s === "home" || ns.getServer(s).purchasedByPlayer);
        
        // Group 2: Hacked remote servers (Sorted by Max Money)
        let hackedServers = rootServers
            .filter(s => s !== "home" && !ns.getServer(s).purchasedByPlayer)
            .sort((a, b) => ns.getServerMaxMoney(b) - ns.getServerMaxMoney(a));

        // Helper function for row formatting using modern ns.formatNumber
        const printRow = (name, ramUsed, ramMax, money, moneyMax) => {
            let moneyFmt = ns.formatNumber(money).padStart(7);
            let maxMoneyFmt = ns.formatNumber(moneyMax).padEnd(7);
            ns.print(
                `${name.padEnd(18)} | ` +
                `${ramUsed.toFixed(0).padStart(4)}/${ramMax.toString().padEnd(4)} GB | ` +
                `${moneyFmt} / ${maxMoneyFmt}`
            );
        };

        // UI Header: Owned Servers
        ns.print("=== OWNED SERVERS (HOME & PURCHASED) ===");
        ns.print(`${"NAME".padEnd(18)} | ${"RAM USAGE".padEnd(12)} | ${"MONEY"}`);
        myServers.forEach(s => printRow(s, ns.getServerUsedRam(s), ns.getServerMaxRam(s), 0, 0));

        // UI Header: Remote Targets
        ns.print("\n=== HACKED REMOTE SERVERS (SORTED BY MAX MONEY) ===");
        hackedServers.forEach(s => {
            let maxMoney = ns.getServerMaxMoney(s);
            // Show only servers that have money or provide RAM
            if (maxMoney > 0 || ns.getServerMaxRam(s) > 0) {
                printRow(s, ns.getServerUsedRam(s), ns.getServerMaxRam(s), ns.getServerMoneyAvailable(s), maxMoney);
            }
        });

        // Footer: Global Stats
        ns.print("-".repeat(65));
        let totalMaxRam = rootServers.reduce((a, b) => a + ns.getServerMaxRam(b), 0);
        let totalUsedRam = rootServers.reduce((a, b) => a + ns.getServerUsedRam(b), 0);
        
        ns.print(`Root Access:     ${rootServers.length} / ${allServers.length} Servers`);
        ns.print(`Network RAM:     ${ns.formatRam(totalUsedRam)} / ${ns.formatRam(totalMaxRam)}`);

        await ns.sleep(2000);
    }
}
