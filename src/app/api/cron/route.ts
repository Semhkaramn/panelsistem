import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendDailyReport } from "@/lib/telegram";
import { scrapePanel } from "@/lib/scraper";

// This endpoint can be called by external cron services like cron-job.org
// or Netlify scheduled functions

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
        usage: "/api/cron?action=daily-report",
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
  const panels = await prisma.panel.findMany({
    where: { isActive: true },
  });

  const results = [];

  for (const panel of panels) {
    try {
      const scrapeResult = await scrapePanel(panel);

      if (scrapeResult.success && scrapeResult.value) {
        const valueChanged = panel.lastValue !== scrapeResult.value;

        await prisma.panel.update({
          where: { id: panel.id },
          data: {
            lastValue: scrapeResult.value,
            lastCheck: new Date(),
            lastError: null,
            status: "active",
          },
        });

        if (valueChanged && panel.lastValue) {
          await prisma.valueHistory.create({
            data: {
              panelId: panel.id,
              oldValue: panel.lastValue,
              newValue: scrapeResult.value,
            },
          });
        }

        results.push({
          panel: panel.name,
          success: true,
          changed: valueChanged,
          value: scrapeResult.value,
        });
      } else {
        await prisma.panel.update({
          where: { id: panel.id },
          data: {
            lastError: scrapeResult.error || "Unknown error",
            lastCheck: new Date(),
            status: "error",
          },
        });

        results.push({
          panel: panel.name,
          success: false,
          error: scrapeResult.error,
        });
      }
    } catch (error) {
      results.push({
        panel: panel.name,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    checked: panels.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
