import React from 'react';
import { Share, PlusSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface IosInstallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  { icon: Share, text: 'Toque em Compartilhar na barra do Safari' },
  { icon: PlusSquare, text: 'Escolha "Adicionar à Tela de Início"' },
  { icon: null, text: 'Confirme em "Adicionar" — o ícone aparece junto aos seus apps' },
];

/** Instruções de instalação no iPhone/iPad (o Safari não tem convite automático). */
export function IosInstallSheet({ open, onOpenChange }: IosInstallSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Instalar no iPhone</DialogTitle>
          <DialogDescription>Adicione o app à tela inicial para abrir em tela cheia, como um aplicativo.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 mt-2">
          {STEPS.map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="shrink-0 h-6 w-6 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="text-muted-foreground flex items-center gap-2">
                {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
                {text}
              </span>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
