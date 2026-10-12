// Forwards Solana JSON-RPC from the browser to the configured RPC, so its URL (and any API key)
// stays on the server.
//
// Public devnet rate-limits hard, and every open tab polls the chain, so this proxy:
//  - answers identical read requests from a short cache (shared by all tabs) and merges duplicates in flight,
//  - sends at most MAX_CONCURRENT requests upstream at a time,
//  - times out, retries rate-limited requests with backoff, and fails with a JSON-RPC error instead of crashing.
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const MAX_CONCURRENT = 4;

// Read methods that are safe to share for a moment; anything else (sending, signature status) goes straight through.
const CACHE_MS: Record<string, number> = {
  getAccountInfo: 1500,
  getMultipleAccounts: 1500,
  getBalance: 1500,
  getTokenAccountBalance: 1500,
  getSlot: 1000,
  getBlockHeight: 1000,
  getLatestBlockhash: 1000,
  getProgramAccounts: 3000,
};

type Upstream = { status: number; text: string };
const cache = new Map<string, { at: number; value: Upstream }>();
const inflight = new Map<string, Promise<Upstream>>();

let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function upstream(body: string): Promise<Upstream> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await withSlot(() =>
        fetch(RPC_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(8_000),
        }),
      );
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      return { status: res.status, text: await res.text() };
    } catch {
      // Timeout or network error: retry.
    }
  }
  return {
    status: 502,
    text: JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Solana RPC is unavailable right now. Please retry." } }),
  };
}

/** Puts the caller's request id back on a shared response. */
function withId(text: string, id: unknown): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed && !Array.isArray(parsed)) parsed.id = id;
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  let request: { id?: unknown; method?: string; params?: unknown } | null = null;
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) request = parsed;
  } catch {}

  const ttl = request?.method ? CACHE_MS[request.method] : undefined;
  if (!request || !ttl) {
    const res = await upstream(body);
    return new Response(res.text, { status: res.status, headers: { "content-type": "application/json" } });
  }

  const key = `${request.method}:${JSON.stringify(request.params ?? [])}`;
  const hit = cache.get(key);
  let res: Upstream;
  if (hit && Date.now() - hit.at < ttl) {
    res = hit.value;
  } else {
    let pending = inflight.get(key);
    if (!pending) {
      pending = upstream(body).finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    res = await pending;
    if (res.status === 200) {
      cache.set(key, { at: Date.now(), value: res });
      if (cache.size > 2000) cache.clear();
    }
  }
  return new Response(withId(res.text, request.id ?? null), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
