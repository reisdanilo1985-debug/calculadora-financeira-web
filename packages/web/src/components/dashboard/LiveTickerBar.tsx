import React, { useEffect, useState } from 'react';
import { getMarketPulse, MarketAsset } from '@/lib/api';
import { ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';

export function LiveTickerBar() {
  const [pulse, setPulse] = useState<MarketAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getMarketPulse();
        setPulse(data);
      } catch (err) {
        console.error('Failed to load market pulse', err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const int = setInterval(load, 30 * 1000); // atualiza a cada 30s
    return () => clearInterval(int);
  }, []);

  if (loading || pulse.length === 0) {
    return (
      <div className="h-8 bg-black/50 border-b border-white/10 flex items-center justify-center">
        <Activity className="h-4 w-4 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="h-8 overflow-hidden bg-black/80 border-b border-primary/20 relative group">
      {/* Sombreamento lateral */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-black/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/80 to-transparent z-10 pointer-events-none" />

      <div className="flex h-full items-center animate-marquee group-hover:[animation-play-state:paused]">
        {[...pulse, ...pulse, ...pulse].map((asset, i) => {
          const isUp = asset.change >= 0;
          return (
            <div key={`${asset.symbol}-${i}`} className="flex items-center mx-4 gap-2 text-[11px] font-mono shrink-0">
              <span className="text-muted-foreground font-semibold tracking-wider">{asset.name}</span>
              <span className="text-foreground">{formatValue(asset)}</span>
              <span className={`flex items-center ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isUp ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                {asset.changePercent > 0 ? '+' : ''}{asset.changePercent.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatValue(asset: MarketAsset): string {
  const { price, currency, type } = asset;
  if (type === 'yield') return `${price.toFixed(2)}%`;
  if (type === 'index') return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (currency === 'BRL') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: price >= 1000 ? 0 : 2 }).format(price);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: price >= 1000 ? 0 : 2 }).format(price);
}
