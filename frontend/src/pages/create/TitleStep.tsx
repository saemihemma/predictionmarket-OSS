import { useId } from "react";

interface TitleStepProps {
  title: string;
  onChange: (value: string) => void;
}

export default function TitleStep({ title, onChange }: TitleStepProps) {
  const inputId = useId();

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-mint mb-2">
        Market Title
      </label>
      <input
        id={inputId}
        type="text"
        value={title}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g., BTC above $50k by March 2025"
        className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none placeholder-text-dim placeholder-opacity-80"
      />
    </div>
  );
}
