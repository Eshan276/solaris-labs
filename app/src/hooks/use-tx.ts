"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { Transaction } from "@solana/web3.js";
import { useState } from "react";
import { toast } from "sonner";
import { decodeError, explorerTx, isUserRejection, sendAndConfirm, TxError } from "@/lib/solana";

/** Runs one wallet-signed transaction with status toasts. Returns the signature, or null if it didn't land. */
export function useTx() {
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const [pending, setPending] = useState(false);

  async function run(labels: { action: string; done: string }, build: () => Promise<Transaction>): Promise<string | null> {
    if (!publicKey) return null;
    setPending(true);
    const id = toast.loading("Confirm in your wallet…");
    try {
      const tx = await build();
      tx.feePayer = publicKey;
      const sig = await sendAndConfirm(tx, { signTransaction, sendTransaction }, () =>
        toast.loading(`${labels.action}…`, { id }),
      );
      toast.success(labels.done, {
        id,
        action: { label: "View", onClick: () => window.open(explorerTx(sig), "_blank", "noreferrer") },
      });
      return sig;
    } catch (e) {
      if (isUserRejection(e)) {
        toast.dismiss(id); // cancelling isn't an error
      } else {
        const sig = e instanceof TxError ? e.signature : null;
        toast.error(e instanceof TxError ? e.message : decodeError(e), {
          id,
          action: sig ? { label: "Details", onClick: () => window.open(explorerTx(sig), "_blank", "noreferrer") } : undefined,
        });
      }
      return null;
    } finally {
      setPending(false);
    }
  }

  return { run, pending };
}
