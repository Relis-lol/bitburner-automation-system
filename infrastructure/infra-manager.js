/** @param {NS} ns **/
export async function main(ns) {
    const prefix = "serv-";
    // Increased reserve to 100k + 50k buffer for safety
    const reserveLimit = 150000; 

    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.print("=== INFRASTRUCTURE MANAGER STARTED ===");
    ns.print(`RESERVE LIMIT: $${ns.formatNumber(reserveLimit)} (Safety for Training)`);

    while (true) {
        // 1. NETWORK SCAN & SPREAD FILES
        let servers = ["home"];
        for (let i = 0; i < servers.length; i++) {
            let scanResults = ns.scan(servers[i]);
            for (let server of scanResults) {
                if (!servers.includes(server)) {
                    servers.push(server);
                }
            }
        }

        for (let host of servers) {
            // 2. AUTO-NUKE (OPEN ALL PORTS)
            if (!ns.hasRootAccess(host)) {
                if (ns.fileExists("BruteSSH.exe")) ns.brutessh(host);
                if (ns.fileExists("FTPCrack.exe")) ns.ftpcrack(host);
                if (ns.fileExists("relaySMTP.exe")) ns.relaysmtp(host);
                if (ns.fileExists("HTTPWorm.exe")) ns.httpworm(host);
                if (ns.fileExists("SQLInject.exe")) ns.sqlinject(host);
                
                try { 
                    ns.nuke(host); 
                    ns.print(`🔓 ROOT ACCESS GRANTED: ${host}`);
                } catch (e) { /* Not enough ports open yet */ }
            }

            // 3. COPY WORKER SCRIPTS
            if (ns.hasRootAccess(host) && host !== "home") {
                await ns.scp(["hack.js", "grow.js", "weaken.js"], host, "home");
            }
        }

        // 4. BUY & UPGRADE PURCHASED SERVERS
        let money = ns.getServerMoneyAvailable("home");
        
        // Only spend if we are above our safety reserve
        if (money > reserveLimit) {
            let spendable = money - reserveLimit;
            let myServers = ns.getPurchasedServers();
            
            if (myServers.length < ns.getPurchasedServerLimit()) {
                let cost = ns.getPurchasedServerCost(8);
                if (spendable > cost) {
                    let name = ns.purchaseServer(prefix + myServers.length, 8);
                    ns.print(`🛒 BOUGHT NEW SERVER: ${name}`);
                }
            } 
            else {
                for (let s of myServers) {
                    let currentRam = ns.getServerMaxRam(s);
                    let nextRam = currentRam * 2;
                    if (nextRam <= ns.getPurchasedServerMaxRam()) {
                        let cost = ns.getPurchasedServerCost(nextRam);
                        if (spendable > cost) {
                            ns.print(`🆙 UPGRADING ${s}: ${currentRam}GB -> ${nextRam}GB`);
                            ns.killall(s);
                            ns.deleteServer(s);
                            ns.purchaseServer(s, nextRam);
                            break; 
                        }
                    }
                }
            }
        }

        await ns.sleep(5000); 
    }
}
