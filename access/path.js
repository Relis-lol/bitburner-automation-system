/** @param {NS} ns */
export async function main(ns) {
    let target = ns.args[0];
    if (!target) {
        ns.tprint("Bitte Ziel angeben: run path.js [server]");
        return;
    }

    let paths = { "home": null };
    let queue = ["home"];

    // BFS Suche
    while (queue.length > 0) {
        let node = queue.shift();
        let nodes = ns.scan(node);
        for (let next of nodes) {
            if (!(next in paths)) {
                paths[next] = node;
                queue.push(next);
            }
        }
    }

    // Pfad rückwärts zusammenbauen
    let path = [];
    let curr = target;
    
    if (!paths[curr]) {
        ns.tprint("Server nicht gefunden!");
        return;
    }

    while (curr !== null) {
        path.unshift(curr);
        curr = paths[curr];
    }

    // "home" entfernen, da wir dort starten
    path.shift();
    ns.tprint("Connect-String: connect " + path.join("; connect "));
}
