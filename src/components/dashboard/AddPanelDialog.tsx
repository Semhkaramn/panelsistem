"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Save,
  ExternalLink
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

interface SelectedElement {
  selector: string;
  xpath: string;
  text: string;
  tagName: string;
  className: string;
  id: string;
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
  const [baseUrl, setBaseUrl] = useState("");

  // Element selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [hoveredSelector, setHoveredSelector] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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
        setPageError(null);
        setSelectedElement(null);
        setSelectMode(false);
        setStep("browse");
      }
    }
  }, [editPanel, open]);

  // Generate unique selector for element
  const generateSelector = useCallback((element: Element): string => {
    if (element.id) {
      return `#${element.id}`;
    }

    const tagName = element.tagName.toLowerCase();

    // Try class-based selector
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c && !c.includes(':'));
      if (classes.length > 0) {
        const classSelector = `.${classes[0]}`;
        // Check if unique
        const matches = document.querySelectorAll(classSelector);
        if (matches.length === 1) {
          return classSelector;
        }
      }
    }

    // Try nth-child
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      const parentSelector = generateSelector(parent);
      return `${parentSelector} > ${tagName}:nth-child(${index})`;
    }

    return tagName;
  }, []);

  // Generate XPath for element
  const generateXPath = useCallback((element: Element): string => {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    return '/' + parts.join('/');
  }, []);

  // Handle Ctrl+Click on content
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    if (!selectMode) return;

    // Check for Ctrl key
    if (!e.ctrlKey && !e.metaKey) {
      toast.info("Ctrl + Sol Tık ile element seçin", {
        description: "Ctrl tuşunu basılı tutarak istediğiniz elemente tıklayın"
      });
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const target = e.target as HTMLElement;

    // Don't select the container itself
    if (target === contentRef.current) return;

    const selector = generateSelector(target);
    const xpath = generateXPath(target);

    setSelectedElement({
      selector,
      xpath,
      text: target.textContent?.trim().substring(0, 100) || "",
      tagName: target.tagName.toLowerCase(),
      className: target.className || "",
      id: target.id || "",
    });

    setFormData(prev => ({
      ...prev,
      elementSelector: selector,
      targetUrl: currentUrl
    }));

    toast.success("Element seçildi!", {
      description: `${target.tagName.toLowerCase()}: ${target.textContent?.trim().substring(0, 30)}...`
    });
  }, [selectMode, currentUrl, generateSelector, generateXPath]);

  // Handle mouseover for highlight
  const handleContentMouseOver = useCallback((e: React.MouseEvent) => {
    if (!selectMode) return;

    const target = e.target as HTMLElement;
    if (target === contentRef.current) return;

    // Add highlight
    target.style.outline = "2px solid #f59e0b";
    target.style.outlineOffset = "2px";
    target.style.cursor = "crosshair";
  }, [selectMode]);

  const handleContentMouseOut = useCallback((e: React.MouseEvent) => {
    if (!selectMode) return;

    const target = e.target as HTMLElement;
    target.style.outline = "";
    target.style.outlineOffset = "";
    target.style.cursor = "";
  }, [selectMode]);

  // Load page via proxy
  const loadPage = useCallback(async (targetUrl: string) => {
    if (!targetUrl) {
      setPageError("URL gerekli");
      return;
    }

    setPageLoading(true);
    setPageError(null);
    setPageHtml(null);
    setSelectedElement(null);

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
      setBaseUrl(data.baseUrl);

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

    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Sayfa yüklenemedi");
    } finally {
      setPageLoading(false);
    }
  }, [formData.name]);

  // Handle URL submit
  const handleUrlSubmit = useCallback((e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (url) {
      let finalUrl = url;
      if (!url.startsWith("http")) {
        finalUrl = "https://" + url;
        setUrl(finalUrl);
      }
      loadPage(finalUrl);
    }
    return false;
  }, [url, loadPage]);

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
    } catch (err) {
      toast.error("İşlem başarısız oldu");
    } finally {
      setLoading(false);
    }
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
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="p-4 pb-2 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-lg">
            {editPanel ? "Panel Düzenle" : "Yeni Panel Ekle"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Siteye gidin, giriş bilgilerini girin ve <strong>Ctrl + Sol Tık</strong> ile izlenecek elementi seçin
          </DialogDescription>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-3">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
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
          <div className="flex items-center gap-2">
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
                placeholder="https://example.com/login yazın ve Enter'a basın..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleUrlSubmit();
                  }
                }}
                className="pl-9 pr-4 h-9 bg-background"
                autoComplete="off"
              />
            </div>

            <Button
              type="button"
              disabled={pageLoading || !url}
              className="h-9 px-4"
              onClick={() => handleUrlSubmit()}
            >
              {pageLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Git
                </>
              )}
            </Button>

            {currentUrl && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => window.open(currentUrl, '_blank')}
                title="Yeni sekmede aç"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Side - Page Content */}
          <div className="flex-1 overflow-auto bg-white relative">
            {pageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
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
                  <p className="text-xs text-muted-foreground mt-2">
                    Bazı siteler iframe/proxy'yi engeller. Siteyi yeni sekmede açıp manuel olarak CSS seçici girebilirsiniz.
                  </p>
                </div>
              </div>
            )}

            {!pageLoading && !pageError && !pageHtml && (
              <div className="h-full flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                  <Globe className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-lg font-medium">Panel URL'sini Girin</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Üstteki adres çubuğuna panelin giriş sayfasının adresini yazın ve Enter'a basın
                  </p>
                </div>
              </div>
            )}

            {pageHtml && !pageLoading && (
              <div className="relative">
                {/* Select Mode Banner */}
                {step === "select" && (
                  <div className="sticky top-0 left-0 right-0 z-20 p-2 bg-amber-500 text-black text-sm text-center font-medium">
                    <Crosshair className="h-4 w-4 inline mr-2" />
                    {selectMode
                      ? "Ctrl + Sol Tık ile izlemek istediğiniz elemente tıklayın"
                      : "'Element Seçim Modu' butonuna tıklayın"}
                  </div>
                )}

                {/* Page Content */}
                <div
                  ref={contentRef}
                  className={`p-4 ${selectMode ? 'select-none' : ''}`}
                  onClick={handleContentClick}
                  onMouseOver={handleContentMouseOver}
                  onMouseOut={handleContentMouseOut}
                  dangerouslySetInnerHTML={{ __html: pageHtml }}
                  style={{
                    pointerEvents: selectMode ? 'auto' : 'none',
                    userSelect: selectMode ? 'none' : 'auto'
                  }}
                />
              </div>
            )}
          </div>

          {/* Right Side - Panel */}
          <div className="w-80 border-l border-border bg-background flex flex-col overflow-hidden">
            {/* Step: Browse */}
            {step === "browse" && pageHtml && (
              <div className="p-4 space-y-4 overflow-auto flex-1">
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex gap-2">
                    <Check className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-green-400 font-medium">Sayfa Yüklendi</p>
                      <p className="text-xs text-muted-foreground mt-1 break-all">
                        {currentUrl}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => setStep("login")}
                >
                  Devam Et
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}

            {/* Step: Login */}
            {step === "login" && (
              <div className="p-4 space-y-4 overflow-auto flex-1">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="flex gap-2">
                    <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-amber-400 font-medium">Güvenlik</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Bilgileriniz şifreli olarak saklanır.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Panel Adı</Label>
                    <Input
                      placeholder="Örn: Esbet Affiliate"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">E-posta / Kullanıcı Adı</Label>
                    <Input
                      type="email"
                      placeholder="affiliate@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Şifre</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        className="pr-10 h-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Kontrol Aralığı</Label>
                    <div className="flex gap-1 flex-wrap">
                      {[
                        { value: 15, label: "15sn" },
                        { value: 30, label: "30sn" },
                        { value: 60, label: "1dk" },
                        { value: 300, label: "5dk" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, checkInterval: opt.value }))}
                          className={`px-2 py-1 rounded text-xs transition-all ${
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

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStep("browse")}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Geri
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => setStep("select")}
                  >
                    Element Seç
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step: Select Element */}
            {step === "select" && (
              <div className="p-4 space-y-4 overflow-auto flex-1">
                <Button
                  type="button"
                  className={`w-full ${selectMode ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                  onClick={() => setSelectMode(!selectMode)}
                >
                  <MousePointer2 className="h-4 w-4 mr-2" />
                  {selectMode ? "Seçim Modu Aktif" : "Element Seçim Modu"}
                </Button>

                <div className="p-3 bg-secondary/50 rounded-lg text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Nasıl Kullanılır:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>"Element Seçim Modu" butonuna tıklayın</li>
                    <li>Sayfada izlemek istediğiniz değerin üzerine gidin</li>
                    <li><strong>Ctrl + Sol Tık</strong> ile elementi seçin</li>
                  </ol>
                </div>

                {selectedElement && (
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      <span className="text-sm font-medium text-green-400">Element Seçildi</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <p><span className="text-muted-foreground">Tag:</span> {selectedElement.tagName}</p>
                      <p><span className="text-muted-foreground">Metin:</span> {selectedElement.text.substring(0, 50)}...</p>
                      <p className="break-all"><span className="text-muted-foreground">Seçici:</span> <code className="bg-background px-1 rounded">{selectedElement.selector}</code></p>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Manuel CSS Seçici</Label>
                  <Input
                    placeholder=".commission-value, #total-amount"
                    value={formData.elementSelector}
                    onChange={(e) => setFormData(prev => ({ ...prev, elementSelector: e.target.value }))}
                    className="font-mono text-xs h-8"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Değer Etiketi</Label>
                  <Input
                    placeholder="Komisyon"
                    value={formData.elementLabel}
                    onChange={(e) => setFormData(prev => ({ ...prev, elementLabel: e.target.value }))}
                    className="h-8"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectMode(false);
                      setStep("login");
                    }}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Geri
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectMode(false);
                      setStep("confirm");
                    }}
                    disabled={!formData.elementSelector}
                  >
                    Onayla
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step: Confirm */}
            {step === "confirm" && (
              <div className="p-4 space-y-4 overflow-auto flex-1">
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                    <Check className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold">Panel Hazır</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bilgileri kontrol edin ve kaydedin
                  </p>
                </div>

                <div className="space-y-2 p-3 rounded-lg bg-secondary/50 border border-border text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Panel Adı</span>
                    <span className="font-medium">{formData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">E-posta</span>
                    <span>{formData.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Element</span>
                    <code className="bg-background px-1 rounded text-[10px]">{formData.elementSelector}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kontrol</span>
                    <span>{formData.checkInterval} saniye</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStep("select")}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Geri
                  </Button>
                  <Button
                    type="button"
                    size="sm"
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
                        {editPanel ? "Güncelle" : "Kaydet"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Empty state for right panel */}
            {step === "browse" && !pageHtml && (
              <div className="p-4 flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Önce bir URL girin</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
