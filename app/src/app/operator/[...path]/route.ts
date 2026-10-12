// Forwards /operator/* to the operator service (live meter data, proofs, faucet).
// A server route rather than a rewrite so it can:
//  - send ngrok's skip-warning header (a tunnel otherwise answers browsers with an HTML warning page),
//  - pass the visitor's IP along, so the faucet can rate-limit per person.
const OPERATOR_URL = (process.env.OPERATOR_URL ?? "http://localhost:4100").replace(/\/$/, "");

async function forward(req: Request, ctx: RouteContext<"/operator/[...path]">) {
  const { path } = await ctx.params;
  const url = `${OPERATOR_URL}/${path.map(encodeURIComponent).join("/")}${new URL(req.url).search}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "";
  try {
    const res = await fetch(url, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
        "ngrok-skip-browser-warning": "1",
        "x-client-ip": ip,
      },
      body: req.method === "GET" ? undefined : await req.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false, error: "The Solaris service is unreachable right now." }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
