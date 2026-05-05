"use client";

import { useEffect, useState } from "react";
import { usePanelStore } from "@/store/panels";
import { Header } from "./Header";
import { StatCard } from "./StatCard";
import { PanelCard } from "./PanelCard";
import { AddPanelDialog } from "./AddPanelDialog";
import { SettingsDialog } from "./SettingsDialog";
import { HistoryPanel } from "./HistoryPanel";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import {
  Monitor,
  Activity,
  AlertTriangle,
  TrendingUp,
  Plus,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "sonner";

interface Panel {
  id: string;
  name: string;
  loginUrl: string;
  targetUrl: string;
  email: string;
  password: string;
  elementSelector: string;
  elementLabel: string;
  isActive: boolean;
  checkInterval: number;
  lastValue: string | null;
  lastCheck: Date | null;
  lastError: string | null;
  status: string;
}

export function Dashboard() {
  const { panels, fetchPanels, fetchSettings, loading } = usePanelStore();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editPanel, setEditPanel] = useState<Panel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchPanels();
    fetchSettings();
  }, [fetchPanels, fetchSettings]);

  // Otomatik yenileme kapatıldı - kullanıcı manuel yenileyebilir

  const activePanels = panels.filter((p) => p.status === "active").length;
  const errorPanels = panels.filter((p) => p.status === "error").length;
  const totalPanels = panels.length;

  const filteredPanels = panels.filter((panel) => {
    const matchesSearch = panel.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || panel.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleEditPanel = (panel: Panel) => {
    setEditPanel(panel);
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = (open: boolean) => {
    setAddDialogOpen(open);
    if (!open) setEditPanel(null);
  };

  if (loading && panels.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full animate-pulse" />
            <div className="relative bg-gradient-to-br from-primary to-amber-600 p-4 rounded-2xl">
              <Activity className="h-8 w-8 text-primary-foreground animate-pulse" />
            </div>
          </div>
          <p className="text-muted-foreground">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--foreground))",
          },
        }}
      />

      <Header onOpenSettings={() => setSettingsOpen(true)} />

      <main className="p-6 max-w-7xl mx-auto">
        {panels.length === 0 ? (
          <EmptyState onAddPanel={() => setAddDialogOpen(true)} />
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Toplam Panel"
                value={totalPanels}
                subtitle={`${activePanels} aktif izleniyor`}
                icon={Monitor}
              />
              <StatCard
                title="Aktif"
                value={activePanels}
                subtitle="Sorunsuz çalışıyor"
                icon={Activity}
                variant="success"
              />
              <StatCard
                title="Hata"
                value={errorPanels}
                subtitle={errorPanels > 0 ? "Dikkat gerekiyor" : "Hata yok"}
                icon={AlertTriangle}
                variant={errorPanels > 0 ? "error" : "default"}
              />
              <StatCard
                title="Son 24 Saat"
                value="—"
                subtitle="Değişiklik sayısı"
                icon={TrendingUp}
                variant="warning"
              />
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Panel ara..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Durum filtrele" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="error">Hata</SelectItem>
                  <SelectItem value="pending">Bekliyor</SelectItem>
                  <SelectItem value="paused">Duraklatıldı</SelectItem>
                </SelectContent>
              </Select>
              <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Panel Ekle
              </Button>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Panels */}
              <div className="lg:col-span-2">
                {filteredPanels.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>Sonuç bulunamadı</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredPanels.map((panel) => (
                      <PanelCard
                        key={panel.id}
                        panel={panel}
                        onEdit={handleEditPanel}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <HistoryPanel />
              </div>
            </div>
          </>
        )}
      </main>

      <AddPanelDialog
        open={addDialogOpen}
        onOpenChange={handleCloseAddDialog}
        editPanel={editPanel}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
