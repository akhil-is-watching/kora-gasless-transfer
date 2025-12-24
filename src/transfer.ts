import { KoraClient } from "@solana/kora";
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { sendGasless, type GaslessResult } from "./gasless";
import { CONFIG } from "./config";

// USDC token mint on Solana
const TOKEN_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

export interface TransferProgress {
  step: number;
  totalSteps: number;
  message: string;
}

type ProgressCallback = (progress: TransferProgress) => void;

export async function executeGaslessTransfer(
  senderPublicKey: PublicKey,
  recipientAddress: string,
  amount: number, // Token amount in smallest units (e.g., 6 decimals for USDC)
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  onProgress?: ProgressCallback
): Promise<GaslessResult> {
  const report = (step: number, message: string) => {
    onProgress?.({ step, totalSteps: 3, message });
  };

  // Step 1: Initialize
  report(1, "Initializing...");
  const connection = new Connection(CONFIG.solanaRpcUrl, "confirmed");
  const kora = new KoraClient({ rpcUrl: CONFIG.koraRpcUrl });
  const recipient = new PublicKey(recipientAddress);

  // Step 2: Get token accounts and create instructions
  report(2, "Preparing token transfer...");
  
  const senderAta = await getAssociatedTokenAddress(TOKEN_MINT, senderPublicKey);
  const recipientAta = await getAssociatedTokenAddress(TOKEN_MINT, recipient);

  const instructions = [];

  // Check if recipient ATA exists, if not add create instruction
  try {
    await getAccount(connection, recipientAta);
  } catch {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        senderPublicKey, // payer
        recipientAta,    // ata
        recipient,       // owner
        TOKEN_MINT       // mint
      )
    );
  }

  // Add transfer instruction
  instructions.push(
    createTransferInstruction(
      senderAta,       // source
      recipientAta,    // destination
      senderPublicKey, // owner
      amount           // amount
    )
  );

  // Build transaction
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: senderPublicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message()
  );

  // Step 3: Send gaslessly via Kora
  report(3, "Sending gasless transaction...");
  return sendGasless(connection, kora, tx, senderPublicKey, signTransaction);
}
