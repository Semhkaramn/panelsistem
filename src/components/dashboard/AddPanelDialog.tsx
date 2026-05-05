"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePanelStore } from "@/store/panels";
import {
  Globe,
  Lock,
  Target,
  Clock,
  Info,
  MousePointer2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
  Crosshair,
  Save
} from "lucide-react";
import { toast } from "sonner";

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

interface DetectedInput {
  selector: string;
  type: string;
  name: string;
  placeholder: string;
  label: string;
}

interface DetectedElement {
  selector: string;
  text: string;
  tagName: string;
  rect: { x: number; y: number; width: number; height: number };
}

type Step = "browse" | "login" | "select" | "confirm";

export function AddPanelDialog({ open, onOpenChange, editPanel }: AddPanelDialogProps) {
  const { addPanel, updatePanel } = usePanelStore();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("browse");
  const [showPassword, setShowPassword] = useState(false);

  // Browser state
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [pageLoading, setPageLoading] = useState(false);
  const [pageHtml, setPageHtml] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Login detection
  const [detectedInputs, setDetectedInputs] = useState<DetectedInput[]>([]);
  const [emailSelector, setEmailSelector] = useState("");
  const [passwordSelector, setPasswordSelector] = useState("");

  // Element selection
  const [selectMode, setSelectMode] = useState(false);
  const [detectedElements, setDetectedElements] = useState<DetectedElement[]>([]);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);

  // Form data
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

  // Reset on open/close
  useEffect(() => {
    if (open) {
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
        setUrl(editPanel.loginUrl);
        setStep("browse");
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
        setUrl("");
        setCurrentUrl("");
        setPageHtml(null);
        setStep("browse");
      }
    }
  }, [editPanel, open]);

  // Load page via proxy
  const loadPage = useCallback(async (targetUrl: string) => {
    if (!targetUrl) {
      setPageError("URL gerekli");
      return;
    }

    setPageLoading(true);
    setPageError(null);
    setPageHtml(null);
    setDetectedInputs([]);
    setDetectedElements([]);

    try {
      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Sayfa yüklenemedi");
      }

      setPageHtml(data.html);
      setCurrentUrl(targetUrl);

      // Auto-detect panel name from URL
      try {
        const urlObj = new URL(targetUrl);
        const hostname = urlObj.hostname.replace("www.", "");
        const siteName = hostname.split(".")[0];
        if (!formData.name) {
          setFormData(prev => ({
            ...prev,
            name: siteName.charAt(0).toUpperCase() + siteName.slice(1) + " Panel",
            loginUrl: targetUrl
          }));
        }
      } catch {}

      // Detect login inputs
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.html, "text/html");

      const inputs: DetectedInput[] = [];
      const inputEls = doc.querySelectorAll('input[type="email"], input[type="text"], input[type="password"], input[name*="email"], input[name*="user"], input[name*="login"], input[name*="pass"]');

      inputEls.forEach((el) => {
        const input = el as HTMLInputElement;
        let selector = "";
        if (input.id) selector = `#${input.id}`;
        else if (input.name) selector = `input[name="${input.name}"]`;
        else if (input.className) selector = `input.${input.className.split(" ")[0]}`;

        const label = doc.querySelector(`label[for="${input.id}"]`)?.textContent || "";

        inputs.push({
          selector,
          type: input.type,
          name: input.name || "",
          placeholder: input.placeholder || "",
          label: label.trim()
        });
      });

      setDetectedInputs(inputs);

      // Auto-select email/password fields
      const emailInput = inputs.find(i =>
        i.type === "email" ||
        i.name.toLowerCase().includes("email") ||
        i.name.toLowerCase().includes("user") ||
        i.placeholder.toLowerCase().includes("email")
      );
      const passInput = inputs.find(i =>
        i.type === "password" ||
        i.name.toLowerCase().includes("pass")
      );

      if (emailInput) setEmailSelector(emailInput.selector);
      if (passInput) setPasswordSelector(passInput.selector);

      // Detect value elements for selection
      const elements: DetectedElement[] = [];
      const valueSelectors = [
        "h1", "h2", "h3", "h4",
        ".value", ".amount", ".balance", ".total", ".commission",
        "[class*='value']", "[class*='amount']", "[class*='balance']",
        "button", ".btn",
        "td", "th",
        ".card-value", ".stat-value"
      ];

      for (const sel of valueSelectors) {
        try {
          doc.querySelectorAll(sel).forEach((el) => {
            const text = el.textContent?.trim();
            if (text && text.length < 50 && text.length > 0) {
              let selector = sel;
              if ((el as HTMLElement).id) {
                selector = `#${(el as HTMLElement).id}`;
              } else if ((el as HTMLElement).className && typeof (el as HTMLElement).className === "string") {
                const classes = (el as HTMLElement).className.split(" ").filter(c => c && !c.includes(":"));
                if (classes.length > 0) {
                  selector = `.${classes[0]}`;
                }
              }

              if (!elements.some(e => e.selector === selector)) {
                elements.push({
                  selector,
                  text,
                  tagName: el.tagName.toLowerCase(),
                  rect: { x: 0, y: 0, width: 100, height: 30 }
                });
              }
            }
          });
        } catch {}
      }

      setDetectedElements(elements);

    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Sayfa yüklenemedi");
    } finally {
      setPageLoading(false);
    }
  }, [formData.name]);

  // Handle URL submit
  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (url) {
      let finalUrl = url;
      if (!url.startsWith("http")) {
        finalUrl = "https://" + url;
        setUrl(finalUrl);
      }
      loadPage(finalUrl);
    }
  };

  // Handle final submit
  const handleSubmit = async () => {
    if (!formData.name || !formData.loginUrl || !formData.elementSelector) {
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

  // Select element
  const handleSelectElement = (element: DetectedElement) => {
    setFormData(prev => ({
      ...prev,
      elementSelector: element.selector,
      targetUrl: currentUrl
    }));
    setSelectMode(false);
    toast.success(`Element seçildi: ${element.text.substring(0, 30)}...`);
  };

  // Steps info
  const steps = [
    { id: "browse", label: "Siteye Git", icon: Globe },
    { id: "login", label: "Giriş Bilgileri", icon: Lock },
    { id: "select", label: "Element Seç", icon: Target },
    { id: "confirm", label: "Onayla", icon: Check },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="p-4 pb-2 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-lg">
            {editPanel ? "Panel Düzenle" : "Yeni Panel Ekle"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Tarayıcı gibi siteye gidin, giriş bilgilerini girin ve izlenecek elementi seçin
          </DialogDescription>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-3">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (i <= currentStepIndex || pageHtml) setStep(s.id as Step);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    step === s.id
                      ? "bg-primary text-primary-foreground"
                      : i < currentStepIndex
                        ? "bg-green-500/20 text-green-400"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <s.icon className="h-3.5 w-3.5" />
                  {s.label}
                </button>
                {i < steps.length - 1 && (
                  <ArrowRight className="h-4 w-4 mx-1 text-muted-foreground/50" />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* Browser Bar */}
        <div className="px-4 py-2 border-b border-border/50 bg-secondary/30">
          <form onSubmit={handleUrlSubmit} className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => loadPage(currentUrl)}
              disabled={pageLoading || !currentUrl}
            >
              <RotateCcw className={`h-4 w-4 ${pageLoading ? "animate-spin" : ""}`} />
            </Button>

            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="https://partner.example.com/login adresini yazın..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-9 pr-4 h-9 bg-background"
              />
            </div>

            <Button type="submit" disabled={pageLoading || !url} className="h-9 px-4">
              {pageLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Git
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {/* Step: Browse */}
          {step === "browse" && (
            <div className="h-full flex">
              {/* Page Preview */}
              <div className="flex-1 bg-white overflow-auto">
                {pageLoading && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
                      <p className="text-muted-foreground">Sayfa yükleniyor...</p>
                    </div>
                  </div>
                )}

                {pageError && (
                  <div className="h-full flex items-center justify-center p-4">
                    <div className="text-center max-w-md">
                      <X className="h-10 w-10 mx-auto mb-2 text-red-400" />
                      <p className="text-red-400 font-medium">Sayfa yüklenemedi</p>
                      <p className="text-sm text-muted-foreground mt-1">{pageError}</p>
                    </div>
                  </div>
                )}

                {!pageLoading && !pageError && !pageHtml && (
                  <div className="h-full flex items-center justify-center p-4">
                    <div className="text-center max-w-md">
                      <Globe className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-lg font-medium">Panel URL'sini Girin</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Üstteki adres çubuğuna panelin giriş sayfasının adresini yazın
                      </p>
                    </div>
                  </div>
                )}

                {pageHtml && !pageLoading && (
                  <div
                    className="p-4 prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: pageHtml }}
                  />
                )}
              </div>

              {/* Sidebar - Detected Inputs */}
              {pageHtml && detectedInputs.length > 0 && (
                <div className="w-72 border-l border-border p-4 bg-background overflow-auto">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    Algılanan Giriş Alanları
                  </h4>
                  <div className="space-y-2">
                    {detectedInputs.map((input, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-lg bg-secondary/50 border border-border text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-[10px]">
                            {input.type}
                          </Badge>
                          <span className="text-muted-foreground">{input.name}</span>
                        </div>
                        <code className="text-[10px] text-muted-foreground block truncate">
                          {input.selector}
                        </code>
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full mt-4"
                    onClick={() => setStep("login")}
                  >
                    Devam Et
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step: Login */}
          {step === "login" && (
            <div className="h-full p-6 overflow-auto">
              <div className="max-w-md mx-auto space-y-6">
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex gap-2">
                    <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-amber-400 font-medium">Güvenlik</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Bilgileriniz şifreli olarak saklanır ve sadece otomatik giriş için kullanılır.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Panel Adı</Label>
                    <Input
                      placeholder="Örn: Esbet Affiliate"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>E-posta / Kullanıcı Adı</Label>
                    <Input
                      type="email"
                      placeholder="affiliate@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Şifre</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Kontrol Aralığı</Label>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: 15, label: "15sn" },
                        { value: 30, label: "30sn" },
                        { value: 60, label: "1dk" },
                        { value: 300, label: "5dk" },
                        { value: 600, label: "10dk" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, checkInterval: opt.value }))}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                            formData.checkInterval === opt.value
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary hover:bg-secondary/80"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setStep("browse")}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Geri
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => setStep("select")}
                    disabled={!formData.email || !formData.password}
                  >
                    Element Seçimine Git
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step: Select Element */}
          {step === "select" && (
            <div className="h-full flex">
              {/* Page with selectable elements */}
              <div className="flex-1 bg-white overflow-auto relative">
                {selectMode && (
                  <div className="absolute top-2 left-2 right-2 z-10 p-2 rounded-lg bg-primary text-primary-foreground text-sm text-center">
                    <Crosshair className="h-4 w-4 inline mr-2" />
                    Aşağıdaki listeden izlemek istediğiniz elementi seçin
                  </div>
                )}

                {pageHtml && (
                  <div
                    className="p-4 prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: pageHtml }}
                  />
                )}
              </div>

              {/* Element list */}
              <div className="w-80 border-l border-border bg-background flex flex-col">
                <div className="p-4 border-b border-border">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <MousePointer2 className="h-4 w-4 text-primary" />
                    Algılanan Elementler ({detectedElements.length})
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    İzlemek istediğiniz değeri içeren elementi seçin
                  </p>
                </div>

                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-2">
                    {detectedElements.slice(0, 30).map((el, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectElement(el)}
                        onMouseEnter={() => setHoveredElement(el.selector)}
                        onMouseLeave={() => setHoveredElement(null)}
                        className={`w-full p-3 rounded-lg border text-left transition-all ${
                          formData.elementSelector === el.selector
                            ? "bg-primary/10 border-primary"
                            : hoveredElement === el.selector
                              ? "bg-secondary border-primary/50"
                              : "bg-secondary/50 border-border hover:bg-secondary"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-[10px]">
                            {el.tagName}
                          </Badge>
                          {formData.elementSelector === el.selector && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{el.text}</p>
                        <code className="text-[10px] text-muted-foreground block truncate mt-1">
                          {el.selector}
                        </code>
                      </button>
                    ))}
                  </div>
                </ScrollArea>

                {/* Manual selector input */}
                <div className="p-4 border-t border-border space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Manuel CSS Seçici</Label>
                    <Input
                      placeholder=".commission-value"
                      value={formData.elementSelector}
                      onChange={(e) => setFormData(prev => ({ ...prev, elementSelector: e.target.value }))}
                      className="font-mono text-sm h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Değer Etiketi</Label>
                    <Input
                      placeholder="Komisyon"
                      value={formData.elementLabel}
                      onChange={(e) => setFormData(prev => ({ ...prev, elementLabel: e.target.value }))}
                      className="h-8"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStep("login")}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Geri
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => setStep("confirm")}
                      disabled={!formData.elementSelector}
                    >
                      Onayla
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step: Confirm */}
          {step === "confirm" && (
            <div className="h-full p-6 overflow-auto">
              <div className="max-w-lg mx-auto space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                    <Check className="h-8 w-8 text-green-500" />
                  </div>
                  <h3 className="text-xl font-semibold">Panel Hazır</h3>
                  <p className="text-muted-foreground mt-1">
                    Aşağıdaki bilgileri kontrol edin ve kaydedin
                  </p>
                </div>

                <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Panel Adı</span>
                    <span className="font-medium">{formData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Giriş URL</span>
                    <span className="font-mono text-sm truncate max-w-[200px]">{formData.loginUrl}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hedef URL</span>
                    <span className="font-mono text-sm truncate max-w-[200px]">{formData.targetUrl || currentUrl}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">E-posta</span>
                    <span>{formData.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Element</span>
                    <code className="text-sm bg-background px-2 py-0.5 rounded">{formData.elementSelector}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kontrol</span>
                    <span>{formData.checkInterval} saniye</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("select")}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Geri
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Kaydediliyor...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {editPanel ? "Güncelle" : "Paneli Kaydet"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
