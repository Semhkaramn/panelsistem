import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const panelId = searchParams.get("panelId");
    const limit = Number.parseInt(searchParams.get("limit") || "100");

    const where = panelId ? { panelId } : {};

    const history = await prisma.valueHistory.findMany({
      where,
      orderBy: { changedAt: "desc" },
      take: limit,
      include: {
        panel: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
