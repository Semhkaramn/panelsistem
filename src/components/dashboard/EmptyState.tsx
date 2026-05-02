"use client";

import { Button } from "@/components/ui/button";
import { Plus, Monitor, ArrowRight } from "lucide-react";

interface EmptyStateProps {
  onAddPanel: () => void;
}

export function EmptyState({ onAddPanel }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
        <div className="relative bg-gradient-to-br from-secondary to-background p-8 rounded-2xl border border-border">
          <Monitor className="h-16 w-16 text-primary" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-center mb-2">
        Henüz Panel Eklenmemiş
      </h2>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        Affiliate panellerinizi izlemeye başlamak için ilk panelinizi ekleyin.
        Değer değiştiğinde anında Telegram bildirimi alın.
      </p>

      <Button size="lg" className="gap-2" onClick={onAddPanel}>
        <Plus className="h-5 w-5" />
        İlk Paneli Ekle
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 max-w-3xl w-full">
        {[
          {
            step: "1",
            title: "Panel Bilgilerini Girin",
            desc: "Giriş URL'si, hedef sayfa ve credentials",
          },
          {
            step: "2",
            title: "Element Seçin",
            desc: "İzlenecek değerin CSS seçicisini belirtin",
          },
          {
            step: "3",
            title: "Bildirimleri Alın",
            desc: "Değer değişince Telegram'a bildirim",
          },
        ].map((item) => (
          <div
            key={item.step}
            className="p-4 rounded-xl bg-secondary/30 border border-border/50"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm mb-3">
              {item.step}
            </div>
            <h3 className="font-medium mb-1">{item.title}</h3>
            <p className="text-sm text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
