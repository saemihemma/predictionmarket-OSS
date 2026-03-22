import { useQuery } from "@tanstack/react-query";

export interface ServiceHealthResult {
  configured: boolean;
  ok: boolean;
  statusCode: number | null;
  payload: unknown;
  message: string;
}

async function fetchServiceHealth(url: string): Promise<ServiceHealthResult> {
  if (!url) {
    return {
      configured: false,
      ok: false,
      statusCode: null,
      payload: null,
      message: "URL not configured",
    };
  }

  const response = await fetch(url);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    configured: true,
    ok: response.ok,
    statusCode: response.status,
    payload,
    message: response.ok ? "Healthy" : `HTTP ${response.status}`,
  };
}

export function useServiceHealth(label: string, url: string) {
  return useQuery({
    queryKey: ["service-health", label, url],
    queryFn: () => fetchServiceHealth(url),
    enabled: Boolean(url),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
