interface DatesStepProps {
  closeDate: string;
  onChange: (value: string) => void;
}

export default function DatesStep({ closeDate, onChange }: DatesStepProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-mint mb-2">
        Market Close Date
      </label>
      <input
        type="datetime-local"
        value={closeDate}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-4 text-base bg-bg-terminal text-text border border-border-panel outline-none"
      />
    </div>
  );
}
