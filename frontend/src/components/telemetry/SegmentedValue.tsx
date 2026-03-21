import { useEffect, useRef, useState } from "react";
import { useSpring, useMotionValueEvent, motion } from "framer-motion";

interface SegmentedValueProps {
  value: number;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  unit?: string;
  animate?: boolean;
}

const sizeMap = {
  sm: "1.4rem",
  md: "2rem",
  lg: "2.8rem",
  xl: "3.8rem",
};

/**
 * Large animated numeric display in Orbitron.
 * Fast snap spring (no bounce) + brief opacity flicker on value change.
 */
export default function SegmentedValue({
  value,
  color = "var(--mint)",
  size = "lg",
  unit,
  animate = true,
}: SegmentedValueProps) {
  const spring = useSpring(animate ? 0 : value, {
    stiffness: 200,
    damping: 40,
    mass: 0.8,
  });
  const [display, setDisplay] = useState(animate ? 0 : value);
  const [flicker, setFlicker] = useState(false);
  const prevValue = useRef(value);

  useMotionValueEvent(spring, "change", setDisplay);

  useEffect(() => {
    if (prevValue.current !== value) {
      // Brief flicker on value change
      setFlicker(true);
      setTimeout(() => setFlicker(false), 180);
      prevValue.current = value;
    }
    spring.set(value);
  }, [value, spring]);

  return (
    <motion.span
      animate={{ opacity: flicker ? [1, 0.5, 1] : 1 }}
      transition={{ duration: 0.18, ease: "linear" }}
      style={{
        display: "inline-block",
        fontFamily: "IBM Plex Mono",
        fontSize: sizeMap[size],
        fontWeight: 700,
        color,
        letterSpacing: "0.01em",
        lineHeight: 1,
        textShadow: `0 0 12px ${color}40`,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {Math.round(display).toLocaleString()}
      {unit && (
        <span
          style={{
            fontSize: "0.4em",
            marginLeft: "0.3em",
            color: "var(--text-dim)",
            letterSpacing: "0.1em",
          }}
        >
          {unit}
        </span>
      )}
    </motion.span>
  );
}
