import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

const RPC_URL = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl("testnet");

export const suiClient = new SuiJsonRpcClient({ url: RPC_URL });

let _sponsorKeypair: Ed25519Keypair | null = null;

export function getSponsorKeypair(): Ed25519Keypair {
  if (_sponsorKeypair) return _sponsorKeypair;

  const b64 = process.env.SPONSOR_KEYPAIR_B64;
  if (!b64) {
    throw new Error("SPONSOR_KEYPAIR_B64 not set. Generate with: sui keytool generate ed25519");
  }

  // suiprivkey1q... format — decode the Bech32 private key
  const { secretKey } = decodeSuiPrivateKey(b64);
  _sponsorKeypair = Ed25519Keypair.fromSecretKey(secretKey);
  console.log(`[gas-relay] sponsor address: ${_sponsorKeypair.getPublicKey().toSuiAddress()}`);
  return _sponsorKeypair;
}

export function getSponsorAddress(): string {
  return getSponsorKeypair().getPublicKey().toSuiAddress();
}
