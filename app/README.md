# Solaris investor app

Next.js 16 + Tailwind v4 + shadcn/ui (Base UI). Talks to Solana devnet through `/api/rpc` (server-side proxy) and to
the operator service through `/operator/*` (route handler in `src/app/operator/[...path]/route.ts`).

```bash
bun install
bun run dev -p 3100
```

Pages: `/` (offerings), `/projects/[id]` (output, key terms, distribution history, holding, subscribe),
`/projects/[id]/payouts/[index]` (browser-side verification report), `/portfolio`, `/market` and `/projects/[id]/trade` (share market). Institutional design: tokens in
`src/app/globals.css`, building blocks in `src/components/inst.tsx` (see `../brand.md`).
