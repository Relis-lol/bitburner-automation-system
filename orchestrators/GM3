/** @param {NS} ns **/
export async function main(ns) {
    const prefix = "serv-";
    const reserveLimit = 1000000; // 1 Million Reserve auf Home
    let lastTarget = "";

    // Schaltet Standard-Logs aus und öffnet das neue, saubere Log-Fenster
    ns.disableLog("ALL");
    ns.ui.openTail(); 
    ns.print("--- BITRUNNER MANAGER GESTARTET ---");

    while (true) {
        // 1. NETZWERK-SCAN
        let servers = ["home"];
        for (let i = 0; i < servers.length; i++) {
            let scanResults = ns.scan(servers[i]);
            for (let server of scanResults) {
                if (!servers.includes(server)) servers.push(server);
            }
        }

        // 2. BESTES ZIEL FINDEN (Priorität: Max Money)
        let bestTarget = "n00dles";
        let maxMoney = 0;
        for (let s of servers) {
            if (ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > maxMoney) {
                if (ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel()) {
                    maxMoney = ns.getServerMaxMoney(s);
                    bestTarget = s;
                }
            }
        }

        // Logge Zielwechsel
        if (bestTarget !== lastTarget) {
            ns.print("🎯 ZIEL GEWECHSELT: " + bestTarget + " (Max: $" + ns.formatNumber(maxMoney) + ")");
            lastTarget = bestTarget;
        }

        // 3. SERVER KAUFEN & UPGRADEN
        let money = ns.getServerMoneyAvailable("home");
        if (money > reserveLimit) {
            let spendable = money - reserveLimit;
            let myServers = ns.getPurchasedServers();
            
            if (myServers.length < ns.getPurchasedServerLimit()) {
                let cost = ns.getPurchasedServerCost(8);
                if (spendable > cost) {
                    let name = ns.purchaseServer(prefix + myServers.length, 8);
                    ns.print("🛒 SERVER GEKAUFT: " + name);
                }
            } else {
                for (let s of myServers) {
                    let nextRam = ns.getServerMaxRam(s) * 2;
                    if (nextRam <= ns.getPurchasedServerMaxRam()) {
                        let cost = ns.getPurchasedServerCost(nextRam);
                        if (spendable > cost) {
                            ns.print("🆙 UPGRADE: " + s + " auf " + nextRam + "GB");
                            ns.killall(s);
                            ns.deleteServer(s);
                            ns.purchaseServer(s, nextRam);
                            break; // Nur ein Upgrade pro Durchlauf, um Geld zu sparen
                        }
                    }
                }
            }
        }

        // 4. AUSFÜHRUNG & VERTEILUNG
        for (let host of servers) {
            // Root-Zugriff sicherstellen
            if (!ns.hasRootAccess(host)) {
                if (ns.fileExists("BruteSSH.exe")) ns.brutessh(host);
                if (ns.fileExists("FTPCrack.exe")) ns.ftpcrack(host);
                if (ns.fileExists("relaySMTP.exe")) ns.relaysmtp(host);
                if (ns.fileExists("HTTPWorm.exe")) ns.httpworm(host);
                if (ns.fileExists("SQLInject.exe")) ns.sqlinject(host);
                try { 
                    ns.nuke(host); 
                    ns.print("🔓 NUKE ERFOLGREICH: " + host);
                } catch (e) { continue; }
            }

            // Ziel-Logik: Eigene Server & Home -> bestTarget. Andere -> sich selbst.
            let target = (host === "home" || host.startsWith(prefix)) ? bestTarget : host;
            
            // Falls ein Server 0 MaxMoney hat (wie CSEC), nutze das Hauptziel
            if (ns.getServerMaxMoney(target) <= 0) target = bestTarget;

            // Dateien kopieren
            await ns.scp(["hack.js", "grow.js", "weaken.js"], host, "home");

            // RAM berechnen
            let maxRam = ns.getServerMaxRam(host);
            let freeRam = maxRam - ns.getServerUsedRam(host);
            if (host === "home") freeRam -= 20; // 20GB Reserve auf Home

            if (freeRam >= 1.75) {
                let threads = Math.floor(freeRam / 1.75);
                let sec = ns.getServerSecurityLevel(target);
                let minSec = ns.getServerMinSecurityLevel(target);
                let moneyAvail = ns.getServerMoneyAvailable(target);
                let moneyMax = ns.getServerMaxMoney(target);

                // Reparatur-Logik für 0$ Server
                if (moneyAvail < 1) moneyAvail = 1;

                if (sec > minSec + 2) {
                    // Priorität 1: Sicherheit senken
                    ns.exec("weaken.js", host, threads, target);
                } else if (moneyAvail < moneyMax * 0.9) {
                    // Priorität 2: Geld aufpumpen
                    ns.exec("grow.js", host, threads, target);
                } else {
                    // Priorität 3: Intelligent Hacken (Maximal 50% des Geldes)
                    let hackThreadsNeeded = Math.floor(ns.hackAnalyzeThreads(target, moneyMax * 0.5));
                    if (hackThreadsNeeded > 0) {
                        let actualHackThreads = Math.min(threads, hackThreadsNeeded);
                        ns.exec("hack.js", host, actualHackThreads, target);
                        
                        // Rest-RAM sofort für Weaken nutzen, um Security-Anstieg abzufangen
                        let remainingThreads = threads - actualHackThreads;
                        if (remainingThreads > 0) {
                            ns.exec("weaken.js", host, remainingThreads, target);
                        }
                    } else {
                        // Fallback für sehr kleine Server
                        ns.exec("hack.js", host, 1, target);
                    }
                }
            }
        }
        // Kurze Pause, um die CPU nicht zu grillen
        await ns.sleep(2000);
    }
}
