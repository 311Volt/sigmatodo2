import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: (date: Date) => boolean;
  clearLabel?: string;
  className?: string;
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', disabled, clearLabel, className }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="size-3.5 mr-2 shrink-0" />
          {value ? format(value, 'MMM d, yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {clearLabel && (
          <div className="p-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => { onChange(undefined); setOpen(false); }}
            >
              {clearLabel}
            </Button>
          </div>
        )}
        <Calendar
          mode="single"
          selected={value}
          onSelect={d => { onChange(d); setOpen(false); }}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}
