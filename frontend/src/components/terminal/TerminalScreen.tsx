import { type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import CRTOverlay from "./CRTOverlay";

interface TerminalScreenProps {
  children: ReactNode;
}

/**
 * Root fullscreen terminal wrapper.
 * Renders CRT overlay effects and provides the base terminal void background.
 * This is the outermost shell; render once per route.
 */
export default function TerminalScreen({ children }: TerminalScreenProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div
        style={{
          minHeight: "100dvh",
          background: "var(--bg-terminal)",
          color: "var(--text)",
          position: "relative",
          isolation: "isolate",
        }}
      >
        <CRTOverlay />
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      </div>
    </MotionConfig>
  );
}
