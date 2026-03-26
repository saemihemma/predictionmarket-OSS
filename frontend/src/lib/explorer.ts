const EXPLORER_BASE_URL = "https://testnet.suivision.xyz/txblock";

export function buildTransactionExplorerUrl(digest: string): string {
  return `${EXPLORER_BASE_URL}/${digest}`;
}
