/// <reference types="vite/client" />

import type { Buffer as BufferType } from "buffer";

declare global {
  interface Window {
    Buffer: typeof BufferType;
  }
}

interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC_URL: string;
  readonly VITE_KORA_RPC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

