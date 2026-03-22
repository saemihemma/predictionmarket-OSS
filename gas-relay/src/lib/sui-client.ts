import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

function isDeployedEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_PROJECT_ID) ||
    Boolean(process.env.RAILWAY_ENVIRONMENT_NAME)
  );
}

const RPC_URL = process.env.SUI_RPC_URL ?? (!isDeployedEnvironment() ? getJsonRpcFullnodeUrl("testnet") : undefined);

if (!RPC_URL) {
  throw new Error("SUI_RPC_URL must be set when deploying the gas relay.");
}

export const suiClient = new SuiJsonRpcClient({
  url: RPC_URL,
  network: "testnet",
} as never);

let sponsorKeypair: Ed25519Keypair | null = null;

export function getSponsorKeypair(): Ed25519Keypair {
  if (sponsorKeypair) {
    return sponsorKeypair;
  }

  const bech32Key = process.env.SPONSOR_KEYPAIR ?? process.env.SPONSOR_KEYPAIR_B64;
  if (!bech32Key) {
    throw new Error("SPONSOR_KEYPAIR not set. Provide a suiprivkey... value from sui keytool export.");
  }

  const { secretKey } = decodeSuiPrivateKey(bech32Key);
  sponsorKeypair = Ed25519Keypair.fromSecretKey(secretKey);
  console.log(`[gas-relay] sponsor address: ${sponsorKeypair.getPublicKey().toSuiAddress()}`);
  return sponsorKeypair;
}

export function getSponsorAddress(): string {
  return getSponsorKeypair().getPublicKey().toSuiAddress();
}
