"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { ThemeProvider } from "next-themes";
import { useMemo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TestWalletAdapter } from "@/lib/test-wallet";
import "@solana/wallet-adapter-react-ui/styles.css";

// The app sends its own RPC through /api/rpc; the wallet adapter only needs a placeholder here.
const ENDPOINT = "https://api.devnet.solana.com";

export function Providers({ children }: { children: ReactNode }) {
  // Installed wallets (Phantom, Solflare, ...) are detected automatically. The test wallet is a
  // devnet-only in-browser key so anyone can try the pilot without installing a wallet.
  const wallets = useMemo(() => [new TestWalletAdapter()], []);
  return (
    <ThemeProvider attribute="class" forcedTheme="light">
      <ConnectionProvider endpoint={ENDPOINT}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <TooltipProvider>
              {children}
              <Toaster position="bottom-right" />
            </TooltipProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ThemeProvider>
  );
}
