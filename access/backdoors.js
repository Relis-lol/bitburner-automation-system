/** @param {NS} ns */
export async function main(ns) {
    // 1. Alle Server finden
    let servers = ["home"];
    for (let i = 0; i < servers.length; i++) {
        let scanResults = ns.scan(servers[i]);
        for (let server of scanResults) {
            if (!servers.includes(server)) servers.push(server);
        }
    }

    ns.tprint("Starte Backdoor-Run...");

    for (let target of servers) {
        // Überspringe home und bereits ge-backdoor-te oder unerreichbare Server
        let info = ns.getServer(target);
        if (target === "home" || info.backdoorInstalled || !info.hasAdminRights) continue;
        
        // Prüfen ob Hacking-Level reicht
        if (ns.getHackingLevel() < info.requiredHackingSkill) continue;

        ns.tprint("Versuche Backdoor auf: " + target);

        // Pfad finden (BFS)
        let paths = { "home": null };
        let queue = ["home"];
        while (queue.length > 0) {
            let node = queue.shift();
            for (let next of ns.scan(node)) {
                if (!(next in paths)) {
                    paths[next] = node;
                    queue.push(next);
                }
            }
        }

        // Pfad-Kette bauen
        let path = [];
        let curr = target;
        while (curr !== null) {
            path.unshift(curr);
            curr = paths[curr];
        }

        // Hinreisen
        for (let i = 1; i < path.length; i++) {
            ns.singularity.connect(path[i]);
        }

        // Backdoor installieren
        try {
            await ns.singularity.installBackdoor();
            ns.tprint("Erfolg: " + target);
        } catch (e) {
            ns.tprint("Fehler bei: " + target);
        }

        // Zurück nach Hause
        ns.singularity.connect("home");
    }
    ns.tprint("Backdoor-Run abgeschlossen.");
}
