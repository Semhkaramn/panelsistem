import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    let settings = await prisma.settings.findUnique({
      where: { id: "default" },
    });

    if (!settings) {
      settings = await prisma.settings.create({
        data: { id: "default" },
      });
    }

    // Mask the token for security
    const maskedSettings = {
      ...settings,
      telegramToken: settings.telegramToken
        ? `${settings.telegramToken.slice(0, 10)}...${settings.telegramToken.slice(-5)}`
        : null,
      hasToken: !!settings.telegramToken,
    };

    return NextResponse.json({ settings: maskedSettings });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { telegramToken, telegramChatIds, dailyReportTime, dailyReportEnabled, timezone } = body;

    const updateData: Record<string, unknown> = {};

    if (telegramToken !== undefined) updateData.telegramToken = telegramToken;
    if (telegramChatIds !== undefined) updateData.telegramChatIds = telegramChatIds;
    if (dailyReportTime !== undefined) updateData.dailyReportTime = dailyReportTime;
    if (dailyReportEnabled !== undefined) updateData.dailyReportEnabled = dailyReportEnabled;
    if (timezone !== undefined) updateData.timezone = timezone;

    const settings = await prisma.settings.upsert({
      where: { id: "default" },
      create: { id: "default", ...updateData },
      update: updateData,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
