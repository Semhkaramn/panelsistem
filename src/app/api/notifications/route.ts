import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get("limit") || "50");
    const type = searchParams.get("type");

    const where = type ? { type } : {};

    const notifications = await prisma.notificationLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
