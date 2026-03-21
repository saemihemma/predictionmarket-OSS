import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

const RPC = import.meta.env.VITE_SUI_RPC ?? getJsonRpcFullnodeUrl("testnet");

export const suiClient = new SuiJsonRpcClient({ url: RPC, network: "testnet" });
