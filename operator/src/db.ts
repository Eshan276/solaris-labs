// SQLite storage for verified meter readings and settlement records.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { DATA_DIR, DB_FILE } from "./config";
import type { ProofReading } from "./proof";

mkdirSync(DATA_DIR, { recursive: true });
export const db = new Database(DB_FILE, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    project INTEGER NOT NULL,
    t INTEGER NOT NULL,
    b INTEGER NOT NULL,
    n INTEGER NOT NULL,
    mv INTEGER NOT NULL,
    ua INTEGER NOT NULL,
    sig TEXT NOT NULL,
    PRIMARY KEY (project, b, n)
  );
  CREATE INDEX IF NOT EXISTS readings_by_time ON readings (project, t);
  CREATE TABLE IF NOT EXISTS settlements (
    project INTEGER NOT NULL,
    idx INTEGER NOT NULL,
    period_start INTEGER NOT NULL,
    period_end INTEGER NOT NULL,
    energy_wh INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    readings_count INTEGER NOT NULL,
    proof_hash TEXT NOT NULL,
    tx TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (project, idx)
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS faucet (wallet TEXT PRIMARY KEY, last INTEGER NOT NULL);
`);

const insertReading = db.prepare(
  "INSERT OR IGNORE INTO readings (project, t, b, n, mv, ua, sig) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
export function addReading(project: number, r: ProofReading) {
  insertReading.run(project, r.t, r.b, r.n, r.mv, r.ua, r.sig);
}

export function lastReading(project: number): ProofReading | null {
  return db
    .query("SELECT t, b, n, mv, ua, sig FROM readings WHERE project = ? ORDER BY b DESC, n DESC LIMIT 1")
    .get(project) as ProofReading | null;
}

export function readingsBetween(project: number, fromMs: number, toMs: number): ProofReading[] {
  return db
    .query("SELECT t, b, n, mv, ua, sig FROM readings WHERE project = ? AND t >= ? AND t < ? ORDER BY b, n")
    .all(project, fromMs, toMs) as ProofReading[];
}

export type SettlementRow = {
  project: number;
  idx: number;
  period_start: number;
  period_end: number;
  energy_wh: number;
  amount: number;
  readings_count: number;
  proof_hash: string;
  tx: string | null;
  created_at: number;
};

export function saveSettlement(row: SettlementRow) {
  db.query(
    `INSERT OR REPLACE INTO settlements
     (project, idx, period_start, period_end, energy_wh, amount, readings_count, proof_hash, tx, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.project,
    row.idx,
    row.period_start,
    row.period_end,
    row.energy_wh,
    row.amount,
    row.readings_count,
    row.proof_hash,
    row.tx,
    row.created_at,
  );
}

export function settlements(project: number): SettlementRow[] {
  return db.query("SELECT * FROM settlements WHERE project = ? ORDER BY idx DESC").all(project) as SettlementRow[];
}

export function getMeta(key: string): string | null {
  return (db.query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | null)?.value ?? null;
}
export function setMeta(key: string, value: string) {
  db.query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
}

export function faucetLast(wallet: string): number {
  return (db.query("SELECT last FROM faucet WHERE wallet = ?").get(wallet) as { last: number } | null)?.last ?? 0;
}
export function faucetMark(wallet: string) {
  db.query("INSERT OR REPLACE INTO faucet (wallet, last) VALUES (?, ?)").run(wallet, Date.now());
}

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    project INTEGER NOT NULL,
    sig TEXT NOT NULL,
    ix INTEGER NOT NULL,
    seller TEXT NOT NULL,
    buyer TEXT NOT NULL,
    shares INTEGER NOT NULL,
    price INTEGER NOT NULL,
    t INTEGER NOT NULL,
    PRIMARY KEY (sig, ix)
  );
  CREATE INDEX IF NOT EXISTS trades_by_time ON trades (project, t);
`);

export type TradeRow = { sig: string; seller: string; buyer: string; shares: number; price: number; t: number };

export function addTrade(project: number, ix: number, row: TradeRow) {
  db.query("INSERT OR IGNORE INTO trades (project, sig, ix, seller, buyer, shares, price, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    project, row.sig, ix, row.seller, row.buyer, row.shares, row.price, row.t,
  );
}

export function trades(project: number, limit = 500): TradeRow[] {
  return db
    .query("SELECT sig, seller, buyer, shares, price, t FROM trades WHERE project = ? ORDER BY t DESC, sig, ix LIMIT ?")
    .all(project, limit) as TradeRow[];
}
