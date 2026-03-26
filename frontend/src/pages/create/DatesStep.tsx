import DateTimePicker from "./DateTimePicker";

interface DatesStepProps {
  closeDate: string;
  onChange: (value: string) => void;
}

export default function DatesStep({ closeDate, onChange }: DatesStepProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-mint">Market Close Date</label>
      <DateTimePicker value={closeDate} onChange={onChange} buttonAriaLabel="Market close date" />
      <div className="mt-2 text-xs text-text-muted">
        Pick the date and time when trading should close. All times use your local browser time.
      </div>
    </div>
  );
}
