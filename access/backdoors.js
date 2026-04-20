/** @param {NS} ns */
export async function main(ns) {
    let servers = ["home"];
    for (let i = 0; i < servers.length; i++) {
        let scanResults = ns.scan(servers[i]);
        for (let server of scanResults) {
            if (!servers.includes(server)) servers.push(server);
        }
    }

    ns.tprint("Starting backdoor run...");

    for (let target of servers) {
        // Skip home, servers that are already done, or those we haven't rooted yet
        let info = ns.getServer(target);
        if (target === "home" || info.backdoorInstalled || !info.hasAdminRights) continue;
        
        // Make sure our hacking level is high enough
        if (ns.getHackingLevel() < info.requiredHackingSkill) continue;

        ns.tprint("Attempting backdoor on: " + target);

        // Find the connection path using BFS
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

        // Reconstruct the path to the target
        let path = [];
        let curr = target;
        while (curr !== null) {
            path.unshift(curr);
            curr = paths[curr];
        }

        // Navigate through the network
        for (let i = 1; i < path.length; i++) {
            ns.singularity.connect(path[i]);
        }

        // Try to install the backdoor
        try {
            await ns.singularity.installBackdoor();
            ns.tprint("Success: " + target);
        } catch (e) {
            ns.tprint("Failed at: " + target);
        }

        // Head back to home base
        ns.singularity.connect("home");
    }
    ns.tprint("Backdoor run finished.");
}
