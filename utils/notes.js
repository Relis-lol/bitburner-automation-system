/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  ns.clearLog();

  ns.tail();
  ns.resizeTail(520, 420);

  ns.print("=== IMPORTANT FACTION SERVERS ===");
  ns.print("CSEC              -> CyberSec");
  ns.print("avmnite-02h       -> NiteSec");
  ns.print("I.I.I.I           -> The Black Hand");
  ns.print("run4theh111z      -> BitRunners");

  ns.print("");
}
