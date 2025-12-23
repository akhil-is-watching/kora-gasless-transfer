export const CONFIG = {
  computeUnitLimit: 200_000,
  computeUnitPrice: 1_000_000, // microLamports
  solanaRpcUrl: import.meta.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  koraRpcUrl: import.meta.env.VITE_KORA_RPC_URL || "http://localhost:8080/",
};

