import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
  CoinbaseWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import type { Adapter } from "@solana/wallet-adapter-base";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

export interface WalletInfo {
  name: string;
  icon: string;
  adapter: Adapter;
  readyState: WalletReadyState;
}

export class WalletManager {
  private wallets: WalletInfo[] = [];
  private connectedWallet: Adapter | null = null;
  private onConnectCallbacks: ((publicKey: PublicKey) => void)[] = [];
  private onDisconnectCallbacks: (() => void)[] = [];

  constructor() {
    this.initWallets();
  }

  private initWallets() {
    const adapters: Adapter[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
    ];

    this.wallets = adapters.map((adapter) => ({
      name: adapter.name,
      icon: adapter.icon,
      adapter,
      readyState: adapter.readyState,
    }));
  }

  getWallets(): WalletInfo[] {
    return this.wallets;
  }

  getInstalledWallets(): WalletInfo[] {
    return this.wallets.filter(
      (w) =>
        w.readyState === WalletReadyState.Installed ||
        w.readyState === WalletReadyState.Loadable
    );
  }

  async connect(wallet: WalletInfo): Promise<PublicKey> {
    if (this.connectedWallet) {
      await this.disconnect();
    }

    await wallet.adapter.connect();
    this.connectedWallet = wallet.adapter;

    if (!wallet.adapter.publicKey) {
      throw new Error("Failed to get public key from wallet");
    }

    this.onConnectCallbacks.forEach((cb) => cb(wallet.adapter.publicKey!));
    return wallet.adapter.publicKey;
  }

  async disconnect(): Promise<void> {
    if (this.connectedWallet) {
      await this.connectedWallet.disconnect();
      this.connectedWallet = null;
      this.onDisconnectCallbacks.forEach((cb) => cb());
    }
  }

  getConnectedWallet(): Adapter | null {
    return this.connectedWallet;
  }

  getPublicKey(): PublicKey | null {
    return this.connectedWallet?.publicKey ?? null;
  }

  isConnected(): boolean {
    return this.connectedWallet?.connected ?? false;
  }

  async signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction> {
    const wallet = this.connectedWallet as {
      signTransaction?: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
    } | null;

    if (!wallet?.signTransaction) {
      throw new Error("Wallet does not support signing transactions");
    }

    return wallet.signTransaction(tx);
  }

  onConnect(callback: (publicKey: PublicKey) => void): void {
    this.onConnectCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallbacks.push(callback);
  }
}

export const walletManager = new WalletManager();
