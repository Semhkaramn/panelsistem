"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePanelStore } from "@/store/panels";
import { Globe, Lock, Target, Clock, Info, Wand2, MousePointer2 } from "lucide-react";
import { toast } from "sonner";
import { ElementPicker } from "./ElementPicker";

interface Panel {
  id: string;
  name: string;
  loginUrl: string;
  targetUrl: string;
  email: string;
  password: string;
  elementSelector: string;
  elementLabel: string;
  checkInterval: number;
}

interface AddPanelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editPanel?: Panel | null;
}

const COMMON_SELECTORS = [
  { label: "Tablo - Toplam Satırı", value: "tr.total_amounts td button" },
  { label: "Tablo - Son Sütun", value: "tr.total td:last-child" },
  { label: "Komisyon Butonu", value: "button.btn-primary" },
  { label: "Bakiye Değeri", value: ".balance-value" },
  { label: "Dashboard Kart", value: ".card-value" },
  { label: "Özel Seçici", value: "custom" },
];

export function AddPanelDialog({ open, onOpenChange, editPanel }: AddPanelDialogProps) {
  const { addPanel, updatePanel } = usePanelStore();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("basic");

  const [formData, setFormData] = useState({
    name: "",
    loginUrl: "",
    targetUrl: "",
    email: "",
    password: "",
    elementSelector: "",
    elementLabel: "Komisyon",
    checkInterval: 30,
    isActive: true,
  });

  const [selectorType, setSelectorType] = useState("custom");
  const [elementPickerOpen, setElementPickerOpen] = useState(false);

  useEffect(() => {
    if (editPanel) {
      setFormData({
        name: editPanel.name,
        loginUrl: editPanel.loginUrl,
        targetUrl: editPanel.targetUrl,
        email: editPanel.email,
        password: editPanel.password,
        elementSelector: editPanel.elementSelector,
        elementLabel: editPanel.elementLabel,
        checkInterval: editPanel.checkInterval,
        isActive: true,
      });
      setSelectorType("custom");
    } else {
      setFormData({
        name: "",
        loginUrl: "",
        targetUrl: "",
        email: "",
        password: "",
        elementSelector: "",
        elementLabel: "Komisyon",
        checkInterval: 30,
        isActive: true,
      });
      setSelectorType("custom");
    }
    setTab("basic");
  }, [editPanel, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.loginUrl || !formData.targetUrl || !formData.elementSelector) {
      toast.error("Lütfen tüm zorunlu alanları doldurun");
      return;
    }

    setLoading(true);
    try {
      if (editPanel) {
        await updatePanel(editPanel.id, formData);
        toast.success("Panel güncellendi");
      } else {
        await addPanel(formData);
        toast.success("Panel eklendi");
      }
      onOpenChange(false);
    } catch {
      toast.error("İşlem başarısız oldu");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectorChange = (value: string) => {
    setSelectorType(value);
    if (value !== "custom") {
      setFormData((prev) => ({ ...prev, elementSelector: value }));
    }
  };

  const autoDetectFromUrl = () => {
    if (!formData.loginUrl) return;

    try {
      const url = new URL(formData.loginUrl);
      const hostname = url.hostname.replace("www.", "");
      const siteName = hostname.split(".")[0];

      setFormData((prev) => ({
        ...prev,
        name: prev.name || siteName.charAt(0).toUpperCase() + siteName.slice(1) + " Panel",
      }));
    } catch {
      // Invalid URL, ignore
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editPanel ? "Panel Düzenle" : "Yeni Panel Ekle"}
          </DialogTitle>
          <DialogDescription>
            Affiliate panelini izlemek için gerekli bilgileri girin.
            Sistem otomatik olarak giriş yapacak ve belirlediğiniz değeri kontrol edecek.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic" className="gap-2">
                <Globe className="h-4 w-4" />
                Temel
              </TabsTrigger>
              <TabsTrigger value="auth" className="gap-2">
                <Lock className="h-4 w-4" />
                Giriş
              </TabsTrigger>
              <TabsTrigger value="selector" className="gap-2">
                <Target className="h-4 w-4" />
                Seçici
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Panel Adı *</Label>
                <Input
                  id="name"
                  placeholder="Örn: Esbet Affiliate"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loginUrl">Giriş Sayfası URL *</Label>
                <div className="flex gap-2">
                  <Input
                    id="loginUrl"
                    placeholder="https://partner.example.com/auth/login"
                    value={formData.loginUrl}
                    onChange={(e) => setFormData((prev) => ({ ...prev, loginUrl: e.target.value }))}
                    onBlur={autoDetectFromUrl}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={autoDetectFromUrl}>
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Panelin giriş formunun bulunduğu sayfa
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetUrl">Hedef Sayfa URL *</Label>
                <Input
                  id="targetUrl"
                  placeholder="https://partner.example.com/reports/commission"
                  value={formData.targetUrl}
                  onChange={(e) => setFormData((prev) => ({ ...prev, targetUrl: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  İzlenecek değerin bulunduğu sayfa
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="checkInterval">Kontrol Aralığı</Label>
                  <Select
                    value={formData.checkInterval.toString()}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, checkInterval: Number.parseInt(v) }))
                    }
                  >
                    <SelectTrigger>
                      <Clock className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 saniye</SelectItem>
                      <SelectItem value="30">30 saniye</SelectItem>
                      <SelectItem value="60">1 dakika</SelectItem>
                      <SelectItem value="300">5 dakika</SelectItem>
                      <SelectItem value="600">10 dakika</SelectItem>
                      <SelectItem value="1800">30 dakika</SelectItem>
                      <SelectItem value="3600">1 saat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="elementLabel">Değer Etiketi</Label>
                  <Input
                    id="elementLabel"
                    placeholder="Komisyon"
                    value={formData.elementLabel}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, elementLabel: e.target.value }))
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="auth" className="space-y-4 mt-4">
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex gap-2">
                  <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-amber-400 font-medium">Güvenlik Notu</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Giriş bilgileriniz güvenli bir şekilde şifrelenerek saklanır.
                      Sadece otomatik giriş için kullanılır.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-posta / Kullanıcı Adı *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="affiliate@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Şifre *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                />
              </div>
            </TabsContent>

            <TabsContent value="selector" className="space-y-4 mt-4">
              {/* Element Picker Button */}
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 h-12 bg-primary/5 border-primary/30 hover:bg-primary/10"
                onClick={() => setElementPickerOpen(true)}
              >
                <MousePointer2 className="h-5 w-5 text-primary" />
                Görsel Element Seçici Aç
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">veya</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Element Seçici Şablonu</Label>
                <Select value={selectorType} onValueChange={handleSelectorChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Şablon seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_SELECTORS.map((selector) => (
                      <SelectItem key={selector.value} value={selector.value}>
                        {selector.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="elementSelector">CSS Seçici *</Label>
                <Textarea
                  id="elementSelector"
                  placeholder="tr.total_amounts td button.btn-primary"
                  value={formData.elementSelector}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, elementSelector: e.target.value }))
                  }
                  className="font-mono text-sm"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  İzlenecek değeri içeren HTML elementinin CSS seçicisi.
                  Tarayıcınızda F12 ile elementi inceleyip seçiciyi bulabilirsiniz.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-sm font-medium mb-2">Örnek Seçiciler:</p>
                <ul className="text-xs text-muted-foreground space-y-1 font-mono">
                  <li>• <code className="bg-background px-1 rounded">#commission-value</code> - ID ile</li>
                  <li>• <code className="bg-background px-1 rounded">.balance-amount</code> - Class ile</li>
                  <li>• <code className="bg-background px-1 rounded">table tr.total td:last-child</code> - Tablo</li>
                  <li>• <code className="bg-background px-1 rounded">[data-value="commission"]</code> - Attribute</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Kaydediliyor..." : editPanel ? "Güncelle" : "Ekle"}
            </Button>
          </DialogFooter>
        </form>

        <ElementPicker
          open={elementPickerOpen}
          onOpenChange={setElementPickerOpen}
          initialUrl={formData.targetUrl}
          onSelectElement={(selector, preview) => {
            setFormData((prev) => ({ ...prev, elementSelector: selector }));
            setSelectorType("custom");
            if (preview) {
              toast.success(`Element seçildi: ${preview.substring(0, 50)}...`);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
