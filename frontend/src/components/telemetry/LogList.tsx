import { motion, AnimatePresence } from "framer-motion";

export interface LogEntry {
  id: string;
  timestamp: number;
  text: string;
  tribe?: number;
  color?: string;
  prefix?: string;
  type?: "info" | "alert" | "capture" | "contested" | "neutral";
}

interface LogListProps {
  entries: LogEntry[];
  maxHeight?: number;
}

function entryColor(entry: LogEntry): string {
  if (entry.color) return entry.color;
  if (entry.tribe === 2) return "var(--tribe-b)";
  if (entry.type === "alert" || entry.type === "contested") return "var(--yellow)";
  if (entry.type === "neutral") return "var(--neutral-state)";
  return "var(--tribe-a)";
}

function entryPrefix(entry: LogEntry): string {
  if (entry.prefix) return entry.prefix;
  if (entry.type === "capture" && entry.tribe === 1) return "[ CAPTURED / A ]";
  if (entry.type === "capture" && entry.tribe === 2) return "[ CAPTURED / B ]";
  if (entry.type === "capture" && entry.tribe !== undefined) return `[ CAPTURED / ${entry.tribe} ]`;
  if (entry.type === "contested") return "[ CONTESTED   ]";
  if (entry.type === "neutral") return "[ NEUTRAL     ]";
  if (entry.type === "alert") return "[ ALERT       ]";
  return "[  EVENT      ]";
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Scrollable event log — color-coded by tribe and event type.
 */
export default function LogList({ entries, maxHeight = 280 }: LogListProps) {
  return (
    <div
      style={{
        maxHeight,
        overflowY: "auto",
        fontFamily: "IBM Plex Mono",
        fontSize: "0.7rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.15rem",
      }}
    >
      <AnimatePresence initial={false}>
        {entries.map((entry) => {
          const color = entryColor(entry);
          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                display: "grid",
                gridTemplateColumns: "max-content max-content 1fr",
                gap: "0.6rem",
                padding: "0.2rem 0.1rem",
                borderBottom: "1px solid var(--border-grid)",
                alignItems: "baseline",
              }}
            >
              <span style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                {formatTime(entry.timestamp)}
              </span>
              <span style={{ color, opacity: 0.7, whiteSpace: "nowrap", fontSize: "0.6rem" }}>
                {entryPrefix(entry)}
              </span>
              <span style={{ color }}>{entry.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {entries.length === 0 && (
        <div style={{ color: "var(--text-dim)", padding: "0.5rem 0", textAlign: "center" }}>
          — no events —
        </div>
      )}
    </div>
  );
}
