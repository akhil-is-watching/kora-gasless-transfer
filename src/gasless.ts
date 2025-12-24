import { KoraClient } from "@solana/kora";
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";

function convertKoraIx(ix: any): TransactionInstruction {
  const data = ix.data instanceof Uint8Array ? ix.data : ix.data?.data ?? ix.data ?? [];
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: ix.accounts.map((a: any) => ({
      pubkey: new PublicKey(a.address),
      isSigner: a.role === 2 || a.role === 3,
      isWritable: a.role === 1 || a.role === 3,
    })),
    data: Buffer.from(data),
  });
}

export interface GaslessResult {
  signature: string;
  paymentAmount: string;
  paymentToken: string;
}

export async function sendGasless(
  connection: Connection,
  kora: KoraClient,
  tx: VersionedTransaction,
  sender: PublicKey,
  sign: (tx: VersionedTransaction) => Promise<VersionedTransaction>
): Promise<GaslessResult> {
  const { signer_address } = await kora.getPayerSigner();
  const { tokens } = await kora.getSupportedTokens();
  const feePayer = new PublicKey(signer_address);

  // Extract original instructions
  const msg = tx.message;
  const ixs = msg.compiledInstructions.map((ix) => new TransactionInstruction({
    programId: msg.staticAccountKeys[ix.programIdIndex]!,
    keys: ix.accountKeyIndexes.map((i) => ({
      pubkey: msg.staticAccountKeys[i]!,
      isSigner: msg.isAccountSigner(i),
      isWritable: msg.isAccountWritable(i),
    })),
    data: Buffer.from(ix.data),
  }));

  // Get payment instruction
  const { blockhash } = await kora.getBlockhash();
  const estTx = new VersionedTransaction(new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ...ixs,
    ],
  }).compileToV0Message());

  const { payment_instruction, payment_amount } = await kora.getPaymentInstruction({
    transaction: Buffer.from(estTx.serialize()).toString("base64"),
    fee_token: tokens[0]!,
    source_wallet: sender.toBase58(),
  });

  // Build final tx with payment
  const { blockhash: newHash } = await connection.getLatestBlockhash();
  const finalTx = new VersionedTransaction(new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: newHash,
    instructions: [...ixs, convertKoraIx(payment_instruction)],
  }).compileToV0Message());

  // Sign with wallet, then Kora, then send
  const signed = await sign(finalTx);
  const { signed_transaction } = await kora.signTransaction({
    transaction: Buffer.from(signed.serialize()).toString("base64"),
    signer_key: signer_address,
  });

  const sig = await connection.sendRawTransaction(
    VersionedTransaction.deserialize(Buffer.from(signed_transaction, "base64")).serialize()
  );
  await connection.confirmTransaction(sig, "confirmed");

  return { signature: sig, paymentAmount: String(payment_amount), paymentToken: tokens[0]! };
}

