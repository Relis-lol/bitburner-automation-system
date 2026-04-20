/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0] || ns.getHostname();

    while (true) {
        if (ns.getServerSecurityLevel(target) > ns.getServerMinSecurityLevel(target) + 2) {
            await ns.weaken(target);
        } else if (ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target) * 0.9) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }

        await ns.sleep(10);
    }
}
