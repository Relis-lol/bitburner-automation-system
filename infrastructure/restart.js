/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail();

    const PREP_SCRIPT = "prep-all.js";

    const STARTUP_SCRIPTS = [
        "apex-hwgw.js",
        "stats.js",
        "stock-trader-shorts.js",
        "infra-manager.js",
    ];

    const CHECK_INTERVAL = 30000;

    ns.print("Gatekeeper active: Monitoring " + PREP_SCRIPT);

    while (true) {
        const isPrepRunning = ns.scriptRunning(PREP_SCRIPT, "home");
        const time = new Date().toLocaleTimeString();

        if (!isPrepRunning) {
            ns.tprint(`[${time}] SUCCESS: ${PREP_SCRIPT} has finished execution.`);
            ns.tprint(`[${time}] Launching startup scripts...`);

            for (const script of STARTUP_SCRIPTS) {
                if (ns.scriptRunning(script, "home")) {
                    ns.tprint(`[${time}] SKIP: ${script} is already running.`);
                    continue;
                }

                const pid = ns.run(script, 1);

                if (pid === 0) {
                    ns.tprint(`[${time}] ERROR: Failed to launch ${script}. Check Home RAM or filename.`);
                } else {
                    ns.tprint(`[${time}] STARTED: ${script} with PID ${pid}`);
                }

                await ns.sleep(500);
            }

            ns.tprint("--- Gatekeeper mission accomplished. Shutting down. ---");
            break;
        }

        ns.print(`[${time}] Status: Prep-phase still in progress...`);
        await ns.sleep(CHECK_INTERVAL);
    }
}
