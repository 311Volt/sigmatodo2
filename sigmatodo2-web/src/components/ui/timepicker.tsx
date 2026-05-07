import { useState, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TimePickerProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  step?: number; // minute granularity, must divide 60 evenly (e.g. 1, 5, 15, 30)
  className?: string;
}

const ITEM_H = 32;
const VISIBLE = 7;
const PAD = Math.floor(VISIBLE / 2) * ITEM_H; // 96px — centers item 0 when scrollTop=0

function Col({ count, value, step = 1, onChange }: { count: number; value: number; step?: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prog = useRef(false);
  const progTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snap = (v: number, smooth = false) => {
    if (!ref.current) return;
    prog.current = true;
    if (progTimer.current) clearTimeout(progTimer.current);
    if (smooth) {
      ref.current.scrollTo({ top: v * ITEM_H, behavior: 'smooth' });
      progTimer.current = setTimeout(() => { prog.current = false; }, 350);
    } else {
      ref.current.scrollTop = v * ITEM_H;
      progTimer.current = setTimeout(() => { prog.current = false; }, 50);
    }
  };

  // Snap to externally-changed value (e.g. "by 23:59 today" shortcut)
  useEffect(() => {
    if (!ref.current) return;
    if (Math.abs(ref.current.scrollTop - value * ITEM_H) > ITEM_H / 2) snap(value);
  }, [value]);

  const handleScroll = () => {
    if (prog.current) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (!ref.current) return;
      const v = Math.max(0, Math.min(count - 1, Math.round(ref.current.scrollTop / ITEM_H)));
      onChange(v);
      snap(v, true);
    }, 120);
  };

  return (
    <div className="relative w-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-popover to-transparent z-10" />
      <div
        className="pointer-events-none absolute inset-x-0 rounded border border-border"
        style={{ top: PAD, height: ITEM_H }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-popover to-transparent z-10" />
      <div
        ref={ref}
        onScroll={handleScroll}
        style={{ height: VISIBLE * ITEM_H }}
        className="overflow-y-scroll overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        <div style={{ height: PAD }} />
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            onClick={() => { onChange(i); snap(i, true); }}
            style={{ height: ITEM_H }}
            className={cn(
              'flex items-center justify-center cursor-pointer text-sm select-none transition-colors duration-100',
              i === value ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {String(i * step).padStart(2, '0')}
          </div>
        ))}
        <div style={{ height: PAD }} />
      </div>
    </div>
  );
}

export function TimePicker({ value, onChange, step = 1, className }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [hStr, mStr] = value.split(':');
  const h = Math.max(0, Math.min(23, parseInt(hStr ?? '0', 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mStr ?? '0', 10) || 0));

  const emit = (newH: number, newM: number) =>
    onChange(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);

  const mCount = Math.floor(60 / step);
  const mIndex = Math.round(m / step);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-full justify-start text-left font-normal text-xs', !value && 'text-muted-foreground', className)}
        >
          <Clock className="size-3.5 mr-2 shrink-0" />
          {value || '00:00'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex items-center gap-2">
          <Col count={24} value={h} onChange={v => emit(v, mIndex * step)} />
          <span className="text-muted-foreground text-sm select-none">:</span>
          <Col count={mCount} value={mIndex} step={step} onChange={v => emit(h, v * step)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
