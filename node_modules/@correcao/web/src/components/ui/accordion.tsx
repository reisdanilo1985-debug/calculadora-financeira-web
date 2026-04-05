import React, { useState, createContext, useContext, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionContextValue {
  openItems: string[];
  toggle: (id: string) => void;
}

const AccordionContext = createContext<AccordionContextValue>({
  openItems: [],
  toggle: () => {},
});

interface AccordionProps {
  children: ReactNode;
  defaultOpen?: string[];
  className?: string;
}

export function Accordion({ children, defaultOpen = [], className = '' }: AccordionProps) {
  const [openItems, setOpenItems] = useState<string[]>(defaultOpen);

  const toggle = (id: string) => {
    setOpenItems(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function AccordionItem({ id, children, className = '' }: AccordionItemProps) {
  return <div className={className} data-accordion-item={id}>{children}</div>;
}

interface AccordionTriggerProps {
  id: string;
  children: ReactNode;
  subtitle?: string;
  className?: string;
  icon?: ReactNode;
}

export function AccordionTrigger({ id, children, subtitle, className = '', icon }: AccordionTriggerProps) {
  const { openItems, toggle } = useContext(AccordionContext);
  const isOpen = openItems.includes(id);

  return (
    <button
      type="button"
      onClick={() => toggle(id)}
      className={`w-full flex items-center gap-2 text-left group transition-colors ${className}`}
    >
      {icon && <span className="text-primary/60 shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
          {children}
        </span>
        {subtitle && !isOpen && (
          <span className="block text-[10px] text-muted-foreground/50 truncate mt-0.5">{subtitle}</span>
        )}
      </div>
      <ChevronDown
        className={`h-3.5 w-3.5 text-muted-foreground/50 shrink-0 transition-transform duration-200 ${
          isOpen ? 'rotate-180' : ''
        }`}
      />
    </button>
  );
}

interface AccordionContentProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function AccordionContent({ id, children, className = '' }: AccordionContentProps) {
  const { openItems } = useContext(AccordionContext);
  const isOpen = openItems.includes(id);

  if (!isOpen) return null;

  return (
    <div className={`animate-fade-in ${className}`}>
      {children}
    </div>
  );
}
