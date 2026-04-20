/** @param {NS} ns */
export async function main(ns) {
    const scriptName = "basic_hack.js";
    const target = "iron-gym"; // Global target for all servers

    let servers = ["home"];
    for (let i = 0; i < servers.length; i++) {
        let scanResults = ns.scan(servers[i]);
        for (let server of scanResults) {
            if (!servers.includes(server)) servers.push(server);
        }
    }

    for (let server of servers) {
        if (server === "home" || !ns.hasRootAccess(server)) continue;

        // Stop any running processes and update the script
        ns.killall(server);
        await ns.scp(scriptName, server);

        // Calculate max threads based on server RAM
        let ramAvailable = ns.getServerMaxRam(server);
        let scriptCost = ns.getScriptRam(scriptName);
        let threads = Math.floor(ramAvailable / scriptCost);

        if (threads > 0) {
            ns.exec(scriptName, server, threads, target);
        }
    }
}
