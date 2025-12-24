import "./style.css";
import { Buffer } from "buffer";
import { walletManager, type WalletInfo } from "./wallet";
import { executeGaslessTransfer, type TransferProgress } from "./transfer";

// Polyfill Buffer for browser
window.Buffer = Buffer;

// State
let isWalletModalOpen = false;
let isTransferring = false;
let transferResult: { signature: string; paymentAmount: string } | null = null;
let transferError: string | null = null;
let currentProgress: TransferProgress | null = null;

// Render the app
function render() {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  const publicKey = walletManager.getPublicKey();
  const isConnected = walletManager.isConnected();
  const connectedWallet = walletManager.getConnectedWallet();

  app.innerHTML = `
    <div class="container">
      <div class="background-gradient"></div>
      
      <header class="header">
        <div class="logo">
          <svg class="logo-icon" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2"/>
            <path d="M12 20L18 26L28 14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="logo-text">Kora Transfer</span>
        </div>
        <div class="wallet-section">
          ${
            isConnected && publicKey
              ? `
            <div class="wallet-connected">
              <div class="wallet-info">
                ${connectedWallet?.icon ? `<img src="${connectedWallet.icon}" alt="" class="wallet-icon-small" />` : ""}
                <span class="wallet-address">${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}</span>
              </div>
              <button class="btn btn-ghost" id="disconnect-btn">Disconnect</button>
            </div>
          `
              : `
            <button class="btn btn-primary" id="connect-wallet-btn">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5z"/>
                <path d="M16 12h5"/>
                <circle cx="18" cy="12" r="1" fill="currentColor"/>
              </svg>
              Connect Wallet
            </button>
          `
          }
        </div>
      </header>

      <main class="main">
        <div class="card transfer-card">
          <div class="card-header">
            <h1 class="card-title">Gasless Token Transfer</h1>
            <p class="card-description">Send tokens without paying gas fees. Powered by Kora.</p>
          </div>

          <div class="card-content">
            ${
              !isConnected
                ? `
              <div class="connect-prompt">
                <svg class="connect-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="6" y="12" width="36" height="28" rx="3"/>
                  <path d="M6 20h36"/>
                  <circle cx="36" cy="28" r="4"/>
                </svg>
                <p>Connect your wallet to start transferring tokens</p>
                <button class="btn btn-primary btn-lg" id="connect-prompt-btn">Connect Wallet</button>
              </div>
            `
                : `
              <form class="transfer-form" id="transfer-form">
                <div class="form-group">
                  <label class="form-label" for="recipient">Recipient Address</label>
                  <input 
                    type="text" 
                    id="recipient" 
                    class="form-input" 
                    placeholder="Enter Solana address..."
                    ${isTransferring ? "disabled" : ""}
                    required
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" for="amount">Amount</label>
                  <div class="input-with-suffix">
                    <input 
                      type="number" 
                      id="amount" 
                      class="form-input" 
                      placeholder="0.00"
                      step="0.000001"
                      min="0.000001"
                      ${isTransferring ? "disabled" : ""}
                      required
                    />
                    <span class="input-suffix">USDC</span>
                  </div>
                </div>

                ${
                  currentProgress
                    ? `
                  <div class="progress-container">
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: ${(currentProgress.step / currentProgress.totalSteps) * 100}%"></div>
                    </div>
                    <p class="progress-text">${currentProgress.message}</p>
                  </div>
                `
                    : ""
                }

                ${
                  transferResult
                    ? `
                  <div class="result-success">
                    <svg class="result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M8 12l3 3 5-6"/>
                    </svg>
                    <div class="result-content">
                      <h3>Transfer Successful!</h3>
                      <p>Fee: ${transferResult.paymentAmount} USDC</p>
                      <a href="https://explorer.solana.com/tx/${transferResult.signature}" target="_blank" rel="noopener" class="result-link">
                        View on Explorer →
                      </a>
                    </div>
                  </div>
                `
                    : ""
                }

                ${
                  transferError
                    ? `
                  <div class="result-error">
                    <svg class="result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M15 9l-6 6M9 9l6 6"/>
                    </svg>
                    <div class="result-content">
                      <h3>Transfer Failed</h3>
                      <p>${transferError}</p>
                    </div>
                  </div>
                `
                    : ""
                }

                <button 
                  type="submit" 
                  class="btn btn-primary btn-lg btn-full ${isTransferring ? "btn-loading" : ""}"
                  ${isTransferring ? "disabled" : ""}
                >
                  ${
                    isTransferring
                      ? `
                    <span class="spinner"></span>
                    Processing...
                  `
                      : `
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Send Tokens
                  `
                  }
                </button>
              </form>
            `
            }
          </div>
        </div>

        <div class="info-cards">
          <div class="info-card">
            <div class="info-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <h3>Gasless</h3>
            <p>No SOL needed for fees. Pay with supported tokens instead.</p>
          </div>

          <div class="info-card">
            <div class="info-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h3>Secure</h3>
            <p>Non-custodial. Your keys, your coins. Always.</p>
          </div>

          <div class="info-card">
            <div class="info-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
            </div>
            <h3>Fast</h3>
            <p>Powered by Solana. Sub-second finality.</p>
          </div>
        </div>
      </main>

      <footer class="footer">
        <p>Built with Kora Protocol · Powered by Solana</p>
      </footer>
    </div>

    ${
      isWalletModalOpen
        ? `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h2>Connect Wallet</h2>
            <button class="modal-close" id="modal-close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-content">
            <div class="wallet-list">
              ${walletManager
                .getWallets()
                .map(
                  (wallet) => `
                <button class="wallet-item ${wallet.readyState === "Installed" ? "wallet-installed" : ""}" data-wallet="${wallet.name}">
                  <img src="${wallet.icon}" alt="${wallet.name}" class="wallet-icon" />
                  <span class="wallet-name">${wallet.name}</span>
                  ${wallet.readyState === "Installed" ? '<span class="wallet-badge">Detected</span>' : ""}
                </button>
              `
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    `
        : ""
    }
  `;

  attachEventListeners();
}

function attachEventListeners() {
  // Connect wallet button (header)
  const connectBtn = document.getElementById("connect-wallet-btn");
  connectBtn?.addEventListener("click", () => {
    isWalletModalOpen = true;
    render();
  });

  // Connect wallet button (prompt)
  const connectPromptBtn = document.getElementById("connect-prompt-btn");
  connectPromptBtn?.addEventListener("click", () => {
    isWalletModalOpen = true;
    render();
  });

  // Disconnect button
  const disconnectBtn = document.getElementById("disconnect-btn");
  disconnectBtn?.addEventListener("click", async () => {
    await walletManager.disconnect();
    render();
  });

  // Modal overlay click
  const modalOverlay = document.getElementById("modal-overlay");
  modalOverlay?.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      isWalletModalOpen = false;
      render();
    }
  });

  // Modal close button
  const modalClose = document.getElementById("modal-close");
  modalClose?.addEventListener("click", () => {
    isWalletModalOpen = false;
    render();
  });

  // Wallet items
  const walletItems = document.querySelectorAll(".wallet-item");
  walletItems.forEach((item) => {
    item.addEventListener("click", async () => {
      const walletName = item.getAttribute("data-wallet");
      const wallet = walletManager.getWallets().find((w) => w.name === walletName);
      if (wallet) {
        await connectWallet(wallet);
      }
    });
  });

  // Transfer form
  const transferForm = document.getElementById("transfer-form") as HTMLFormElement | null;
  transferForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const recipient = (document.getElementById("recipient") as HTMLInputElement).value;
    const amount = parseFloat((document.getElementById("amount") as HTMLInputElement).value);
    await handleTransfer(recipient, amount);
  });
}

