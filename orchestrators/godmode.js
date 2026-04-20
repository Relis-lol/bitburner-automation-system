/** @param {NS} ns */
export async function main(ns) {
    const prefix = "serv-"; 
    const reserveLimit = 2500000; // Die 2,5-Millionen-Sperre

    while (true) {
        // 1. Netzwerk-Scan & Root-Zugriff
        let servers = ["home"];
        for (let i = 0; i < servers.length; i++) {
            let scanResults = ns.scan(servers[i]);
            for (let server of scanResults) {
                if (!servers.includes(server)) servers.push(server);
            }
        }

        // 2. Bestes Ziel finden
        let bestTarget = "n00dles";
        let maxMoney = 0;
        for (let s of servers) {
            if (ns.hasRootAccess(s) && ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel() / 2) {
                if (ns.getServerMaxMoney(s) > maxMoney) {
                    maxMoney = ns.getServerMaxMoney(s);
                    bestTarget = s;
                }
            }
        }

        // 3. AUTO-SERVER-KAUF & UPGRADE (mit Sperre)
        let myServers = ns.getPurchasedServers();
        let money = ns.getServerMoneyAvailable("home");

        // Wir prüfen: Haben wir mehr als die Reserve?
        if (money > reserveLimit) {
            let spendableMoney = money - reserveLimit;

            if (myServers.length < ns.getPurchasedServerLimit()) {
                let cost = ns.getPurchasedServerCost(8);
                if (spendableMoney > cost) {
                    let name = prefix + myServers.length;
                    ns.purchaseServer(name, 8);
                    ns.tprint("Gekauft: " + name);
                }
            } else {
                for (let s of myServers) {
                    let currentRam = ns.getServerMaxRam(s);
                    let nextRam = currentRam * 2;
                    if (nextRam <= ns.getPurchasedServerMaxRam()) {
                        let upgradeCost = ns.getPurchasedServerCost(nextRam);
                        if (spendableMoney > upgradeCost) {
                            ns.killall(s);
                            ns.deleteServer(s);
                            ns.purchaseServer(s, nextRam);
                            ns.tprint(`Upgrade: ${s} auf ${nextRam}GB`);
                            break; 
                        }
                    }
                }
            }
        }

        // 4. Skripte verteilen und hacken
        for (let host of servers) {
            if (!ns.hasRootAccess(host)) {
                if (ns.fileExists("BruteSSH.exe")) ns.brutessh(host);
                if (ns.fileExists("FTPCrack.exe")) ns.ftpcrack(host);
                if (ns.fileExists("relaySMTP.exe")) ns.relaysmtp(host);
                if (ns.fileExists("HTTPWorm.exe")) ns.httpworm(host);
                if (ns.fileExists("SQLInject.exe")) ns.sqlinject(host);
                try { ns.nuke(host); } catch(e) {}
            }

            if (ns.hasRootAccess(host)) {
                await ns.scp(["hack.js", "grow.js", "weaken.js"], host, "home");
                let freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
                if (host === "home") freeRam -= 20; 

                let threads = Math.floor(freeRam / 1.75);
                if (threads > 0) {
                    if (ns.getServerSecurityLevel(bestTarget) > ns.getServerMinSecurityLevel(bestTarget) + 2) {
                        ns.exec("weaken.js", host, threads, bestTarget);
                    } else if (ns.getServerMoneyAvailable(bestTarget) < ns.getServerMaxMoney(bestTarget) * 0.9) {
                        ns.exec("grow.js", host, threads, bestTarget);
                    } else {
                        ns.exec("hack.js", host, threads, bestTarget);
                    }
                }
            }
        }
        await ns.sleep(2000);
    }
}
