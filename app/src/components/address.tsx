"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { shortAddress } from "@/lib/format";
import { explorerAddress } from "@/lib/solana";

/** Short monospace address with copy and explorer actions. */
export function Address({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        title={value}
        aria-label={`Copy ${label}: ${value}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        }}
        className="inline-flex h-8 items-center gap-1.5 px-1 font-mono text-[12.5px] tabular-nums hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {shortAddress(value)} <Copy className="size-3 text-muted-foreground" aria-hidden />
      </button>
      <a
        href={explorerAddress(value)}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label} on Solana Explorer`}
        className="grid size-8 place-items-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </span>
  );
}
