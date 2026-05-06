import type { Panel } from "@prisma/client";
import puppeteer, { type Browser, type Page, type Cookie } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import * as fs from "fs";

interface ScrapeResult {
  success: boolean;
  value?: string;
  error?: string;
  screenshot?: string;
}

// Cookie storage in memory (per panel)
const cookieStore: Map<string, Cookie[]> = new Map();

// Browser instance (reusable)
let browserInstance: Browser | null = null;

async function getExecutablePath(): Promise<string | null> {
  // Check environment variable first
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  // Try @sparticuz/chromium (for serverless environments)
  try {
    const chromiumPath = await chromium.executablePath();
    if (chromiumPath && fs.existsSync(chromiumPath)) {
      return chromiumPath;
    }
  } catch (e) {
    console.log("@sparticuz/chromium not available, trying fallback paths...");
  }

  // Fallback paths for different systems
  const possiblePaths = [
    // Linux
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];

  for (const path of possiblePaths) {
    try {
      if (fs.existsSync(path)) {
        return path;
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  console.log("🌐 Tarayıcı başlatılıyor...");

  const executablePath = await getExecutablePath();

  // Common launch args
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    "--window-size=1920,1080",
  ];

  // If we have an executable path, use it
  if (executablePath) {
    console.log(`✅ Chrome bulundu: ${executablePath}`);
    browserInstance = await puppeteer.launch({
      executablePath,
      headless: true,
      args: launchArgs,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    });
  } else {
    // Try using channel as fallback (finds system Chrome)
    console.log("🔍 Sistem Chrome aranıyor (channel: chrome)...");
    try {
      browserInstance = await puppeteer.launch({
        channel: "chrome",
        headless: true,
        args: launchArgs,
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
      });
    } catch (channelError) {
      throw new Error(
        "Chrome/Chromium bulunamadı. Lütfen Chrome yükleyin veya CHROME_PATH environment variable ayarlayın. " +
        "Alternatif olarak 'puppeteer' paketini kullanabilirsiniz (puppeteer-core yerine)."
      );
    }
  }

  console.log("✅ Tarayıcı başlatıldı");
  return browserInstance;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
  const timestamp = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
  });
  console.log(`[${timestamp}] ${message}`);
}

async function isLoginPage(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  return url.includes("login") || url.includes("auth");
}

