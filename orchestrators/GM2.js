/** @param {NS} ns **/
export async function main(ns) {
    const prefix = "serv-";
    const reserveLimit = 1000000; // 1 Million Reserve

    while (true) {
        // 1. NETZWERK-SCAN
        let servers = ["home"];
        for (let i = 0; i < servers.length; i++) {
            let scanResults = ns.scan(servers[i]);
            for (let server of scanResults) {
                if (!servers.includes(server)) servers.push(server);
            }
        }

        // 2. BESTES ZIEL FINDEN
        let bestTarget = "n00dles";
        let maxMoney = 0;
        for (let s of servers) {
            if (ns.hasRootAccess(s) && ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel()) {
                if (ns.getServerMaxMoney(s) > maxMoney) {
                    maxMoney = ns.getServerMaxMoney(s);
                    bestTarget = s;
                }
            }
        }

        // 3. SERVER KAUFEN & UPGRADEN (Ohne Singularity, spart RAM)
        let money = ns.getServerMoneyAvailable("home");
        if (money > reserveLimit) {
            let spendable = money - reserveLimit;
            let myServers = ns.getPurchasedServers();
            
            if (myServers.length < ns.getPurchasedServerLimit()) {
                let cost = ns.getPurchasedServerCost(8);
                if (spendable > cost) {
                    ns.purchaseServer(prefix + myServers.length, 8);
                }
            } else {
                for (let s of myServers) {
                    let nextRam = ns.getServerMaxRam(s) * 2;
                    if (nextRam <= ns.getPurchasedServerMaxRam()) {
                        let cost = ns.getPurchasedServerCost(nextRam);
                        if (spendable > cost) {
                            ns.killall(s);
                            ns.deleteServer(s);
                            ns.purchaseServer(s, nextRam);
                            break;
                        }
                    }
                }
            }
        }

        // 4. AUSFÜHRUNG & VERTEILUNG
        for (let host of servers) {
            if (!ns.hasRootAccess(host)) {
                if (ns.fileExists("BruteSSH.exe")) ns.brutessh(host);
                if (ns.fileExists("FTPCrack.exe")) ns.ftpcrack(host);
                if (ns.fileExists("relaySMTP.exe")) ns.relaysmtp(host);
                if (ns.fileExists("HTTPWorm.exe")) ns.httpworm(host);
                if (ns.fileExists("SQLInject.exe")) ns.sqlinject(host);
                try { ns.nuke(host); } catch (e) { continue; }
            }

            let target = (host === "home" || host.startsWith(prefix)) ? bestTarget : host;
            if (ns.getServerMaxMoney(target) <= 0) target = bestTarget;

            await ns.scp(["hack.js", "grow.js", "weaken.js"], host, "home");

            let freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
            if (host === "home") freeRam -= 20; 

            let threads = Math.floor(freeRam / 1.75);
            if (threads > 0 && ns.getServerRequiredHackingLevel(target) <= ns.getHackingLevel()) {
                let sec = ns.getServerSecurityLevel(target);
                let minSec = ns.getServerMinSecurityLevel(target);
                let moneyAvailable = ns.getServerMoneyAvailable(target);
                let moneyMax = ns.getServerMaxMoney(target);

                if (sec > minSec + 2) {
                    ns.exec("weaken.js", host, threads, target);
                } else if (moneyAvailable < moneyMax * 0.9) {
                    ns.exec("grow.js", host, threads, target);
                } else {
                    ns.exec("hack.js", host, threads, target);
                }
            }
        }
        await ns.sleep(2000);
    }
}
