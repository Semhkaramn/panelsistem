import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const panel = await prisma.panel.findUnique({
      where: { id },
      include: {
        values: {
          orderBy: { changedAt: "desc" },
          take: 50,
        },
      },
    });

    if (!panel) {
      return NextResponse.json({ error: "Panel not found" }, { status: 404 });
    }

    return NextResponse.json({ panel });
  } catch (error) {
    console.error("Failed to fetch panel:", error);
    return NextResponse.json({ error: "Failed to fetch panel" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const panel = await prisma.panel.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ panel });
  } catch (error) {
    console.error("Failed to update panel:", error);
    return NextResponse.json({ error: "Failed to update panel" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.panel.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete panel:", error);
    return NextResponse.json({ error: "Failed to delete panel" }, { status: 500 });
  }
}
