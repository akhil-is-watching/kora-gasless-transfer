import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
  CoinbaseWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import type { WalletAdapter } from "@solana/wallet-adapter-base";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { PublicKey, VersionedTransaction } from "@solana/web3.js";

export interface WalletInfo {
  name: string;
  icon: string;
  adapter: WalletAdapter;
  readyState: WalletReadyState;
}

export class WalletManager {
  private wallets: WalletInfo[] = [];
  private connectedWallet: WalletAdapter | null = null;
  private onConnectCallbacks: ((publicKey: PublicKey) => void)[] = [];
  private onDisconnectCallbacks: (() => void)[] = [];

  constructor() {
    this.initWallets();
  }

  private initWallets() {
    const adapters = [
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

  getConnectedWallet(): WalletAdapter | null {
    return this.connectedWallet;
  }

  getPublicKey(): PublicKey | null {
    return this.connectedWallet?.publicKey ?? null;
  }

  isConnected(): boolean {
    return this.connectedWallet?.connected ?? false;
  }

  async signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction> {
    if (!this.connectedWallet?.signTransaction) {
      throw new Error("Wallet does not support signing transactions");
    }
    return this.connectedWallet.signTransaction(tx);
  }

  onConnect(callback: (publicKey: PublicKey) => void): void {
    this.onConnectCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallbacks.push(callback);
  }
}

export const walletManager = new WalletManager();

