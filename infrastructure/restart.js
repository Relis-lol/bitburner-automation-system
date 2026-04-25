/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail(); 

    const PREP_SCRIPT = "prep-all.js";
    const HGW_SCRIPT = "apex-hwgw.js";
    const CHECK_INTERVAL = 30000; // Updated to 30 seconds

    ns.print("Gatekeeper active: Monitoring " + PREP_SCRIPT);

    while (true) {
        const isPrepRunning = ns.scriptRunning(PREP_SCRIPT, "home");
        const time = new Date().toLocaleTimeString(); // Get current timestamp

        if (!isPrepRunning) {
            ns.tprint(`[${time}] SUCCESS: ${PREP_SCRIPT} has finished execution.`);
            ns.tprint(`[${time}] Launching ${HGW_SCRIPT} now...`);

            const pid = ns.run(HGW_SCRIPT, 1);

            if (pid === 0) {
                ns.tprint("ERROR: Failed to launch " + HGW_SCRIPT + ". Check Home RAM!");
            } else {
                ns.tprint("Engine successfully deployed with PID: " + pid);
                // Final completion message
                ns.tprint("--- Gatekeeper mission accomplished. Shutting down. ---");
            }

            break;
        }

        // Status update with timestamp
        ns.print(`[${time}] Status: Prep-phase still in progress...`);
        await ns.sleep(CHECK_INTERVAL);
    }
}
