import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { scrapePanel } from "@/lib/scraper";
import { sendPanelChangeNotification } from "@/lib/telegram";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const panel = await prisma.panel.findUnique({
      where: { id },
    });

    if (!panel) {
      return NextResponse.json({ error: "Panel not found" }, { status: 404 });
    }

    // Scrape the panel
    const result = await scrapePanel(panel);

    if (!result.success) {
      // Update panel with error
      const updatedPanel = await prisma.panel.update({
        where: { id },
        data: {
          status: "error",
          lastError: result.error,
          lastCheck: new Date(),
        },
      });

      return NextResponse.json({ panel: updatedPanel, error: result.error });
    }

    const newValue = result.value || "";
    const oldValue = panel.lastValue;
    const valueChanged = oldValue !== null && oldValue !== newValue;

    // Update panel
    const updatedPanel = await prisma.panel.update({
      where: { id },
      data: {
        lastValue: newValue,
        lastCheck: new Date(),
        status: "active",
        lastError: null,
      },
    });

    // If value changed, create history record and send notification
    if (valueChanged) {
      await prisma.valueHistory.create({
        data: {
          panelId: id,
          oldValue,
          newValue,
        },
      });

      // Send Telegram notification
      await sendPanelChangeNotification(panel.name, oldValue, newValue);
    }

    return NextResponse.json({
      panel: updatedPanel,
      changed: valueChanged,
      oldValue,
      newValue,
    });
  } catch (error) {
    console.error("Failed to check panel:", error);
    return NextResponse.json({ error: "Failed to check panel" }, { status: 500 });
  }
}
