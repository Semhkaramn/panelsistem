"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreVertical,
  RefreshCw,
  Edit,
  Trash2,
  ExternalLink,
  Clock,
  AlertCircle,
} from "lucide-react";
import { usePanelStore } from "@/store/panels";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

interface Panel {
  id: string;
  name: string;
  loginUrl: string;
  targetUrl: string;
  email: string;
  elementSelector: string;
  elementLabel: string;
  isActive: boolean;
  checkInterval: number;
  lastValue: string | null;
  lastCheck: Date | null;
  lastError: string | null;
  status: string;
}

interface PanelCardProps {
  panel: Panel;
  onEdit: (panel: Panel) => void;
}

export function PanelCard({ panel, onEdit }: PanelCardProps) {
  const { updatePanel, deletePanel, checkPanel } = usePanelStore();
  const [isChecking, setIsChecking] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleCheck = async () => {
    setIsChecking(true);
    try {
      await checkPanel(panel.id);
    } finally {
      setIsChecking(false);
    }
  };

  const handleToggleActive = async () => {
    await updatePanel(panel.id, { isActive: !panel.isActive });
  };

  const handleDelete = async () => {
    await deletePanel(panel.id);
    setDeleteDialogOpen(false);
  };

  const statusConfig = {
    active: { label: "Aktif", className: "status-active" },
    error: { label: "Hata", className: "status-error" },
    pending: { label: "Bekliyor", className: "status-pending" },
    paused: { label: "Duraklatıldı", className: "status-paused" },
  };

  const status = statusConfig[panel.status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <>
      <Card className="group relative overflow-hidden bg-card hover:bg-card/80 transition-all duration-300 gradient-border">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold truncate">{panel.name}</h3>
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {panel.elementLabel}
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(panel)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Düzenle
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={panel.targetUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Paneli Aç
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-400 focus:text-red-400"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Sil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Value */}
          <div className="mb-4">
            {panel.lastValue ? (
              <div className="value-highlight inline-block">
                <span className="text-xl font-bold text-primary">
                  {panel.lastValue}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Henüz değer alınmadı
              </p>
            )}
          </div>

          {/* Error */}
          {panel.lastError && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400 line-clamp-2">{panel.lastError}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {panel.lastCheck ? (
                <span>
                  {formatDistanceToNow(new Date(panel.lastCheck), {
                    addSuffix: true,
                    locale: tr,
                  })}
                </span>
              ) : (
                <span>Henüz kontrol edilmedi</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCheck}
                disabled={isChecking}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`}
                />
              </Button>
              <Switch
                checked={panel.isActive}
                onCheckedChange={handleToggleActive}
              />
            </div>
          </div>
        </div>

        {/* Active indicator */}
        {panel.isActive && panel.status === "active" && (
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-green-400 to-green-600" />
        )}
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Paneli Sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{panel.name}</strong> panelini silmek istediğinize emin misiniz?
              Bu işlem geri alınamaz ve tüm geçmiş veriler silinecektir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
