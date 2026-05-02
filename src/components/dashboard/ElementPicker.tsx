"use client";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  MousePointer2,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Code,
  Target,
} from "lucide-react";
import { toast } from "sonner";

interface ElementPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectElement: (selector: string, preview: string) => void;
  initialUrl?: string;
}

interface DetectedElement {
  selector: string;
  text: string;
  tagName: string;
  className: string;
  id: string;
}

export function ElementPicker({
  open,
  onOpenChange,
  onSelectElement,
  initialUrl = "",
}: ElementPickerProps) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectedElements, setDetectedElements] = useState<DetectedElement[]>([]);
  const [selectedSelector, setSelectedSelector] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadPage = async () => {
    if (!url) {
      setError("URL gerekli");
      return;
    }

    setLoading(true);
    setError(null);
    setHtml(null);
    setDetectedElements([]);

    try {
      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load page");
      }

      setHtml(data.html);

      // Detect potential value elements
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.html, "text/html");

      const elements: DetectedElement[] = [];

      // Common selectors for values/amounts
      const selectors = [
        // Table totals
        "tr.total td",
        "tr.total_amounts td",
        "tfoot td",
        ".total-row td",
        // Buttons with values
        "button.btn-primary",
        "button.btn-success",
        // Value containers
        ".commission",
        ".balance",
        ".amount",
        ".value",
        ".earning",
        ".revenue",
        "[class*='commission']",
        "[class*='balance']",
        "[class*='amount']",
        "[class*='total']",
        // Dashboard cards
        ".card-value",
        ".stat-value",
        ".metric-value",
        ".card .value",
        ".card h2",
        ".card h3",
        // Generic
        "h1",
        "h2",
        ".number",
        ".currency",
      ];

      for (const selector of selectors) {
        try {
          const els = doc.querySelectorAll(selector);
          els.forEach((el) => {
            const text = el.textContent?.trim();
            if (text && text.length < 100 && /[\d.,]+/.test(text)) {
              // Generate a more specific selector
              let specificSelector = selector;

              if (el.id) {
                specificSelector = `#${el.id}`;
              } else if (el.className && typeof el.className === "string") {
                const classes = el.className.split(" ").filter((c) => c);
                if (classes.length > 0) {
                  specificSelector = `.${classes.join(".")}`;
                }
              }

              // Avoid duplicates
              if (!elements.some((e) => e.text === text && e.selector === specificSelector)) {
                elements.push({
                  selector: specificSelector,
                  text,
                  tagName: el.tagName.toLowerCase(),
                  className: typeof el.className === "string" ? el.className : "",
                  id: el.id || "",
                });
              }
            }
          });
        } catch {
          // Invalid selector, skip
        }
      }

      setDetectedElements(elements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load page");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectElement = (element: DetectedElement) => {
    setSelectedSelector(element.selector);
  };

  const handleConfirm = () => {
    if (selectedSelector) {
      const element = detectedElements.find((e) => e.selector === selectedSelector);
      onSelectElement(selectedSelector, element?.text || "");
      onOpenChange(false);
      toast.success("Element seçildi");
    }
  };

  const handleCopy = useCallback(async () => {
    if (selectedSelector) {
      await navigator.clipboard.writeText(selectedSelector);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [selectedSelector]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MousePointer2 className="h-5 w-5 text-primary" />
            Element Seçici
          </DialogTitle>
          <DialogDescription>
            Hedef sayfadan izlenecek elementi seçin. Sistem değeri içeren elementleri otomatik
            algılar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden">
          {/* URL Input */}
          <div className="flex gap-2">
            <Input
              placeholder="https://partner.example.com/reports"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button onClick={loadPage} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Yükleniyor
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Yükle
                </>
              )}
            </Button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Content */}
          {html && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
              {/* Detected Elements */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Algılanan Elementler ({detectedElements.length})
                </h4>

                <ScrollArea className="h-[350px] pr-4">
                  {detectedElements.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Code className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Değer içeren element bulunamadı</p>
                      <p className="text-xs mt-1">Manuel olarak CSS seçici girin</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {detectedElements.map((element, index) => (
                        <button
                          key={`${element.selector}-${index}`}
                          type="button"
                          className={`w-full p-3 rounded-lg border text-left transition-all ${
                            selectedSelector === element.selector
                              ? "bg-primary/10 border-primary"
                              : "bg-secondary/50 border-border hover:bg-secondary"
                          }`}
                          onClick={() => handleSelectElement(element)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="text-xs">
                              {element.tagName}
                            </Badge>
                            <span className="text-lg font-mono font-bold text-primary">
                              {element.text}
                            </span>
                          </div>
                          <code className="text-xs text-muted-foreground block truncate">
                            {element.selector}
                          </code>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Selected Element */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Seçilen Element</h4>

                <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                  {selectedSelector ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">CSS Seçici:</span>
                        <Button variant="ghost" size="sm" onClick={handleCopy}>
                          {copied ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <code className="block p-2 rounded bg-background text-sm font-mono break-all">
                        {selectedSelector}
                      </code>

                      {detectedElements.find((e) => e.selector === selectedSelector) && (
                        <div className="pt-2 border-t border-border">
                          <span className="text-sm text-muted-foreground">Önizleme:</span>
                          <div className="mt-1 p-3 rounded-lg bg-primary/10 border border-primary/30">
                            <span className="text-xl font-mono font-bold text-primary">
                              {detectedElements.find((e) => e.selector === selectedSelector)?.text}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <MousePointer2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Bir element seçin</p>
                    </div>
                  )}
                </div>

                {/* Manual Input */}
                <div className="space-y-2 pt-4">
                  <span className="text-sm text-muted-foreground">veya manuel girin:</span>
                  <Input
                    placeholder="tr.total_amounts td button.btn-primary"
                    value={selectedSelector}
                    onChange={(e) => setSelectedSelector(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Initial State */}
          {!html && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MousePointer2 className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-center">
                Hedef sayfanın URL'sini girin ve "Yükle" butonuna tıklayın.
                <br />
                <span className="text-sm">
                  Sistem sayfadaki değer içeren elementleri otomatik algılayacak.
                </span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedSelector}>
            Seç ve Uygula
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
