import { useState, useEffect } from "react";

const GLITCH_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomChars(len: number): string {
  return Array.from({ length: len }, () => GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]).join("");
}

export function useIntermittentScramble(length: number): string {
  const [text, setText] = useState(() => randomChars(length));
  const [corrupting, setCorrupting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const cycle = () => {
      if (!mounted) return;
      // Stable phase: 4-8 seconds
      const stableMs = 4000 + Math.random() * 4000;
      setTimeout(() => {
        if (!mounted) return;
        setCorrupting(true);
        // Corrupt burst: 150-300ms
        const burstMs = 150 + Math.random() * 150;
        setTimeout(() => {
          if (!mounted) return;
          setText(randomChars(length));
          setCorrupting(false);
          cycle();
        }, burstMs);
      }, stableMs);
    };

    cycle();
    return () => { mounted = false; };
  }, [length]);

  // During corruption, rapidly cycle chars
  useEffect(() => {
    if (!corrupting) return;
    const id = setInterval(() => setText(randomChars(length)), 50);
    return () => clearInterval(id);
  }, [corrupting, length]);

  return text;
}
