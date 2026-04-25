/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tail(); // Opens a monitor window to track the status

    const PREP_SCRIPT = "prep-all.js";
    const HGW_SCRIPT = "apex-hwgw.js";
    const CHECK_INTERVAL = 10000; // Check every 10 seconds

    ns.print("Gatekeeper active: Monitoring " + PREP_SCRIPT);

    while (true) {
        // Check if the prep script is still running on 'home'
        const isPrepRunning = ns.scriptRunning(PREP_SCRIPT, "home");

        if (!isPrepRunning) {
            ns.tprint("SUCCESS: " + PREP_SCRIPT + " has finished execution.");
            ns.tprint("Launching " + HGW_SCRIPT + " now...");

            // Execute the HGW engine with 1 thread on home
            const pid = ns.run(HGW_SCRIPT, 1);

            if (pid === 0) {
                ns.tprint("ERROR: Failed to launch " + HGW_SCRIPT + ". Check Home RAM!");
            } else {
                ns.tprint("Engine successfully deployed with PID: " + pid);
            }

            // Task complete, terminate the gatekeeper
            break;
        }

        ns.print("Status: Prep-phase still in progress...");
        await ns.sleep(CHECK_INTERVAL);
    }
}
