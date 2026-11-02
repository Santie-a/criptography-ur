// Tipos de las respuestas de la API (ver server/network.py y server/labs.py).
// Los números de 256 bits llegan como cadenas hexadecimales de 64 caracteres.

export type NonceKind = "rfc6979" | "random" | "weak" | "constant";

export interface Wallet {
  name: string;
  address: string;
  pubkey: string;
  balance: number;
  available: number;
  next_seq: number;
  nonce: NonceKind | "custom";
  nonce_label: string;
}

export interface Tx {
  txid: string;
  coinbase: boolean;
  sender: string | null;
  sender_address: string | null;
  sender_name: string | null;
  recipient: string;
  recipient_name: string | null;
  amount: number;
  seq: number;
  memo: string;
  signature: { r: string; s: string } | null;
  payload: string;
}

export interface BlockSummary {
  index: number;
  hash: string;
  prev_hash: string;
  timestamp: number;
  difficulty: number;
  merkle_root: string;
  nonce: number;
  tx_count: number;
}

export interface BlockDetail extends BlockSummary {
  transactions: Tx[];
  merkle_levels: string[][];
  meets_difficulty: boolean;
}

export interface ScenarioParams {
  seed: number;
  difficulty: number;
  victim_nonce: NonceKind;
  entropy_bits: number;
  n_blocks: number;
  tx_per_block: number;
}

export interface NetworkState {
  version: number;
  params: ScenarioParams;
  difficulty: number;
  height: number;
  tip: string;
  wallets: Wallet[];
  mempool: Tx[];
  blocks: BlockSummary[];
  nonce_kinds: Record<NonceKind, string>;
  clients: number;
}

export interface MerkleProof {
  txid: string;
  root: string;
  proof: { sibling: string; side: "L" | "R" }[];
  valid: boolean;
}

export interface Issue {
  block: number;
  tx: number | null;
  kind: string;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  blocks_checked: number;
  signatures_checked: number;
  issues: Issue[];
  blocks: { index: number; hash: string; prev_hash: string; ok: boolean }[];
}

export interface TamperResult extends ValidationResult {
  action: string;
  description: string;
  tampered: { block: number; tx: number };
}

export interface MineResult {
  block: BlockSummary;
  attempts: number;
  expected_attempts: number;
}

export interface ObservedSignature {
  block: number;
  tx: number;
  address: string;
  name: string | null;
  r: string;
  s: string;
  z: string;
}

export interface Recovery {
  address: string;
  name: string | null;
  pubkey: string;
  first: { block: number; tx: number; s: string; z: string };
  second: { block: number; tx: number; s: string; z: string };
  r: string;
  z_diff: string;
  s_diff: string;
  s_diff_inv: string | null;
  r_inv: string;
  k: string;
  d: string;
  dG: { x: string; y: string };
  dG_matches_pubkey: boolean;
  matches_real_key: boolean;
}

export interface AttackScan {
  signatures: ObservedSignature[];
  unique_r: number;
  collisions: { address: string; name: string | null; r: string; positions: [number, number][] }[];
  pairs: number;
  recoveries: Recovery[];
}

export interface StealResult {
  tx: Tx;
  mined: MineResult;
  validation: ValidationResult;
  balances_before: Record<string, number>;
  balances_after: Record<string, number>;
}

export interface DefenseStats {
  signatures: number;
  unique_r: number;
  bob_signatures: number;
  bob_unique_r: number;
  pairs: number;
  recovered: number;
}

export type Pt = [number, number] | null;

export interface CurvePoints {
  p: number;
  a: number;
  b: number;
  order: number;
  points: [number, number][];
  hasse_bound: [number, number];
}

export interface CurveAdd {
  P: Pt;
  Q: Pt;
  R: Pt;
  lambda: number | null;
  case: "identity" | "inverse" | "tangent" | "secant";
  explanation: string;
}

export interface CurveMul {
  k: number;
  binary: string;
  P: Pt;
  order: number;
  result: Pt;
  steps: { bit_index: number; bit: string; op: "double" | "add"; point: Pt }[];
  operations: number;
}

export interface Secp256k1Info {
  name: string;
  equation: string;
  p: string;
  n: string;
  gx: string;
  gy: string;
  h: number;
  p_bits: number;
  n_bits: number;
}

export interface VerifySteps {
  valid: boolean;
  reason?: string;
  w?: string;
  u1?: string;
  u2?: string;
  X?: { x: string; y: string };
  x_mod_n?: string;
  z?: string;
}

export interface SignResult {
  message: string;
  d: string;
  Q: { x: string; y: string; compressed: string };
  hash: string;
  z: string;
  nonce: "random" | "rfc6979" | "fixed";
  k: string;
  k_inv: string;
  R: { x: string; y: string };
  r: string;
  s: string;
  verification: VerifySteps;
}

export interface RecoverResult {
  k: string;
  d: string;
  matches_pubkey: boolean | null;
}
