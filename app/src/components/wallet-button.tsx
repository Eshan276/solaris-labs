"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Copy, ExternalLink, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortAddress } from "@/lib/format";
import { explorerAddress } from "@/lib/solana";

const outline =
  "inline-flex h-10 items-center gap-2 border border-input bg-background px-4 text-[13px] font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function WalletButton() {
  const { publicKey, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  if (!publicKey) {
    return (
      <button type="button" className={outline} disabled={connecting} onClick={() => setVisible(true)}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const address = publicKey.toBase58();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`${outline} font-mono tabular-nums`} aria-label={`Wallet ${address}`}>
        {wallet?.adapter.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt="" className="size-4" />
        )}
        {shortAddress(address)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem
          onClick={async () => {
            await navigator.clipboard.writeText(address);
            toast.success("Address copied");
          }}
        >
          <Copy aria-hidden /> Copy address
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(explorerAddress(address), "_blank", "noreferrer")}>
          <ExternalLink aria-hidden /> View on explorer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => disconnect()}>
          <LogOut aria-hidden /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