async function connectWallet(wallet: WalletInfo) {
  try {
    await walletManager.connect(wallet);
    isWalletModalOpen = false;
    render();
  } catch (error) {
    console.error("Failed to connect wallet:", error);
    alert(`Failed to connect to ${wallet.name}. Make sure the wallet is installed and unlocked.`);
  }
}

async function handleTransfer(recipient: string, amount: number) {
  const publicKey = walletManager.getPublicKey();
  if (!publicKey) {
    alert("Please connect your wallet first");
    return;
  }

  isTransferring = true;
  transferResult = null;
  transferError = null;
  currentProgress = null;
  render();

  try {
    // Token has 6 decimals
    const tokenAmount = Math.floor(amount * 1_000_000);
    const result = await executeGaslessTransfer(
      publicKey,
      recipient,
      tokenAmount,
      (tx) => walletManager.signTransaction(tx),
      (progress) => {
        currentProgress = progress;
        render();
      }
    );

    transferResult = {
      signature: result.signature,
      paymentAmount: result.paymentAmount,
    };
  } catch (error) {
    console.error("Transfer failed:", error);
    transferError = error instanceof Error ? error.message : "Unknown error occurred";
  } finally {
    isTransferring = false;
    currentProgress = null;
    render();
  }
}

// Initial render
render();
