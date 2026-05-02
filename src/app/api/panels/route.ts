import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const panels = await prisma.panel.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ panels });
  } catch (error) {
    console.error("Failed to fetch panels:", error);
    return NextResponse.json({ error: "Failed to fetch panels" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, loginUrl, targetUrl, email, password, elementSelector, elementLabel, checkInterval } = body;

    if (!name || !loginUrl || !targetUrl || !email || !password || !elementSelector) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const panel = await prisma.panel.create({
      data: {
        name,
        loginUrl,
        targetUrl,
        email,
        password,
        elementSelector,
        elementLabel: elementLabel || "Değer",
        checkInterval: checkInterval || 30,
        isActive: true,
        status: "pending",
      },
    });

    return NextResponse.json({ panel });
  } catch (error) {
    console.error("Failed to create panel:", error);
    return NextResponse.json({ error: "Failed to create panel" }, { status: 500 });
  }
}
