import { KoraClient } from "@solana/kora";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { CONFIG } from "./config";

interface KoraAccount {
  address: string;
  role: number;
}

interface KoraInstruction {
  programAddress: string;
  accounts: KoraAccount[];
  data: Uint8Array | { data: number[] } | number[];
}

export interface TransferResult {
  signature: string;
  paymentAmount: string;
  paymentToken: string;
}

export interface TransferProgress {
  step: number;
  totalSteps: number;
  message: string;
}

type ProgressCallback = (progress: TransferProgress) => void;

// Helper: Convert Kora instruction format to web3.js TransactionInstruction
function convertKoraInstruction(koraIx: KoraInstruction): TransactionInstruction {
  let data: Buffer;
  if (koraIx.data instanceof Uint8Array) {
    data = Buffer.from(koraIx.data);
  } else if (typeof koraIx.data === "object" && "data" in koraIx.data) {
    data = Buffer.from(koraIx.data.data);
  } else if (Array.isArray(koraIx.data)) {
    data = Buffer.from(koraIx.data);
  } else {
    data = Buffer.alloc(0);
  }

  return new TransactionInstruction({
    programId: new PublicKey(koraIx.programAddress),
    keys: koraIx.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.address),
      isSigner: acc.role === 2 || acc.role === 3, // READONLY_SIGNER or WRITABLE_SIGNER
      isWritable: acc.role === 1 || acc.role === 3, // WRITABLE or WRITABLE_SIGNER
    })),
    data,
  });
}

export async function executeGaslessTransfer(
  senderPublicKey: PublicKey,
  recipientAddress: string,
  amountLamports: number,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  onProgress?: ProgressCallback
): Promise<TransferResult> {
  const report = (step: number, totalSteps: number, message: string) => {
    onProgress?.({ step, totalSteps, message });
  };

  const totalSteps = 6;

  // Step 1: Initialize clients
  report(1, totalSteps, "Initializing clients...");
  const koraClient = new KoraClient({
    rpcUrl: CONFIG.koraRpcUrl,
  });
  const connection = new Connection(CONFIG.solanaRpcUrl, "confirmed");

  // Step 2: Get Kora signer info
  report(2, totalSteps, "Getting Kora signer info...");
  const { signer_address } = await koraClient.getPayerSigner();
  const koraFeePayer = new PublicKey(signer_address);

  // Get supported tokens for payment
  const { tokens: supportedTokens } = await koraClient.getSupportedTokens();
  if (!supportedTokens.length) {
    throw new Error("No supported payment tokens found");
  }
  const paymentToken = supportedTokens[0]!;

  // Step 3: Create transfer instruction
  report(3, totalSteps, "Creating transfer instruction...");
  const recipient = new PublicKey(recipientAddress);
  const transferInstruction = SystemProgram.transfer({
    fromPubkey: senderPublicKey,
    toPubkey: recipient,
    lamports: amountLamports,
  });

  // Step 4: Get payment instruction from Kora
  report(4, totalSteps, "Estimating fee and getting payment instruction...");
  const latestBlockhash = await koraClient.getBlockhash();

  // Build estimate transaction
  const estimateInstructions = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CONFIG.computeUnitPrice }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: CONFIG.computeUnitLimit }),
    transferInstruction,
  ];

  const estimateMessage = new TransactionMessage({
    payerKey: koraFeePayer,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: estimateInstructions,
  }).compileToV0Message();

  const estimateTx = new VersionedTransaction(estimateMessage);
  const estimateBase64 = Buffer.from(estimateTx.serialize()).toString("base64");

  // Get payment instruction from Kora
  const paymentResponse = await koraClient.getPaymentInstruction({
    transaction: estimateBase64,
    fee_token: paymentToken,
    source_wallet: senderPublicKey.toBase58(),
  });

  const paymentInstruction = convertKoraInstruction(
    paymentResponse.payment_instruction as unknown as KoraInstruction
  );

  // Step 5: Build and sign final transaction with payment
  report(5, totalSteps, "Building and signing transaction...");
  const newBlockhash = await koraClient.getBlockhash();

  const finalInstructions = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CONFIG.computeUnitPrice }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: CONFIG.computeUnitLimit }),
    transferInstruction,
    paymentInstruction,
  ];

  const finalMessage = new TransactionMessage({
    payerKey: koraFeePayer,
    recentBlockhash: newBlockhash.blockhash,
    instructions: finalInstructions,
  }).compileToV0Message();

  const finalTx = new VersionedTransaction(finalMessage);

  // Sign with wallet
  const signedTx = await signTransaction(finalTx);
  const signedBase64 = Buffer.from(signedTx.serialize()).toString("base64");

  // Step 6: Get Kora signature and submit
  report(6, totalSteps, "Submitting transaction...");
  const { signed_transaction } = await koraClient.signTransaction({
    transaction: signedBase64,
    signer_key: signer_address,
  });

  // Deserialize and send
  const koraSigned = VersionedTransaction.deserialize(
    Buffer.from(signed_transaction, "base64")
  );

  const signature = await connection.sendRawTransaction(koraSigned.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  // Wait for confirmation
  report(6, totalSteps, "Awaiting confirmation...");
  await connection.confirmTransaction(
    {
      signature,
      blockhash: newBlockhash.blockhash,
      lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
    },
    "confirmed"
  );

  return {
    signature,
    paymentAmount: String(paymentResponse.payment_amount),
    paymentToken,
  };
}

