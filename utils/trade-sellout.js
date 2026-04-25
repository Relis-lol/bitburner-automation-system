/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const symbols = ns.stock.getSymbols();
    ns.tprint("Liquidating stock positions...");

    for (const sym of symbols) {
        let [longShares, , shortShares] = ns.stock.getPosition(sym);

        // SELL LONG
        while (longShares > 0) {
            const sold = ns.stock.sellStock(sym, longShares);
            if (sold === 0) {
                // retry fallback (partial sell)
                longShares = Math.floor(longShares / 2);
                continue;
            }

            ns.tprint(`Sold LONG ${sym}`);
            break;
        }

        // SELL SHORT
        while (shortShares > 0) {
            const sold = ns.stock.sellShort(sym, shortShares);
            if (sold === 0) {
                shortShares = Math.floor(shortShares / 2);
                continue;
            }

            ns.tprint(`Closed SHORT ${sym}`);
            break;
        }
    }

    ns.tprint("All positions liquidated. Ready for reset.");
}
