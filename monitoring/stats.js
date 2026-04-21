/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tail(); 
    ns.resizeTail(700, 450); // Set window size for better readability

    while (true) {
        ns.clearLog();
        
        let allServers = ["home"];
        for (let i = 0; i < allServers.length; i++) {
            let scanRes = ns.scan(allServers[i]);
            for (let server of scanRes) {
                if (!allServers.includes(server)) allServers.push(server);
            }
        }

        // Filter: Only servers with root access
        let rootServers = allServers.filter(s => ns.hasRootAccess(s));

        // Group 1: Own Servers (Home + purchased servers)
        let myServers = rootServers.filter(s => s === "home" || ns.getServer(s).purchasedByPlayer);
        
        // Group 2: Hacked Remote Servers (sorted by Max Money)
        let hackedServers = rootServers
            .filter(s => s !== "home" && !ns.getServer(s).purchasedByPlayer)
            .sort((a, b) => ns.getServerMaxMoney(b) - ns.getServerMaxMoney(a));

        const printRow = (name, ramUsed, ramMax, money, moneyMax) => {
            let moneyFmt = ns.nFormat(money, "$0.0a").padStart(7);
            let maxMoneyFmt = ns.nFormat(moneyMax, "$0.0a").padEnd(7);
            ns.print(
                `${name.padEnd(18)} | ` +
                `${ramUsed.toFixed(0).padStart(4)}/${ramMax.toString().padEnd(4)} GB | ` +
                `${moneyFmt} / ${maxMoneyFmt}`
            );
        };

        ns.print("=== OWNED SERVERS (HOME & PURCHASED) ===");
        ns.print(`${"NAME".padEnd(18)} | ${"RAM USAGE".padEnd(12)} | ${"MONEY"}`);
        myServers.forEach(s => printRow(s, ns.getServerUsedRam(s), ns.getServerMaxRam(s), 0, 0));

        ns.print("\n=== TARGET SERVERS (SORTED BY MAX MONEY) ===");
        hackedServers.forEach(s => {
            let maxMoney = ns.getServerMaxMoney(s);
            // Only show servers with money or RAM
            if (maxMoney > 0 || ns.getServerMaxRam(s) > 0) {
                printRow(s, ns.getServerUsedRam(s), ns.getServerMaxRam(s), ns.getServerMoneyAvailable(s), maxMoney);
            }
        });

        ns.print("-".repeat(65));
        let totalMaxRam = rootServers.reduce((a, b) => a + ns.getServerMaxRam(b), 0);
        let totalUsedRam = rootServers.reduce((a, b) => a + ns.getServerUsedRam(b), 0);
        ns.print(`Root Access:     ${rootServers.length} / ${allServers.length}`);
        ns.print(`Total RAM:       ${totalUsedRam.toFixed(1)} / ${totalMaxRam.toFixed(1)} GB`);
        ns.print(`Hacking Level:   ${ns.getHackingLevel()}`);

        await ns.sleep(2000);
    }
}
