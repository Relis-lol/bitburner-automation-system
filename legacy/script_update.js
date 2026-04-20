/** @param {NS} ns */
export async function main(ns) {
    const scriptName = "basic_hack.js";
    const target = "iron-gym"; // Das Ziel, das alle hacken sollen

    // 1. Alle Server im Netzwerk finden
    let servers = ["home"];
    for (let i = 0; i < servers.length; i++) {
        let scanResults = ns.scan(servers[i]);
        for (let server of scanResults) {
            if (!servers.includes(server)) servers.push(server);
        }
    }

    // 2. Skript auf jedem Server aktualisieren
    for (let server of servers) {
        if (server === "home" || !ns.hasRootAccess(server)) continue;

        // Altes Skript stoppen
        ns.killall(server);

        // Neue Version hinkopieren
        await ns.scp(scriptName, server);

        // Berechnen, wie viele Threads draufpassen
        let ramAvailable = ns.getServerMaxRam(server);
        let scriptCost = ns.getScriptRam(scriptName);
        let threads = Math.floor(ramAvailable / scriptCost);

        if (threads > 0) {
            ns.exec(scriptName, server, threads, target);
        }
    }
}
