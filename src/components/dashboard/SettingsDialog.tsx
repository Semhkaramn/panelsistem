"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { usePanelStore } from "@/store/panels";
import { Send, Plus, X, Clock, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, updateSettings, fetchSettings } = usePanelStore();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  const [formData, setFormData] = useState({
    telegramToken: "",
    newChatId: "",
    chatIds: [] as string[],
    dailyReportTime: "00:00",
    dailyReportEnabled: true,
  });

  useEffect(() => {
    if (open) {
      fetchSettings();
    }
  }, [open, fetchSettings]);

  useEffect(() => {
    if (settings) {
      setFormData({
        telegramToken: "",
        newChatId: "",
        chatIds: settings.telegramChatIds || [],
        dailyReportTime: settings.dailyReportTime || "00:00",
        dailyReportEnabled: settings.dailyReportEnabled ?? true,
      });
    }
  }, [settings]);

  const handleAddChatId = () => {
    if (formData.newChatId && !formData.chatIds.includes(formData.newChatId)) {
      setFormData((prev) => ({
        ...prev,
        chatIds: [...prev.chatIds, prev.newChatId],
        newChatId: "",
      }));
    }
  };

  const handleRemoveChatId = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      chatIds: prev.chatIds.filter((cid) => cid !== id),
    }));
  };

  const handleTestTelegram = async () => {
    if (!formData.telegramToken) {
      toast.error("Bot Token gerekli");
      return;
    }

    const testChatId = formData.chatIds[0] || formData.newChatId;
    if (!testChatId) {
      toast.error("En az bir Chat ID gerekli");
      return;
    }

    setTestLoading(true);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: formData.telegramToken,
          chatId: testChatId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Test mesajı gönderildi!");
      } else {
        toast.error(data.error || "Test başarısız");
      }
    } catch {
      toast.error("Test başarısız");
    } finally {
      setTestLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updateData: Record<string, unknown> = {
        telegramChatIds: formData.chatIds,
        dailyReportTime: formData.dailyReportTime,
        dailyReportEnabled: formData.dailyReportEnabled,
      };

      if (formData.telegramToken) {
        updateData.telegramToken = formData.telegramToken;
      }

      await updateSettings(updateData);
      toast.success("Ayarlar kaydedildi");
      onOpenChange(false);
    } catch {
      toast.error("Kaydetme başarısız");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ayarlar</SheetTitle>
          <SheetDescription>
            Telegram bildirimleri ve günlük rapor ayarlarını yapılandırın.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Telegram Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Telegram Bildirimleri</h3>
            </div>

            <div className="space-y-2">
              <Label htmlFor="token">Bot Token</Label>
              <Input
                id="token"
                type="password"
                placeholder={settings?.hasToken ? "••••• (kayıtlı)" : "123456789:ABCdef..."}
                value={formData.telegramToken}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, telegramToken: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                @BotFather'dan aldığınız bot token'ı
              </p>
            </div>

            <div className="space-y-2">
              <Label>Chat ID'ler</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="123456789"
                  value={formData.newChatId}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, newChatId: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleAddChatId()}
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddChatId}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {formData.chatIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.chatIds.map((id) => (
                    <Badge key={id} variant="secondary" className="gap-1 pr-1">
                      {id}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                        onClick={() => handleRemoveChatId(id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Bildirim alacak kullanıcıların Chat ID'leri. @userinfobot ile öğrenebilirsiniz.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleTestTelegram}
              disabled={testLoading}
            >
              {testLoading ? (
                <>
                  <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Test Ediliyor...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Test Mesajı Gönder
                </>
              )}
            </Button>
          </div>

          <Separator />

          {/* Daily Report Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Günlük Rapor</h3>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dailyReport">Günlük Rapor Gönder</Label>
                <p className="text-xs text-muted-foreground">
                  Her gün belirli saatte tüm panellerin özetini gönder
                </p>
              </div>
              <Switch
                id="dailyReport"
                checked={formData.dailyReportEnabled}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, dailyReportEnabled: checked }))
                }
              />
            </div>

            {formData.dailyReportEnabled && (
              <div className="space-y-2">
                <Label htmlFor="reportTime">Rapor Saati (TR)</Label>
                <Input
                  id="reportTime"
                  type="time"
                  value={formData.dailyReportTime}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, dailyReportTime: e.target.value }))
                  }
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Info */}
          <div className="rounded-lg bg-secondary/50 p-4 space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              Nasıl Çalışır?
            </h4>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <Check className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
                Panel değeri değiştiğinde anında Telegram bildirimi
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
                Günlük rapor ile tüm panellerin özet durumu
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
                Hata durumlarında otomatik uyarı
              </li>
            </ul>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              İptal
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
