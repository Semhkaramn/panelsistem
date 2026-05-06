import { NextResponse } from "next/server";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// Browser instance (reusable)
let browserInstance: Browser | null = null;
let currentPage: Page | null = null;

// Session cookies storage
const sessionCookies: Map<string, any[]> = new Map();

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
    "--disable-web-security",
    "--disable-features=IsolateOrigins,site-per-process",
  ];

  try {
    if (isServerless || process.env.USE_CHROMIUM === "true") {
      // Serverless environment - use @sparticuz/chromium
      console.log("🔧 @sparticuz/chromium kullanılıyor...");

      // Configure chromium for serverless
      chromium.setHeadlessMode = true;
      chromium.setGraphicsMode = false;

      const executablePath = await chromium.executablePath();
      console.log(`✅ Chromium yolu: ${executablePath}`);

      browserInstance = await puppeteer.launch({
        executablePath,
        headless: chromium.headless,
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, url, sessionId, credentials, selector } = body;

    const browser = await getBrowser();

    switch (action) {
      case "navigate": {
        // Create new page or reuse existing
        if (currentPage) {
          await currentPage.close().catch(() => {});
        }

        currentPage = await browser.newPage();

        // Set user agent
        await currentPage.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );

        // Load session cookies if available
        if (sessionId && sessionCookies.has(sessionId)) {
          const cookies = sessionCookies.get(sessionId);
          if (cookies && cookies.length > 0) {
            await currentPage.setCookie(...cookies);
          }
        }

        // Navigate to URL
        await currentPage.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        await delay(2000);

        // Take screenshot
        const screenshot = await currentPage.screenshot({
          encoding: "base64",
          fullPage: false,
        });

        // Get page info
        const pageInfo = await currentPage.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            hasLoginForm: !!(
              document.querySelector('input[type="password"]') ||
              document.querySelector('input[name="password"]')
            ),
            forms: Array.from(document.querySelectorAll("form")).map((form) => ({
              action: form.action,
              inputs: Array.from(form.querySelectorAll("input")).map((input) => ({
                type: input.type,
                name: input.name,
                id: input.id,
              })),
            })),
          };
        });

        return NextResponse.json({
          success: true,
          screenshot: `data:image/png;base64,${screenshot}`,
          pageInfo,
          currentUrl: currentPage.url(),
        });
      }

      case "login": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        const { email, password } = credentials;

        // Find and fill email/username input
        const emailSelectors = [
          'input[type="email"]',
          'input[name="email"]',
          'input[name="username"]',
          'input[id*="email"]',
          'input[id*="user"]',
          'input[placeholder*="mail"]',
          'input[placeholder*="user"]',
        ];

        let emailFilled = false;
        for (const sel of emailSelectors) {
          try {
            const input = await currentPage.$(sel);
            if (input) {
              await currentPage.evaluate((el) => (el as HTMLInputElement).value = "", input);
              await input.type(email, { delay: 50 });
              emailFilled = true;
              break;
            }
          } catch {}
        }

        // Find and fill password input
        const passwordSelectors = [
          'input[type="password"]',
          'input[name="password"]',
        ];

        let passwordFilled = false;
        for (const sel of passwordSelectors) {
          try {
            const input = await currentPage.$(sel);
            if (input) {
              await currentPage.evaluate((el) => (el as HTMLInputElement).value = "", input);
              await input.type(password, { delay: 50 });
              passwordFilled = true;
              break;
            }
          } catch {}
        }

        if (!emailFilled || !passwordFilled) {
          const screenshot = await currentPage.screenshot({
            encoding: "base64",
            fullPage: false,
          });

          return NextResponse.json({
            success: false,
            error: "Login form bulunamadı",
            screenshot: `data:image/png;base64,${screenshot}`,
          });
        }

        await delay(500);

        // Click submit button
        const submitSelectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          'button:has-text("Giriş")',
          'button:has-text("Login")',
          'button:has-text("Sign in")',
          ".btn-primary",
          ".btn-login",
        ];

        for (const sel of submitSelectors) {
          try {
            const btn = await currentPage.$(sel);
            if (btn) {
              await btn.click();
              break;
            }
          } catch {}
        }

        // Wait for navigation
        await delay(3000);

        try {
          await currentPage.waitForNavigation({ timeout: 5000 });
        } catch {}

        // Save cookies for session
        const cookies = await currentPage.cookies();
        const newSessionId = sessionId || `session_${Date.now()}`;
        sessionCookies.set(newSessionId, cookies);

        // Take screenshot after login
        const screenshot = await currentPage.screenshot({
          encoding: "base64",
          fullPage: false,
        });

        // Check if still on login page
        const stillOnLogin = await currentPage.evaluate(() => {
          const url = window.location.href.toLowerCase();
          const hasPasswordField = !!document.querySelector('input[type="password"]');
          return url.includes("login") || url.includes("auth") || hasPasswordField;
        });

        return NextResponse.json({
          success: !stillOnLogin,
          screenshot: `data:image/png;base64,${screenshot}`,
          currentUrl: currentPage.url(),
          sessionId: newSessionId,
          message: stillOnLogin ? "Giriş başarısız olmuş olabilir" : "Giriş başarılı!",
        });
      }

      case "screenshot": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        const screenshot = await currentPage.screenshot({
          encoding: "base64",
          fullPage: false,
        });

        return NextResponse.json({
          success: true,
          screenshot: `data:image/png;base64,${screenshot}`,
          currentUrl: currentPage.url(),
        });
      }

      case "getElements": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        // Get all interactive elements with their positions
        const elements = await currentPage.evaluate(() => {
          const result: any[] = [];
          const allElements = document.querySelectorAll("*");

          allElements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const text = el.textContent?.trim().substring(0, 100);
            const tagName = el.tagName.toLowerCase();

            // Only include visible elements with content
            if (
              rect.width > 0 &&
              rect.height > 0 &&
              rect.top < window.innerHeight &&
              rect.left < window.innerWidth &&
              text &&
              text.length > 0 &&
              !["script", "style", "meta", "link", "head", "html", "body"].includes(tagName)
            ) {
              let selector = "";
              if (el.id) {
                selector = `#${el.id}`;
              } else if (el.className && typeof el.className === "string") {
                const classes = el.className.split(" ").filter((c: string) => c && !c.includes(":"));
                if (classes.length > 0) {
                  selector = `.${classes[0]}`;
                }
              }

              if (!selector) {
                selector = `${tagName}:nth-of-type(${index + 1})`;
              }

              result.push({
                selector,
                tagName,
                text: text.substring(0, 50),
                rect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                },
              });
            }
          });

          return result.slice(0, 100); // Limit results
        });

        return NextResponse.json({
          success: true,
          elements,
        });
      }

      case "getValue": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        try {
          await currentPage.waitForSelector(selector, { timeout: 5000 });
          const value = await currentPage.evaluate((sel: string) => {
            const el = document.querySelector(sel);
            return el?.textContent?.trim() || null;
          }, selector);

          return NextResponse.json({
            success: true,
            value,
            selector,
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            error: "Element bulunamadı",
            selector,
          });
        }
      }

      case "click": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        const { x, y } = body;
        await currentPage.mouse.click(x, y);
        await delay(1000);

        const screenshot = await currentPage.screenshot({
          encoding: "base64",
          fullPage: false,
        });

        return NextResponse.json({
          success: true,
          screenshot: `data:image/png;base64,${screenshot}`,
          currentUrl: currentPage.url(),
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Browser API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Browser error" },
      { status: 500 }
    );
  }
}
