import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createDAppKit } from "@mysten/dapp-kit-core";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import "./index.css";
import { getProtocolManifest, initializeProtocolManifest } from "./lib/protocol-config";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
    },
  },
});

async function bootstrap() {
  await initializeProtocolManifest();

  const manifest = getProtocolManifest();
  const [{ default: App }, { suiClient }] = await Promise.all([
    import("./App"),
    import("./lib/client"),
  ]);

  const dAppKit = createDAppKit({
    networks: [manifest.network],
    defaultNetwork: manifest.network,
    createClient: () => suiClient,
    autoConnect: false,
  });

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <DAppKitProvider dAppKit={dAppKit}>
          <App />
        </DAppKitProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

bootstrap().catch((error) => {
  console.error("Failed to initialize protocol manifest:", error);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050807",
          color: "#caf5de",
          fontFamily: "IBM Plex Mono, monospace",
          padding: "24px",
          textAlign: "center",
        }}
      >
        Unable to load the live protocol manifest. Check the deployment artifact and try again.
      </div>
    </React.StrictMode>,
  );
});
