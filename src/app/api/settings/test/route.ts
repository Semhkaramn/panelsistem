import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";
import prisma from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, chatId } = body;

    if (!token || !chatId) {
      return NextResponse.json({ error: "Token and Chat ID required" }, { status: 400 });
    }

    const testMessage = `✅ <b>Panel Monitor Bağlantı Testi</b>

Bu mesajı görüyorsanız Telegram bildirimleri düzgün çalışıyor!

🕐 ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`;

    const result = await sendTelegramMessage(testMessage, {
      token,
      chatIds: [chatId],
    });

    if (result.success) {
      // Save to settings if test is successful
      await prisma.settings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          telegramToken: token,
          telegramChatIds: [chatId],
        },
        update: {
          telegramToken: token,
          telegramChatIds: {
            push: chatId,
          },
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to test Telegram:", error);
    return NextResponse.json({ error: "Failed to test Telegram" }, { status: 500 });
  }
}
