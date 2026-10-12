// Devnet-only "Test wallet": a throwaway key kept in this browser (localStorage), so anyone can try
// the pilot without installing a wallet and a refresh doesn't lose their test shares.
// Never use it for real funds.
import {
  BaseSignerWalletAdapter,
  WalletNotConnectedError,
  WalletReadyState,
  type TransactionOrVersionedTransaction,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { Keypair, type PublicKey, type Transaction, type TransactionVersion, VersionedTransaction } from "@solana/web3.js";

const STORAGE_KEY = "solaris-test-wallet";
export const TestWalletName = "Test wallet (devnet)" as WalletName<"Test wallet (devnet)">;

// Flask icon, inline so the wallet list never depends on a network image.
const ICON =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function"
    ? btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#f59e0b"/><path d="M13 7h6M14 7v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V7" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
      )
    : "");

function loadOrCreate(): Keypair {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved)));
  } catch {}
  const keypair = Keypair.generate();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keypair.secretKey)));
  } catch {}
  return keypair;
}

export class TestWalletAdapter extends BaseSignerWalletAdapter {
  name = TestWalletName;
  url = "https://solana.com/docs";
  icon = ICON;
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(["legacy", 0]);

  private keypair: Keypair | null = null;

  get connecting() {
    return false;
  }
  get publicKey(): PublicKey | null {
    return this.keypair?.publicKey ?? null;
  }
  get readyState() {
    return typeof window === "undefined" ? WalletReadyState.Unsupported : WalletReadyState.Loadable;
  }

  async connect(): Promise<void> {
    this.keypair = loadOrCreate();
    this.emit("connect", this.keypair.publicKey);
  }

  async disconnect(): Promise<void> {
    this.keypair = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends TransactionOrVersionedTransaction<this["supportedTransactionVersions"]>>(tx: T): Promise<T> {
    if (!this.keypair) throw new WalletNotConnectedError();
    if (tx instanceof VersionedTransaction) tx.sign([this.keypair]);
    else (tx as Transaction).partialSign(this.keypair);
    return tx;
  }
}
