import type { Panel } from "@prisma/client";
import puppeteer, { type Browser, type Page, type Cookie } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

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

// Check if running in serverless environment
const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
                     !!process.env.NETLIFY ||
                     !!process.env.VERCEL;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  console.log("🌐 Tarayıcı başlatılıyor...");
  console.log(`📍 Ortam: ${isServerless ? 'Serverless' : 'Local'}`);

  // Common launch args
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    "--single-process",
    "--no-zygote",
  ];

  try {
    if (isServerless || process.env.USE_CHROMIUM === "true") {
      // Serverless environment - use @sparticuz/chromium
      console.log("🔧 @sparticuz/chromium kullanılıyor...");

      const executablePath = await chromium.executablePath();
      console.log(`✅ Chromium yolu: ${executablePath}`);

      browserInstance = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [...chromium.args, ...launchArgs],
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
      });
    } else {
      // Local environment - try to find system Chrome
      console.log("🔧 Sistem Chrome aranıyor...");

      // Check for CHROME_PATH environment variable
      if (process.env.CHROME_PATH) {
        console.log(`✅ CHROME_PATH: ${process.env.CHROME_PATH}`);
        browserInstance = await puppeteer.launch({
          executablePath: process.env.CHROME_PATH,
          headless: true,
          args: launchArgs,
          defaultViewport: {
            width: 1920,
            height: 1080,
          },
        });
      } else {
        // Try channel approach for system Chrome
        console.log("🔍 channel: chrome deneniyor...");
        browserInstance = await puppeteer.launch({
          channel: "chrome",
          headless: true,
          args: launchArgs,
          defaultViewport: {
            width: 1920,
            height: 1080,
          },
        });
      }
    }

    console.log("✅ Tarayıcı başlatıldı");
    return browserInstance;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Tarayıcı başlatma hatası: ${errorMessage}`);

    throw new Error(
      `Chrome/Chromium başlatılamadı: ${errorMessage}. ` +
      "Serverless ortam için USE_CHROMIUM=true ayarlayın veya CHROME_PATH belirtin."
    );
  }
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
