import { useEffect, useMemo, useRef, useState } from "react";

const DAY_LABELS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5);

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function createDefaultDate(): Date {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(12, 0, 0, 0);
  return nextWeek;
}

export function parseLocalDateTime(value: string): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw) - 1;
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  const parsed = new Date(year, month, day, hour, minute, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    return null;
  }

  return parsed;
}

export function toLocalDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function formatLocalDateTime(value: string): string {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    return "Choose close date and time";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  buttonAriaLabel?: string;
}

export default function DateTimePicker({ value, onChange, buttonAriaLabel }: DateTimePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseLocalDateTime(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => (selectedDate ?? createDefaultDate()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selectedDate ?? createDefaultDate()).getMonth());

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const activeDate = selectedDate ?? createDefaultDate();
    setViewYear(activeDate.getFullYear());
    setViewMonth(activeDate.getMonth());
  }, [isOpen, selectedDate, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const activeDate = selectedDate ?? createDefaultDate();
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const yearOptions = Array.from({ length: 12 }, (_, index) => new Date().getFullYear() - 1 + index);

  const goToMonth = (delta: number) => {
    const nextMonth = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(nextMonth.getFullYear());
    setViewMonth(nextMonth.getMonth());
  };

  const updateSelectedDate = (next: Date) => {
    next.setSeconds(0, 0);
    onChange(toLocalDateTimeValue(next));
  };

  const handleSelectDay = (day: number) => {
    const next = new Date(activeDate);
    next.setFullYear(viewYear, viewMonth, day);
    updateSelectedDate(next);
  };

  const handleHourChange = (hour: string) => {
    const next = new Date(activeDate);
    next.setHours(Number(hour));
    updateSelectedDate(next);
  };

  const handleMinuteChange = (minute: string) => {
    const next = new Date(activeDate);
    next.setMinutes(Number(minute));
    updateSelectedDate(next);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={buttonAriaLabel}
        className="touch-target flex min-h-11 w-full items-center justify-between border border-border-panel bg-bg-terminal px-4 py-3 text-left text-base text-text outline-none"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span>{value ? formatLocalDateTime(value) : "Choose close date and time"}</span>
        <span className="text-xs tracking-[0.14em] text-text-dim">{isOpen ? "CLOSE" : "CALENDAR"}</span>
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close picker"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-30 bg-[rgba(0,0,0,0.45)] md:hidden"
          />
          <div className="fixed inset-x-3 bottom-3 z-40 border border-border-panel bg-bg-panel p-4 shadow-[0_0_20px_rgba(0,0,0,0.45)] md:absolute md:inset-x-auto md:bottom-auto md:top-[calc(100%+0.5rem)] md:w-[22rem]">
            <div className="mb-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => goToMonth(-1)}
                className="touch-target border border-border-panel px-3 py-2 text-xs tracking-[0.1em] text-text"
              >
                &lt; PREV
              </button>

              <div className="flex min-w-0 flex-1 gap-2">
                <select
                  value={viewMonth}
                  onChange={(event) => setViewMonth(Number(event.target.value))}
                  className="touch-target min-h-11 flex-1 border border-border-panel bg-bg-terminal px-3 py-2 text-sm text-text outline-none"
                >
                  {MONTH_LABELS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={viewYear}
                  onChange={(event) => setViewYear(Number(event.target.value))}
                  className="touch-target min-h-11 w-28 border border-border-panel bg-bg-terminal px-3 py-2 text-sm text-text outline-none"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => goToMonth(1)}
                className="touch-target border border-border-panel px-3 py-2 text-xs tracking-[0.1em] text-text"
              >
                NEXT &gt;
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-[0.62rem] tracking-[0.12em] text-text-dim">
              {DAY_LABELS.map((label) => (
                <div key={label} className="py-1">
                  {label}
                </div>
              ))}

              {Array.from({ length: firstDayOfMonth }).map((_, index) => (
                <div key={`empty-${index}`} />
              ))}

              {Array.from({ length: daysInMonth }, (_, index) => {
                const day = index + 1;
                const isSelected =
                  selectedDate &&
                  selectedDate.getFullYear() === viewYear &&
                  selectedDate.getMonth() === viewMonth &&
                  selectedDate.getDate() === day;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={`touch-target min-h-11 border px-0 py-2 text-sm transition-all duration-150 ${
                      isSelected
                        ? "border-mint-dim bg-[rgba(202,245,222,0.12)] text-mint"
                        : "border-border-panel bg-bg-terminal text-text"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[0.62rem] tracking-[0.12em] text-text-dim">HOUR</label>
                <select
                  value={pad(activeDate.getHours())}
                  onChange={(event) => handleHourChange(event.target.value)}
                  className="touch-target min-h-11 w-full border border-border-panel bg-bg-terminal px-3 py-2 text-sm text-text outline-none"
                >
                  {Array.from({ length: 24 }, (_, index) => (
                    <option key={index} value={pad(index)}>
                      {pad(index)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-[0.62rem] tracking-[0.12em] text-text-dim">MINUTE</label>
                <select
                  value={pad(activeDate.getMinutes() - (activeDate.getMinutes() % 5))}
                  onChange={(event) => handleMinuteChange(event.target.value)}
                  className="touch-target min-h-11 w-full border border-border-panel bg-bg-terminal px-3 py-2 text-sm text-text outline-none"
                >
                  {MINUTE_OPTIONS.map((minute) => (
                    <option key={minute} value={pad(minute)}>
                      {pad(minute)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 text-[0.62rem] tracking-[0.08em] text-text-dim">
              <span>{formatLocalDateTime(value)}</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="touch-target border border-mint-dim bg-[rgba(202,245,222,0.1)] px-3 py-2 text-[0.65rem] font-semibold tracking-[0.12em] text-mint"
              >
                DONE
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
