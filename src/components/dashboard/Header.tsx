"use client";

import { Activity, Bell, Settings, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePanelStore } from "@/store/panels";
import { useState } from "react";

interface HeaderProps {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
  const { panels, checkAllPanels } = usePanelStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activePanels = panels.filter((p) => p.status === "active").length;
  const errorPanels = panels.filter((p) => p.status === "error").length;

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await checkAllPanels();
    setIsRefreshing(false);
  };

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/50">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 blur-lg rounded-full" />
              <div className="relative bg-gradient-to-br from-primary to-amber-600 p-2 rounded-xl">
                <Activity className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Panel Monitor</h1>
              <p className="text-xs text-muted-foreground">
                {panels.length} panel · {activePanels} aktif
                {errorPanels > 0 && (
                  <span className="text-red-400"> · {errorPanels} hata</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Tümünü Kontrol Et</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                {errorPanels > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-red-500 rounded-full text-[8px] flex items-center justify-center text-white font-bold">
                    {errorPanels}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">Bildirimler</p>
                <p className="text-xs text-muted-foreground">
                  Son değişiklikler ve hatalar
                </p>
              </div>
              <DropdownMenuSeparator />
              {panels.filter((p) => p.status === "error").length > 0 ? (
                panels
                  .filter((p) => p.status === "error")
                  .slice(0, 5)
                  .map((panel) => (
                    <DropdownMenuItem key={panel.id} className="flex flex-col items-start gap-1">
                      <span className="font-medium text-red-400">{panel.name}</span>
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {panel.lastError || "Bilinmeyen hata"}
                      </span>
                    </DropdownMenuItem>
                  ))
              ) : (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Yeni bildirim yok
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={onOpenSettings}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
