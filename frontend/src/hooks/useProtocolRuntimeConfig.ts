import { useQuery } from "@tanstack/react-query";
import { fetchProtocolRuntimeConfig } from "../lib/protocol-runtime";
import { protocolManifest } from "../lib/protocol-config";

export function useProtocolRuntimeConfig() {
  return useQuery({
    queryKey: ["protocol-runtime-config", protocolManifest.configId],
    queryFn: fetchProtocolRuntimeConfig,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
