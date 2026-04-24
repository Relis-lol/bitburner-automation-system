/** 
 * XP-Manager: Maximizes Hacking XP using 30% of total network RAM.
 * Optimized for performance and stability.
 * @param {NS} ns 
 **/
export async function main(ns) {
    ns.disableLog("ALL");
    
    // Terminal start message
    ns.tprint("xp-grinder online");

    const WORKER_SCRIPT = "weaken2.js";
    const HOME_RESERVE_GB = 50; 
    const MAX_RAM_PERCENTAGE = 0.75; 
    const TARGET = "joesguns"; 
    const TICK_RATE = 1000;

    // Safety check: Get RAM cost of your worker
    const workerCost = ns.getScriptRam(WORKER_SCRIPT);
    if (workerCost <= 0) {
        ns.tprint(`FATAL ERROR: ${WORKER_SCRIPT} not found on 'home'. Division by zero prevented.`);
        return;
    }

    // Cache the network list once at startup
    const networkNodes = getAllServers(ns).filter(s => ns.hasRootAccess(s) && ns.getServerMaxRam(s) > 0);

    while (true) {
        // Calculate total available network RAM capacity
        let totalMaxRam = 0;
        for (const node of networkNodes) {
            const reserve = (node === "home" ? HOME_RESERVE_GB : 0);
            totalMaxRam += Math.max(0, ns.getServerMaxRam(node) - reserve);
        }

        const xpRamQuota = totalMaxRam * MAX_RAM_PERCENTAGE;
        
        // Count current threads running the worker across the whole network
        let currentUsage = 0;
        for (const node of networkNodes) {
            for (const process of ns.ps(node)) {
                if (process.filename === WORKER_SCRIPT) {
                    currentUsage += workerCost * process.threads;
                }
            }
        }

        const availableQuota = Math.max(0, xpRamQuota - currentUsage);
        let threadsToDeploy = Math.floor(availableQuota / workerCost);

        // Deployment loop: Fills available slots up to the 30% quota
        if (threadsToDeploy > 0 && isFinite(threadsToDeploy)) {
            for (const node of networkNodes) {
                if (threadsToDeploy <= 0) break;

                const reserve = (node === "home" ? HOME_RESERVE_GB : 0);
                const nodeFreeRam = ns.getServerMaxRam(node) - ns.getServerUsedRam(node) - reserve;
                
                let possibleThreads = Math.floor(nodeFreeRam / workerCost);
                let threads = Math.min(possibleThreads, threadsToDeploy);

                if (threads > 0) {
                    // Executing worker with target and a unique ID to prevent overlap issues
                    ns.exec(WORKER_SCRIPT, node, Math.floor(threads), TARGET, 0, Date.now() + Math.random());
                    threadsToDeploy -= threads;
                }
            }
        }

        await ns.sleep(TICK_RATE);
    }
}

/** Recursively scan all reachable servers **/
function getAllServers(ns) {
    const visited = new Set(["home"]);
    const queue = ["home"];
    while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of ns.scan(current)) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return [...visited];
}
