/** @param {NS} ns */
export async function main(ns) {
  let servers = ["home"];
  for (let i = 0; i < servers.length; i++) {
    let scanResults = ns.scan(servers[i]);
    for (let server of scanResults) {
      if (!servers.includes(server)) servers.push(server);
    }
  }

  ns.tprint("--- AVAILABLE BACKDOORS ---");
  for (let s of servers) {
    let info = ns.getServer(s);
    if (s !== "home" && !info.backdoorInstalled && info.hasAdminRights && ns.getHackingLevel() >= info.requiredHackingSkill) {
      // Create a clickable path in the terminal for easy access
      ns.tprint(`${s} (Level ${info.requiredHackingSkill}) - Backdoor READY!`);
    }
  }
}
