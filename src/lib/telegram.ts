import prisma from "./db";

export interface TelegramMessage {
  text: string;
  parseMode?: "HTML" | "Markdown";
}

// Environment variables as fallback
const ENV_TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ENV_TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS?.split(",").filter(Boolean) || [];

function log(message: string): void {
  const timestamp = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
  });
  console.log(`[${timestamp}] ${message}`);
}

export async function getSettings() {
  try {
    let settings = await prisma.settings.findUnique({
      where: { id: "default" },
    });

    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          id: "default",
          telegramToken: ENV_TELEGRAM_TOKEN || null,
          telegramChatIds: ENV_TELEGRAM_CHAT_IDS,
        },
      });
    }

    return settings;
  } catch (error) {
    // If database is not available, return env-based settings
    log("⚠️ Veritabanı bağlantısı yok, env değişkenleri kullanılıyor");
    return {
      id: "default",
      telegramToken: ENV_TELEGRAM_TOKEN || null,
      telegramChatIds: ENV_TELEGRAM_CHAT_IDS,
      dailyReportTime: "00:00",
      dailyReportEnabled: true,
      timezone: "Europe/Istanbul",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export async function sendTelegramMessage(
  message: string,
  options?: { token?: string; chatIds?: string[] }
) {
  const settings = await getSettings();

  // Use provided options, then settings, then env variables
  const token = options?.token || settings.telegramToken || ENV_TELEGRAM_TOKEN;
  const chatIds = options?.chatIds ||
    (settings.telegramChatIds.length > 0 ? settings.telegramChatIds : ENV_TELEGRAM_CHAT_IDS);

  if (!token) {
    log("❌ Telegram bot token ayarlanmamış!");
    return { success: false, error: "Token not configured" };
  }

  if (!chatIds || chatIds.length === 0) {
    log("❌ Telegram chat ID'leri ayarlanmamış!");
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
        log(`✅ Telegram gönderildi: ${chatId}`);
        results.push({ chatId, success: true });
      } else {
        log(`❌ Telegram hatası (${chatId}): ${data.description}`);
        results.push({ chatId, success: false, error: data.description });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      log(`❌ Telegram hatası (${chatId}): ${errorMsg}`);
      results.push({
        chatId,
        success: false,
        error: errorMsg,
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

  log(`🚨 Değer değişti! ${panelName}: ${oldValue} → ${newValue}`);

  const result = await sendTelegramMessage(message);

  // Log notification to database
  try {
    await prisma.notificationLog.create({
      data: {
        panelName,
        type: "change",
        message,
        success: result.success,
        error: result.success ? null : JSON.stringify(result),
      },
    });
  } catch (error) {
    log("⚠️ Bildirim log kaydedilemedi");
  }

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

  try {
    await prisma.notificationLog.create({
      data: {
        type: "daily_report",
        message,
        success: result.success,
        error: result.success ? null : JSON.stringify(result),
      },
    });
  } catch (error) {
    log("⚠️ Rapor log kaydedilemedi");
  }

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

  log(`❌ Hata bildirimi: ${panelName} - ${error}`);

  const result = await sendTelegramMessage(message);

  try {
    await prisma.notificationLog.create({
      data: {
        panelName,
        type: "error",
        message,
        success: result.success,
        error: result.success ? null : JSON.stringify(result),
      },
    });
  } catch (error) {
    log("⚠️ Hata log kaydedilemedi");
  }

  return result;
}

// Test telegram connection
export async function testTelegramConnection(token?: string, chatIds?: string[]) {
  const message = `🔔 <b>Test Bildirimi</b>

✅ Telegram bağlantısı başarılı!
🕐 ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`;

  return await sendTelegramMessage(message, { token, chatIds });
}
