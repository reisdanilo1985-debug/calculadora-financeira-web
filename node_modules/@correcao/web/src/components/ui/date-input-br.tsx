import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface DateInputBRProps {
  value: string; // yyyy-mm-dd (internal)
  onChange: (isoDate: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  className?: string;
}

/**
 * Converte yyyy-mm-dd para dd/mm/aaaa para exibição.
 */
function isoToDisplay(iso: string): string {
  if (!iso || iso.length !== 10) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Converte dd/mm/aaaa digitado para yyyy-mm-dd (ISO) para uso interno.
 * Retorna string vazia se inválido.
 */
function displayToIso(display: string): string {
  // Aceita dd/mm/aaaa, dd.mm.aaaa, dd-mm-aaaa
  const cleaned = display.replace(/[.\-]/g, '/');
  const match = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, d, m, y] = match;
  const day = parseInt(d, 10);
  const month = parseInt(m, 10);
  const year = parseInt(y, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return '';
  // Validate the date actually exists
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Aplica máscara dd/mm/aaaa conforme o usuário digita.
 */
function applyMask(raw: string): string {
  // Remove tudo que não seja dígito
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Campo de data no formato brasileiro dd/mm/aaaa
 * com máscara automática e suporte a calendário nativo.
 */
export function DateInputBR({ value, onChange, placeholder, className = '' }: DateInputBRProps) {
  const [displayValue, setDisplayValue] = useState(() => isoToDisplay(value));
  const [isFocused, setIsFocused] = useState(false);
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  // Sync display when ISO value changes externally (e.g., quick range buttons)
  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(isoToDisplay(value));
    }
  }, [value, isFocused]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyMask(e.target.value);
    setDisplayValue(masked);

    // Auto-commit when full date is typed
    if (masked.length === 10) {
      const iso = displayToIso(masked);
      if (iso) {
        onChange(iso);
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (displayValue.length === 10) {
      const iso = displayToIso(displayValue);
      if (iso) {
        onChange(iso);
        setDisplayValue(isoToDisplay(iso)); // normalize
      } else {
        // Invalid date - revert to last valid value
        setDisplayValue(isoToDisplay(value));
      }
    } else if (displayValue.length === 0) {
      onChange('');
    } else {
      // Incomplete - revert
      setDisplayValue(isoToDisplay(value));
    }
  };

  const handleCalendarClick = () => {
    hiddenDateRef.current?.showPicker?.();
  };

  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    if (iso) {
      onChange(iso);
      setDisplayValue(isoToDisplay(iso));
    }
  };

  const isValid = displayValue.length === 0 || (displayValue.length === 10 && displayToIso(displayValue) !== '');
  const isComplete = displayValue.length === 10;

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleTextChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder || 'dd/mm/aaaa'}
        className={`font-mono pr-9 ${!isValid && isComplete ? 'border-destructive/50 focus:border-destructive' : ''} ${className}`}
        maxLength={10}
      />
      {/* Ícone de calendário que abre o picker nativo */}
      <button
        type="button"
        onClick={handleCalendarClick}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-primary transition-colors"
        tabIndex={-1}
      >
        <Calendar className="h-4 w-4" />
      </button>
      {/* Input date nativo invisível para o picker */}
      <input
        ref={hiddenDateRef}
        type="date"
        value={value}
        onChange={handleNativeDateChange}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}
