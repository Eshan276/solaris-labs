// Trade history for the share market. Every purchase from a listing writes the project's market
// account and emits a TradeEvent, so the market account's transaction history is the trade log.
import { EventParser } from "@anchor-lang/core";
import { connection, errorText, marketPda, program, projectPda } from "./chain";
import { addTrade, getMeta, setMeta } from "./db";

const parser = new EventParser(program.programId, program.coder);

export async function indexTrades(projectId: number) {
  const market = marketPda(projectPda(projectId));
  const key = `trades-cursor:${projectId}`;
  const until = getMeta(key) ?? undefined;
  // Newest first; page back to the cursor.
  const sigs: { signature: string; err: unknown }[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await connection.getSignaturesForAddress(market, { until, before, limit: 200 }, "confirmed");
    sigs.push(...page);
    if (page.length < 200) break;
    before = page[page.length - 1].signature;
  }
  if (!sigs.length) return 0;
  let added = 0;
  // Oldest first, so the cursor only advances past transactions that were processed.
  for (const { signature, err } of sigs.reverse()) {
    if (!err) {
      const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const logs = tx?.meta?.logMessages;
      if (!logs) throw new Error(`No logs for ${signature}`);
      let ix = 0;
      for (const ev of parser.parseLogs(logs)) {
        if (ev.name.toLowerCase() !== "tradeevent") continue;
        const d = ev.data as any;
        addTrade(projectId, ix++, {
          sig: signature,
          seller: d.seller.toBase58(),
          buyer: d.buyer.toBase58(),
          shares: d.shares.toNumber(),
          price: d.price.toNumber(),
          t: d.timestamp.toNumber() * 1000,
        });
        added++;
      }
    }
    setMeta(key, signature);
  }
  return added;
}

export async function indexAllTrades(projectIds: number[]) {
  for (const id of projectIds) {
    try {
      const n = await indexTrades(id);
      if (n) console.log(`Indexed ${n} trade(s) for project ${id}`);
    } catch (e) {
      console.error(`Trade indexer (project ${id}):`, errorText(e));
    }
  }
}
