import { useState } from "react";

interface TerminalNumberInputProps {
  value: string | number;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  placeholder?: string;
}

export default function TerminalNumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  placeholder,
}: TerminalNumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleIncrement = () => {
    const numValue = Number(value) || 0;
    const newValue = numValue + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue.toString());
    }
  };

  const handleDecrement = () => {
    const numValue = Number(value) || 0;
    const newValue = numValue - step;
    if (min === undefined || newValue >= min) {
      onChange(newValue.toString());
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {label && (
        <label style={{
          fontSize: "0.95rem",
          fontWeight: 500,
          color: "var(--mint)",
          display: "block",
        }}>
          {label}
        </label>
      )}
      <div style={{
        display: "flex",
        alignItems: "stretch",
        position: "relative",
      }}>
        {/* Input field */}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: "0.8rem",
            paddingRight: "2.5rem",
            fontSize: "1rem",
            background: "var(--bg-terminal)",
            color: "var(--text)",
            border: `1px solid ${isFocused ? "var(--mint)" : "var(--border-panel)"}`,
            outline: "none",
            fontFamily: "'IBM Plex Mono', monospace",
            transition: "all 0.2s ease",
            boxShadow: isFocused ? "0 0 8px rgba(202, 245, 222, 0.15)" : "none",
          }}
        />

        {/* Stepper buttons */}
        <div style={{
          position: "absolute",
          right: "0.4rem",
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "0.2rem",
          pointerEvents: "all",
        }}>
          {/* Up button */}
          <button
            onClick={handleIncrement}
            type="button"
            style={{
              width: "1.5rem",
              height: "1rem",
              padding: 0,
              fontSize: "0.8rem",
              fontWeight: 600,
              background: "transparent",
              color: "var(--mint)",
              border: "1px solid var(--mint-dim)",
              cursor: "pointer",
              fontFamily: "'IBM Plex Mono', monospace",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(202, 245, 222, 0.15)";
              e.currentTarget.style.borderColor = "var(--mint)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--mint-dim)";
            }}
          >
            ▲
          </button>

          {/* Down button */}
          <button
            onClick={handleDecrement}
            type="button"
            style={{
              width: "1.5rem",
              height: "1rem",
              padding: 0,
              fontSize: "0.8rem",
              fontWeight: 600,
              background: "transparent",
              color: "var(--mint)",
              border: "1px solid var(--mint-dim)",
              cursor: "pointer",
              fontFamily: "'IBM Plex Mono', monospace",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(202, 245, 222, 0.15)";
              e.currentTarget.style.borderColor = "var(--mint)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--mint-dim)";
            }}
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}
