"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Home,
  Loader2,
  MousePointer2,
  Eye,
  EyeOff,
  Save,
  Check,
  X,
  Crosshair,
  LogIn,
  ChevronLeft,
  Settings,
  Zap,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import Link from "next/link";

interface PageInfo {
  title: string;
  url: string;
  hasLoginForm: boolean;
}

interface SelectedElement {
  selector: string;
  text: string;
  tagName: string;
}

export default function BrowserPage() {
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Login state
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Element selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [panelName, setPanelName] = useState("");
  const [elementLabel, setElementLabel] = useState("Komisyon");
  const [checkInterval, setCheckInterval] = useState(30);

  const imageRef = useRef<HTMLImageElement>(null);

  // Navigate to URL
  const navigateTo = useCallback(async (targetUrl: string) => {
    if (!targetUrl) return;

    let finalUrl = targetUrl;
    if (!targetUrl.startsWith("http")) {
      finalUrl = "https://" + targetUrl;
    }

    setLoading(true);
    setUrl(finalUrl);

    try {
      const response = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "navigate",
          url: finalUrl,
          sessionId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setScreenshot(data.screenshot);
        setPageInfo(data.pageInfo);
        setCurrentUrl(data.currentUrl);

        // Update history
        const newHistory = [...history.slice(0, historyIndex + 1), finalUrl];
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);

        // Auto-detect panel name
        try {
          const urlObj = new URL(finalUrl);
          const hostname = urlObj.hostname.replace("www.", "");
          const siteName = hostname.split(".")[0];
          if (!panelName) {
            setPanelName(siteName.charAt(0).toUpperCase() + siteName.slice(1) + " Panel");
          }
        } catch {}

        // Show login panel if login form detected
        if (data.pageInfo?.hasLoginForm) {
          setShowLoginPanel(true);
          toast.info("Giriş formu tespit edildi", {
            description: "Sağ panelden giriş bilgilerinizi girin",
          });
        }
      } else {
        toast.error("Sayfa yüklenemedi", { description: data.error });
      }
    } catch (error) {
      toast.error("Bağlantı hatası", {
        description: error instanceof Error ? error.message : "Bilinmeyen hata",
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId, history, historyIndex, panelName]);

  // Handle URL submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(url);
  };

  // Go back
  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      navigateTo(history[newIndex]);
    }
  };

  // Go forward
  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      navigateTo(history[newIndex]);
    }
  };

  // Refresh
  const refresh = () => {
    if (currentUrl) {
      navigateTo(currentUrl);
    }
  };

  // Perform login
  const handleLogin = async () => {
    if (!email || !password) {
      toast.error("Email ve şifre gerekli");
      return;
    }

    setLoginLoading(true);

    try {
      const response = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          credentials: { email, password },
          sessionId,
        }),
      });

      const data = await response.json();

      if (data.screenshot) {
        setScreenshot(data.screenshot);
      }

      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      if (data.currentUrl) {
        setCurrentUrl(data.currentUrl);
      }

      if (data.success) {
        setIsLoggedIn(true);
        setShowLoginPanel(false);
        toast.success("Giriş başarılı!", {
          description: "Artık element seçebilirsiniz",
        });
      } else {
        toast.warning(data.message || "Giriş yapılamadı", {
          description: "Bilgilerinizi kontrol edin",
        });
      }
    } catch (error) {
      toast.error("Giriş hatası");
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle image click for element selection
  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!selectMode || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setLoading(true);

    try {
      // Click on the page
      const clickResponse = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "click",
          x,
          y,
          sessionId,
        }),
      });

      const clickData = await clickResponse.json();

      if (clickData.screenshot) {
        setScreenshot(clickData.screenshot);
      }

      // Get element at position
      const elemResponse = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "getElements",
          sessionId,
        }),
      });

      const elemData = await elemResponse.json();

      if (elemData.elements && elemData.elements.length > 0) {
        // Find closest element to click position
        let closest = elemData.elements[0];
        let minDist = Infinity;

        for (const el of elemData.elements) {
          const centerX = el.rect.x + el.rect.width / 2;
          const centerY = el.rect.y + el.rect.height / 2;
          const dist = Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2);

          if (dist < minDist) {
            minDist = dist;
            closest = el;
          }
        }

        setSelectedElement({
          selector: closest.selector,
          text: closest.text,
          tagName: closest.tagName,
        });

        toast.success("Element seçildi", {
          description: `${closest.tagName}: ${closest.text.substring(0, 30)}...`,
        });
      }
    } catch (error) {
      console.error("Click error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Save panel
  const handleSavePanel = async () => {
    if (!panelName || !currentUrl || !selectedElement) {
      toast.error("Tüm bilgileri doldurun");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/panels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: panelName,
          loginUrl: history[0] || currentUrl,
          targetUrl: currentUrl,
          email,
          password,
          elementSelector: selectedElement.selector,
          elementLabel,
          checkInterval,
          isActive: true,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Panel kaydedildi!", {
          description: `${panelName} başarıyla oluşturuldu`,
        });

        // Reset form
        setSelectedElement(null);
        setSelectMode(false);
      } else {
        toast.error("Kaydetme hatası", { description: data.error });
      }
    } catch (error) {
      toast.error("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white overflow-hidden">
      <Toaster position="top-center" theme="dark" />

      {/* Top Bar */}
      <div className="flex items-center gap-2 p-2 bg-zinc-900 border-b border-zinc-800">
        {/* Back to Dashboard */}
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-white">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>

        {/* Navigation Buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-zinc-400 hover:text-white"
            onClick={goBack}
            disabled={historyIndex <= 0 || loading}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-zinc-400 hover:text-white"
            onClick={goForward}
            disabled={historyIndex >= history.length - 1 || loading}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-zinc-400 hover:text-white"
            onClick={refresh}
            disabled={!currentUrl || loading}
          >
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* URL Bar */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Site adresini girin... (örn: panel.site.com)"
              className="pl-10 h-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-amber-500 focus:ring-amber-500/20"
            />
          </div>
          <Button
            type="submit"
            disabled={loading || !url}
            className="h-10 px-6 bg-amber-500 hover:bg-amber-600 text-black font-medium"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Git"}
          </Button>
        </form>

        {/* Status Badges */}
        <div className="flex items-center gap-2">
          {isLoggedIn && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              <Check className="h-3 w-3 mr-1" />
              Giriş Yapıldı
            </Badge>
          )}
          {selectMode && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse">
              <Crosshair className="h-3 w-3 mr-1" />
              Seçim Modu
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {pageInfo?.hasLoginForm && !isLoggedIn && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLoginPanel(!showLoginPanel)}
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
            >
              <LogIn className="h-4 w-4 mr-1" />
              Giriş Yap
            </Button>
          )}

          {screenshot && (
            <Button
              variant={selectMode ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectMode(!selectMode)}
              className={selectMode ? "bg-amber-500 text-black hover:bg-amber-600" : "border-zinc-700"}
            >
              <MousePointer2 className="h-4 w-4 mr-1" />
              Element Seç
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Browser View */}
        <div className="flex-1 overflow-auto bg-zinc-900 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-10">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3 text-amber-500" />
                <p className="text-zinc-400">Sayfa yükleniyor...</p>
              </div>
            </div>
          )}

          {!screenshot && !loading && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md px-4">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mx-auto mb-6">
                  <Globe className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Panel Tarayıcısı</h2>
                <p className="text-zinc-400 mb-6">
                  Yukarıdaki adres çubuğuna izlemek istediğiniz panelin adresini girin.
                  Giriş yapın ve takip etmek istediğiniz değeri seçin.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Badge variant="outline" className="text-zinc-400">1. URL Girin</Badge>
                  <Badge variant="outline" className="text-zinc-400">2. Giriş Yapın</Badge>
                  <Badge variant="outline" className="text-zinc-400">3. Element Seçin</Badge>
                  <Badge variant="outline" className="text-zinc-400">4. Kaydedin</Badge>
                </div>
              </div>
            </div>
          )}

          {screenshot && (
            <div className="relative">
              {selectMode && (
                <div className="absolute top-0 left-0 right-0 z-10 p-2 bg-amber-500 text-black text-sm text-center font-medium">
                  <Crosshair className="h-4 w-4 inline mr-2" />
                  Takip etmek istediğiniz değere tıklayın
                </div>
              )}
              <img
                ref={imageRef}
                src={screenshot}
                alt="Page screenshot"
                className={`w-full h-auto ${selectMode ? "cursor-crosshair" : ""}`}
                onClick={handleImageClick}
                style={{ marginTop: selectMode ? "36px" : "0" }}
              />
            </div>
          )}
        </div>

        {/* Right Panel */}
        {(showLoginPanel || selectedElement) && (
          <div className="w-80 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
            {/* Login Panel */}
            {showLoginPanel && !isLoggedIn && (
              <div className="p-4 space-y-4 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <LogIn className="h-4 w-4 text-amber-500" />
                    Giriş Bilgileri
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setShowLoginPanel(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Email / Kullanıcı Adı</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="h-9 bg-zinc-800 border-zinc-700"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Şifre</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-9 pr-10 bg-zinc-800 border-zinc-700"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    onClick={handleLogin}
                    disabled={loginLoading || !email || !password}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                  >
                    {loginLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <LogIn className="h-4 w-4 mr-2" />
                    )}
                    Giriş Yap
                  </Button>
                </div>

                <p className="text-xs text-zinc-500 text-center">
                  Bilgileriniz güvenli şekilde saklanacak
                </p>
              </div>
            )}

            {/* Selected Element Panel */}
            {selectedElement && (
              <div className="p-4 space-y-4 flex-1 overflow-auto">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Check className="h-4 w-4 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Element Seçildi</h3>
                    <p className="text-xs text-zinc-400">{selectedElement.tagName}</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                  <p className="text-sm font-medium mb-1">Değer:</p>
                  <p className="text-amber-400 font-mono">{selectedElement.text}</p>
                  <p className="text-xs text-zinc-500 mt-2 break-all">
                    Seçici: <code>{selectedElement.selector}</code>
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Panel Adı</Label>
                    <Input
                      value={panelName}
                      onChange={(e) => setPanelName(e.target.value)}
                      placeholder="Örn: Esbet Panel"
                      className="h-9 bg-zinc-800 border-zinc-700"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Değer Etiketi</Label>
                    <Input
                      value={elementLabel}
                      onChange={(e) => setElementLabel(e.target.value)}
                      placeholder="Komisyon"
                      className="h-9 bg-zinc-800 border-zinc-700"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Kontrol Aralığı</Label>
                    <div className="flex gap-1">
                      {[15, 30, 60, 300].map((val) => (
                        <button
                          key={val}
                          onClick={() => setCheckInterval(val)}
                          className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
                            checkInterval === val
                              ? "bg-amber-500 text-black"
                              : "bg-zinc-800 hover:bg-zinc-700"
                          }`}
                        >
                          {val < 60 ? `${val}sn` : `${val / 60}dk`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleSavePanel}
                  disabled={loading || !panelName || !selectedElement}
                  className="w-full bg-green-500 hover:bg-green-600 text-white"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Paneli Kaydet
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          {currentUrl && (
            <span className="truncate max-w-md">{currentUrl}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {pageInfo && (
            <span>{pageInfo.title}</span>
          )}
          <span>Panel Sistemi v2.0</span>
        </div>
      </div>
    </div>
  );
}
