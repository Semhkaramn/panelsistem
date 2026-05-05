import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendDailyReport, sendPanelChangeNotification, sendErrorNotification } from "@/lib/telegram";
import { scrapePanel } from "@/lib/scraper";

// This endpoint can be called by external cron services like cron-job.org
// or Netlify scheduled functions

function log(message: string): void {
  const timestamp = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
  });
  console.log(`[${timestamp}] ${message}`);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Simple auth check for external cron services
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "daily-report") {
      return await handleDailyReport();
    } else if (action === "check-panels") {
      return await handleCheckPanels();
    } else {
      return NextResponse.json({
        message: "Available actions: daily-report, check-panels",
        usage: "/api/cron?action=check-panels",
      });
    }
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron job failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // POST handler for webhook-style cron triggers
  return GET(request);
}

async function handleDailyReport() {
  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  if (!settings?.dailyReportEnabled) {
    return NextResponse.json({ message: "Daily report disabled" });
  }

  const panels = await prisma.panel.findMany({
    where: { isActive: true },
    select: { name: true, lastValue: true, status: true },
  });

  if (panels.length === 0) {
    return NextResponse.json({ message: "No active panels" });
  }

  const result = await sendDailyReport(panels);

  return NextResponse.json({
    success: result.success,
    panelCount: panels.length,
    timestamp: new Date().toISOString(),
  });
}

async function handleCheckPanels() {
  log("🚀 Panel kontrolü başlıyor...");

  const panels = await prisma.panel.findMany({
    where: { isActive: true },
  });

  log(`📊 ${panels.length} aktif panel bulundu`);

  const results = [];

  for (const panel of panels) {
    try {
      log(`📄 Kontrol ediliyor: ${panel.name}`);

      const scrapeResult = await scrapePanel(panel);

      if (scrapeResult.success && scrapeResult.value) {
        const newValue = scrapeResult.value;
        const oldValue = panel.lastValue;
        const valueChanged = oldValue !== null && oldValue !== newValue;

        // Update panel in database
        await prisma.panel.update({
          where: { id: panel.id },
          data: {
            lastValue: newValue,
            lastCheck: new Date(),
            lastError: null,
            status: "active",
          },
        });

        // If value changed, create history and send notification
        if (valueChanged) {
          log(`🚨 DEĞER DEĞİŞTİ! ${panel.name}: ${oldValue} → ${newValue}`);

          // Create history record
          await prisma.valueHistory.create({
            data: {
              panelId: panel.id,
              oldValue: oldValue,
              newValue: newValue,
            },
          });

          // Send Telegram notification
          await sendPanelChangeNotification(panel.name, oldValue, newValue);
        } else {
          log(`✅ ${panel.name}: ${newValue} (değişiklik yok)`);
        }

        results.push({
          panel: panel.name,
          success: true,
          changed: valueChanged,
          oldValue,
          newValue,
        });
      } else {
        log(`❌ Hata: ${panel.name} - ${scrapeResult.error}`);

        await prisma.panel.update({
          where: { id: panel.id },
          data: {
            lastError: scrapeResult.error || "Unknown error",
            lastCheck: new Date(),
            status: "error",
          },
        });

        // Send error notification
        await sendErrorNotification(panel.name, scrapeResult.error || "Bilinmeyen hata");

        results.push({
          panel: panel.name,
          success: false,
          error: scrapeResult.error,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      log(`❌ Beklenmeyen hata: ${panel.name} - ${errorMsg}`);

      results.push({
        panel: panel.name,
        success: false,
        error: errorMsg,
      });
    }
  }

  log(`✅ Panel kontrolü tamamlandı: ${results.filter(r => r.success).length}/${panels.length} başarılı`);

  return NextResponse.json({
    checked: panels.length,
    successful: results.filter(r => r.success).length,
    changed: results.filter(r => r.changed).length,
    results,
    timestamp: new Date().toISOString(),
  });
}
