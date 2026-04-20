/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0] || ns.getHostname();

    while (true) {
        if (ns.getServerSecurityLevel(target) > ns.getServerMinSecurityLevel(target) + 2) {
            // Lower security if it gets too high
            await ns.weaken(target);
        } else if (ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target) * 0.9) {
            // Pump up the cash if it's below 90%
            await ns.grow(target);
        } else {
            // Money is good and security is low, let's steal some
            await ns.hack(target);
        }

        await ns.sleep(10);
    }
}
