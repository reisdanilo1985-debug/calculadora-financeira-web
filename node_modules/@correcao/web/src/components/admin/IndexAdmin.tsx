import React, { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getCacheStatus, refreshIndex, CacheStatusItem } from '@/lib/api';
import { INDEX_LABELS, formatDate } from '@/lib/utils';

const ALL_INDEXES = ['CDI', 'SELIC_META', 'SELIC_OVER', 'IPCA', 'IGPM', 'INCC', 'SOFR'];

export function IndexAdmin() {
  const [items, setItems] = useState<CacheStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await getCacheStatus();
      setItems(data);
    } catch {
      // API pode estar offline — OK
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async (indexType: string) => {
    setRefreshing(r => ({ ...r, [indexType]: true }));
    setMessages(m => ({ ...m, [indexType]: '' }));
    try {
      const result = await refreshIndex(indexType);
      setMessages(m => ({ ...m, [indexType]: result.message }));
      await load();
    } catch (err: any) {
      setMessages(m => ({
        ...m,
        [indexType]: err.response?.data?.error || 'Erro ao atualizar.',
      }));
    } finally {
      setRefreshing(r => ({ ...r, [indexType]: false }));
    }
  };

  const getItemForIndex = (type: string) =>
    items.find(i => i.indexType === type);

  const isStale = (item?: CacheStatusItem) => {
    if (!item?.lastUpdated) return true;
    const age = (Date.now() - new Date(item.lastUpdated).getTime()) / (1000 * 60 * 60);
    return age > 24;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Administração de Índices</CardTitle>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar Status
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            Carregando status do cache...
          </div>
        ) : (
          <div className="space-y-2">
            {ALL_INDEXES.map(tipo => {
              const item = getItemForIndex(tipo);
              const stale = isStale(item);
              const msg = messages[tipo];
              const isRefreshing = refreshing[tipo];

              return (
                <div
                  key={tipo}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      {item ? (
                        stale
                          ? <Clock className="h-4 w-4 text-projected" />
                          : <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{INDEX_LABELS[tipo] || tipo}</div>
                      <div className="text-xs text-muted-foreground">
                        {item ? (
                          <>
                            {item.totalRecords.toLocaleString('pt-BR')} registros •{' '}
                            Último dado: {item.lastDate
                              ? formatDate(new Date(item.lastDate))
                              : 'N/A'
                            }
                          </>
                        ) : 'Sem dados em cache'}
                      </div>
                      {msg && (
                        <div className="text-xs text-primary mt-0.5">{msg}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {stale && item && (
                      <Badge variant="projected" className="text-xs">Desatualizado</Badge>
                    )}
                    {!item && (
                      <Badge variant="outline" className="text-xs">Vazio</Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRefresh(tipo)}
                      disabled={isRefreshing}
                      className="gap-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                      {isRefreshing ? 'Atualizando...' : 'Atualizar'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
