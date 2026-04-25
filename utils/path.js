/** @param {NS} ns */
export async function main(ns) {
    let target = ns.args[0];
    if (!target) {
        ns.tprint("Please specify a target: run path.js [server]");
        return;
    }

    let paths = { "home": null };
    let queue = ["home"];

    // Standard BFS search
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

    let path = [];
    let curr = target;
    
    if (!paths[curr]) {
        ns.tprint("Server not found!");
        return;
    }

    // Reconstruct the path from target to home
    while (curr !== null) {
        path.unshift(curr);
        curr = paths[curr];
    }

    // Remove "home" since we're already there
    path.shift();
    ns.tprint("Connect string: connect " + path.join("; connect "));
}
