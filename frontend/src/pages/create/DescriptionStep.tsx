interface DescriptionStepProps {
  description: string;
  onChange: (value: string) => void;
}

export default function DescriptionStep({
  description,
  onChange,
}: DescriptionStepProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-mint mb-2">
        Description
      </label>
      <textarea
        value={description}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Detailed description of the market..."
        className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none min-h-[120px] resize-vertical"
      />
    </div>
  );
}
