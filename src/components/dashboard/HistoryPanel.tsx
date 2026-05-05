"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { History, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";

interface HistoryEntry {
  id: string;
  panelId: string;
  oldValue: string | null;
  newValue: string;
  changedAt: string;
  panel: {
    name: string;
  };
}

export function HistoryPanel() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch("/api/history?limit=20");
        const data = await res.json();
        setHistory(data.history || []);
      } catch (error) {
        console.error("Failed to fetch history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
    // Otomatik yenileme kapatıldı - kullanıcı manuel yenileyebilir
  }, []);

  const parseValue = (value: string | null): number | null => {
    if (!value) return null;
    const cleaned = value.replace(/[^0-9.-]/g, "");
    return Number.parseFloat(cleaned) || null;
  };

  const getTrend = (oldValue: string | null, newValue: string) => {
    const oldNum = parseValue(oldValue);
    const newNum = parseValue(newValue);

    if (oldNum === null || newNum === null) return null;
    if (newNum > oldNum) return "up";
    if (newNum < oldNum) return "down";
    return null;
  };

  if (loading) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Son Değişiklikler</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-secondary rounded w-3/4 mb-2" />
              <div className="h-3 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <History className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Son Değişiklikler</h3>
        {history.length > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {history.length}
          </Badge>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Henüz değişiklik yok</p>
        </div>
      ) : (
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-3">
            {history.map((entry) => {
              const trend = getTrend(entry.oldValue, entry.newValue);
              return (
                <div
                  key={entry.id}
                  className="p-3 rounded-lg bg-secondary/50 border border-border/50 animate-fade-in"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{entry.panel.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.changedAt), {
                        addSuffix: true,
                        locale: tr,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <code className="text-muted-foreground bg-background px-2 py-0.5 rounded text-xs">
                      {entry.oldValue || "—"}
                    </code>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <code
                      className={`px-2 py-0.5 rounded text-xs ${
                        trend === "up"
                          ? "bg-green-500/10 text-green-400"
                          : trend === "down"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-primary/10 text-primary"
                      }`}
                    >
                      {entry.newValue}
                    </code>
                    {trend === "up" && <TrendingUp className="h-3 w-3 text-green-400" />}
                    {trend === "down" && <TrendingDown className="h-3 w-3 text-red-400" />}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}
