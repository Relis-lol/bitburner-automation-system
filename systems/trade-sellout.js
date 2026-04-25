/** @param {NS} ns **/
export async function main(ns) {
    const symbols = ns.stock.getSymbols();
    for (const sym of symbols) {
        const [shares, avgPrice, sharesShort, avgPriceShort] = ns.stock.getPosition(sym);
        
        if (shares > 0) {
            ns.stock.sellStock(sym, shares);
            ns.tprint(`Sold ${shares} shares of ${sym}`);
        }
        if (sharesShort > 0) {
            ns.stock.sellShort(sym, sharesShort);
            ns.tprint(`Sold ${sharesShort} short shares of ${sym}`);
        }
    }
    ns.tprint("Stock market liquidated. Ready for reset!");
}