async function performLogin(page: Page, panel: Panel): Promise<boolean> {
  log(`🔐 Giriş yapılıyor: ${panel.name}`);

  try {
    // Navigate to login page
    await page.goto(panel.loginUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await delay(3000);

    // Find and fill email input
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[id*="email"]',
      'input.form-control[type="email"]',
    ];

    let emailFilled = false;
    for (const selector of emailSelectors) {
      try {
        const emailInput = await page.$(selector);
        if (emailInput) {
          await page.evaluate(
            (el, value) => {
              (el as HTMLInputElement).value = value;
              el.dispatchEvent(new Event("input", { bubbles: true }));
            },
            emailInput,
            panel.email
          );
          emailFilled = true;
          log(`✅ Email girildi: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!emailFilled) {
      log("❌ Email input bulunamadı");
      return false;
    }

    // Find and fill password input
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input.form-control[type="password"]',
    ];

    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      try {
        const passwordInput = await page.$(selector);
        if (passwordInput) {
          await page.evaluate(
            (el, value) => {
              (el as HTMLInputElement).value = value;
              el.dispatchEvent(new Event("input", { bubbles: true }));
            },
            passwordInput,
            panel.password
          );
          passwordFilled = true;
          log(`✅ Şifre girildi: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!passwordFilled) {
      log("❌ Password input bulunamadı");
      return false;
    }

    await delay(500);

    // Find and click submit button
    const submitSelectors = [
      'button[type="submit"]',
      'button.btn-primary[type="submit"]',
      'input[type="submit"]',
      'button:contains("Giriş")',
      'button:contains("Login")',
    ];

    for (const selector of submitSelectors) {
      try {
        const submitBtn = await page.$(selector);
        if (submitBtn) {
          await page.evaluate((el) => (el as HTMLElement).click(), submitBtn);
          log(`✅ Giriş butonuna tıklandı: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // Wait for navigation
    await delay(3000);

    // Check if login was successful
    const isStillLoginPage = await isLoginPage(page);
    if (isStillLoginPage) {
      log("❌ Giriş başarısız - hala login sayfasında");
      return false;
    }

    // Save cookies
    const cookies = await page.cookies();
    cookieStore.set(panel.id, cookies);
    log(`💾 Çerezler kaydedildi: ${cookies.length} adet`);

    log("✅ Giriş başarılı!");
    return true;
  } catch (error) {
    log(`❌ Giriş hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`);
    return false;
  }
}

async function loadCookies(page: Page, panelId: string): Promise<boolean> {
  const cookies = cookieStore.get(panelId);
  if (!cookies || cookies.length === 0) {
    return false;
  }

  try {
    await page.setCookie(...cookies);
    log(`📂 Çerezler yüklendi: ${cookies.length} adet`);
    return true;
  } catch (error) {
    log(`⚠️ Çerez yükleme hatası: ${error}`);
    return false;
  }
}

async function extractValue(page: Page, selector: string): Promise<string | null> {
  try {
    // Wait for element
    await page.waitForSelector(selector, { timeout: 15000 });

    // Get text content
    const value = await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) return null;
      return element.textContent?.trim() || null;
    }, selector);

    return value;
  } catch (error) {
    log(`⚠️ Element bulunamadı: ${selector}`);
    return null;
  }
}

export async function scrapePanel(panel: Panel): Promise<ScrapeResult> {
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Load existing cookies if available
    await loadCookies(page, panel.id);

    log(`📄 Hedef sayfaya gidiliyor: ${panel.name}`);

    // Navigate to target page
    await page.goto(panel.targetUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await delay(3000);

    // Check if redirected to login page
    if (await isLoginPage(page)) {
      log("🔄 Oturum süresi dolmuş, tekrar giriş yapılıyor...");

      const loginSuccess = await performLogin(page, panel);
      if (!loginSuccess) {
        return { success: false, error: "Giriş yapılamadı" };
      }

      // Navigate to target page again
      await page.goto(panel.targetUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      await delay(3000);
    }

    // Extract value using the panel's selector
    const value = await extractValue(page, panel.elementSelector);

    if (value === null) {
      // Try alternative selectors
      const alternativeSelectors = [
        "tr.total_amounts button.btn-primary",
        "tr.total_amounts td button",
        ".total-row .value",
        "table.table-hover tr.total_amounts button",
      ];

      for (const altSelector of alternativeSelectors) {
        const altValue = await extractValue(page, altSelector);
        if (altValue) {
          log(`💰 Değer bulundu (alternatif): ${altValue}`);
          return { success: true, value: altValue };
        }
      }

      return { success: false, error: "Element bulunamadı" };
    }

    log(`💰 Değer: ${value}`);
    return { success: true, value };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Bilinmeyen hata";
    log(`❌ Scraping hatası: ${errorMessage}`);
    return { success: false, error: errorMessage };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

// Close browser when needed
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    log("🛑 Tarayıcı kapatıldı");
  }
}

// Auto-detect common element selectors
export function suggestSelectors(): string[] {
  return [
    // Tables with totals
    "tr.total_amounts button.btn-primary",
    "tr.total_amounts td:last-child",
    "tr.total td",
    ".total-row td",
    "tfoot td",

    // Buttons with values
    "button.btn-primary",
    ".commission-value",
    ".balance-value",
    ".amount",

    // Dashboard cards
    ".card-value",
    ".stat-value",
    ".metric-value",
    '[class*="balance"]',
    '[class*="commission"]',
    '[class*="earning"]',
    '[class*="revenue"]',

    // Generic value containers
    ".value",
    ".number",
    ".currency",
  ];
}

export function parseSelector(selector: string): { type: string; value: string } {
  if (selector.startsWith("#")) {
    return { type: "id", value: selector.slice(1) };
  }
  if (selector.startsWith(".")) {
    return { type: "class", value: selector.slice(1) };
  }
  if (selector.includes("[")) {
    return { type: "attribute", value: selector };
  }
  return { type: "tag", value: selector };
}
