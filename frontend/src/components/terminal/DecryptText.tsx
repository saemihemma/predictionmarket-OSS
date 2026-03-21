import { useState, useEffect, useRef } from "react";

const DEFAULT_GLITCH_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*<>{}[]=/\\";
const CLEAN_GLITCH_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TICK_MS = 40;

interface DecryptTextProps {
  text: string;
  active: boolean;
  durationMs?: number;
  glitchChars?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function DecryptText({
  text,
  active,
  durationMs = 800,
  glitchChars = DEFAULT_GLITCH_CHARS,
  className,
  style,
}: DecryptTextProps) {
  const [display, setDisplay] = useState(text);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jitterRef = useRef<number[]>([]);

  useEffect(() => {
    // Clean up any running interval
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!active) {
      setDisplay(text);
      return;
    }

    // Compute per-character resolve times with jitter
    const perChar = text.length > 1 ? durationMs / text.length : durationMs;
    const jitterRange = perChar * 0.15; // ±15%
    jitterRef.current = Array.from({ length: text.length }, (_, i) => {
      const base = (i / Math.max(text.length - 1, 1)) * durationMs;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, base + jitter);
    });

    const startTime = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      let allResolved = true;
      const chars: string[] = [];

      for (let i = 0; i < text.length; i++) {
        if (text[i] === " ") {
          // Spaces always show as spaces
          chars.push(" ");
        } else if (elapsed >= jitterRef.current[i]) {
          chars.push(text[i]);
        } else {
          allResolved = false;
          chars.push(glitchChars[Math.floor(Math.random() * glitchChars.length)]);
        }
      }

      setDisplay(chars.join(""));

      if (allResolved && intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, TICK_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, text, durationMs, glitchChars]);

  return (
    <span className={className} style={style}>
      {display}
    </span>
  );
}

export { DEFAULT_GLITCH_CHARS, CLEAN_GLITCH_CHARS };
