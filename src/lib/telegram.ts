import prisma from "./db";

export interface TelegramMessage {
  text: string;
  parseMode?: "HTML" | "Markdown";
}

export async function getSettings() {
  let settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    settings = await prisma.settings.create({
      data: { id: "default" },
    });
  }

  return settings;
}

export async function sendTelegramMessage(
  message: string,
  options?: { token?: string; chatIds?: string[] }
) {
  const settings = await getSettings();
  const token = options?.token || settings.telegramToken;
  const chatIds = options?.chatIds || settings.telegramChatIds;

  if (!token) {
    console.error("Telegram bot token not configured");
    return { success: false, error: "Token not configured" };
  }

  if (!chatIds || chatIds.length === 0) {
    console.error("No Telegram chat IDs configured");
    return { success: false, error: "No chat IDs configured" };
  }

  const results: { chatId: string; success: boolean; error?: string }[] = [];

  for (const chatId of chatIds) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
          }),
        }
      );

      const data = await response.json();

      if (data.ok) {
        results.push({ chatId, success: true });
      } else {
        results.push({ chatId, success: false, error: data.description });
      }
    } catch (error) {
      results.push({
        chatId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const allSuccess = results.every((r) => r.success);
  return { success: allSuccess, results };
}

export async function sendPanelChangeNotification(
  panelName: string,
  oldValue: string | null,
  newValue: string
) {
  const timestamp = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
  });

  const message = `🔔 <b>DEĞER DEĞİŞTİ!</b>

📊 <b>Panel:</b> ${panelName}
📉 <b>Eski:</b> <code>${oldValue || "—"}</code>
📈 <b>Yeni:</b> <code>${newValue}</code>

🕐 ${timestamp}`;

  const result = await sendTelegramMessage(message);

  // Log notification
  await prisma.notificationLog.create({
    data: {
      panelName,
      type: "change",
      message,
      success: result.success,
      error: result.success ? null : JSON.stringify(result),
    },
  });

  return result;
}

export async function sendDailyReport(
  panels: { name: string; lastValue: string | null; status: string }[]
) {
  const timestamp = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
  });

  let message = `📊 <b>GÜNLÜK RAPOR</b>\n`;
  message += `🕐 ${timestamp}\n\n`;

  for (const panel of panels) {
    const statusEmoji =
      panel.status === "active"
        ? "✅"
        : panel.status === "error"
          ? "❌"
          : "⏸️";
    message += `${statusEmoji} <b>${panel.name}:</b> <code>${panel.lastValue || "—"}</code>\n`;
  }

  const result = await sendTelegramMessage(message);

  await prisma.notificationLog.create({
    data: {
      type: "daily_report",
      message,
      success: result.success,
      error: result.success ? null : JSON.stringify(result),
    },
  });

  return result;
}

export async function sendErrorNotification(panelName: string, error: string) {
  const timestamp = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
  });

  const message = `⚠️ <b>HATA!</b>

📊 <b>Panel:</b> ${panelName}
❌ <b>Hata:</b> ${error}

🕐 ${timestamp}`;

  const result = await sendTelegramMessage(message);

  await prisma.notificationLog.create({
    data: {
      panelName,
      type: "error",
      message,
      success: result.success,
      error: result.success ? null : JSON.stringify(result),
    },
  });

  return result;
}
