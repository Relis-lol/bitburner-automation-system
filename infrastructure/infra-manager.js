/** @param {NS} ns **/
export async function main(ns) {
    const prefix = "serv-";
    const reserveLimit = 150000; 

    ns.disableLog("ALL"); // Schaltet wirklich alles aus
    ns.ui.openTail();
    ns.print("=== INFRASTRUCTURE MANAGER ACTIVE ===");

    while (true) {
        let servers = ["home"];
        for (let i = 0; i < servers.length; i++) {
            let scanResults = ns.scan(servers[i]);
            for (let server of scanResults) {
                if (!servers.includes(server)) servers.push(server);
            }
        }

        for (let host of servers) {
            if (!ns.hasRootAccess(host)) {
                let openablePorts = 0;
                if (ns.fileExists("BruteSSH.exe")) openablePorts++;
                if (ns.fileExists("FTPCrack.exe")) openablePorts++;
                if (ns.fileExists("relaySMTP.exe")) openablePorts++;
                if (ns.fileExists("HTTPWorm.exe")) openablePorts++;
                if (ns.fileExists("SQLInject.exe")) openablePorts++;

                let requiredPorts = ns.getServerNumPortsRequired(host);

                // Nur versuchen zu nuken, wenn wir genug Programme haben
                if (openablePorts >= requiredPorts) {
                    if (ns.fileExists("BruteSSH.exe")) ns.brutessh(host);
                    if (ns.fileExists("FTPCrack.exe")) ns.ftpcrack(host);
                    if (ns.fileExists("relaySMTP.exe")) ns.relaysmtp(host);
                    if (ns.fileExists("HTTPWorm.exe")) ns.httpworm(host);
                    if (ns.fileExists("SQLInject.exe")) ns.sqlinject(host);
                    
                    ns.nuke(host);
                    ns.print(`🔓 ROOT ACCESS GRANTED: ${host}`);
                }
            }

            if (ns.hasRootAccess(host) && host !== "home") {
                await ns.scp(["hack.js", "grow.js", "weaken.js"], host, "home");
            }
        }

        let money = ns.getServerMoneyAvailable("home");
        if (money > reserveLimit) {
            let spendable = money - reserveLimit;
            let myServers = ns.getPurchasedServers();
            
            if (myServers.length < ns.getPurchasedServerLimit()) {
                let cost = ns.getPurchasedServerCost(8);
                if (spendable > cost) {
                    let name = ns.purchaseServer(prefix + myServers.length, 8);
                    ns.print(`🛒 BOUGHT: ${name}`);
                }
            } else {
                for (let s of myServers) {
                    let currentRam = ns.getServerMaxRam(s);
                    let nextRam = currentRam * 2;
                    if (nextRam <= ns.getPurchasedServerMaxRam()) {
                        let cost = ns.getPurchasedServerCost(nextRam);
                        if (spendable > cost) {
                            ns.killall(s);
                            ns.deleteServer(s);
                            ns.purchaseServer(s, nextRam);
                            ns.print(`🆙 UPGRADE: ${s} to ${nextRam}GB`);
                            break; 
                        }
                    }
                }
            }
        }
        await ns.sleep(5000); 
    }
}
