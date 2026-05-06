import { NextResponse } from "next/server";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

// Browser instance (reusable)
let browserInstance: Browser | null = null;
let currentPage: Page | null = null;

// Session cookies storage
const sessionCookies: Map<string, any[]> = new Map();

// Get Browserless WebSocket URL
function getBrowserlessWSEndpoint(): string | null {
  const apiKey = process.env.BROWSERLESS_API_KEY;
  if (!apiKey) return null;
  return `wss://chrome.browserless.io?token=${apiKey}`;
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  console.log("🌐 Tarayıcı başlatılıyor...");

  // Try Browserless.io first (recommended for serverless)
  const browserlessEndpoint = getBrowserlessWSEndpoint();

  if (browserlessEndpoint) {
    console.log("🔧 Browserless.io kullanılıyor...");
    try {
      browserInstance = await puppeteer.connect({
        browserWSEndpoint: browserlessEndpoint,
      });
      console.log("✅ Browserless.io bağlantısı kuruldu");
      return browserInstance;
    } catch (error) {
      console.error("❌ Browserless.io bağlantı hatası:", error);
      throw new Error(
        "Browserless.io bağlantısı kurulamadı. API anahtarınızı kontrol edin."
      );
    }
  }

  // Fallback to local Chrome if CHROME_PATH is set
  if (process.env.CHROME_PATH) {
    console.log(`🔧 Yerel Chrome kullanılıyor: ${process.env.CHROME_PATH}`);
    browserInstance = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    });
    console.log("✅ Yerel Chrome başlatıldı");
    return browserInstance;
  }

  throw new Error(
    "Tarayıcı bulunamadı. BROWSERLESS_API_KEY veya CHROME_PATH ayarlayın. " +
    "Browserless.io için ücretsiz hesap: https://browserless.io"
  );
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

        const { x, y, waitForNav } = body;
        const previousUrl = currentPage.url();

        await currentPage.mouse.click(x, y);

        // Wait for potential navigation
        if (waitForNav) {
          try {
            await currentPage.waitForNavigation({ timeout: 5000, waitUntil: "networkidle2" });
          } catch {
            // Navigation might not happen, that's ok
          }
        }

        await delay(500);

        const screenshot = await currentPage.screenshot({
          encoding: "base64",
          fullPage: false,
        });

        const newUrl = currentPage.url();
        const navigated = newUrl !== previousUrl;

        return NextResponse.json({
          success: true,
          screenshot: `data:image/png;base64,${screenshot}`,
          currentUrl: newUrl,
          navigated,
        });
      }

      case "scroll": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        const { direction, amount } = body;
        const scrollAmount = amount || 300;

        await currentPage.evaluate((dir: string, amt: number) => {
          if (dir === "down") {
            window.scrollBy(0, amt);
          } else if (dir === "up") {
            window.scrollBy(0, -amt);
          } else if (dir === "left") {
            window.scrollBy(-amt, 0);
          } else if (dir === "right") {
            window.scrollBy(amt, 0);
          }
        }, direction, scrollAmount);

        await delay(300);

        const screenshot = await currentPage.screenshot({
          encoding: "base64",
          fullPage: false,
        });

        const scrollPosition = await currentPage.evaluate(() => ({
          x: window.scrollX,
          y: window.scrollY,
          maxX: document.documentElement.scrollWidth - window.innerWidth,
          maxY: document.documentElement.scrollHeight - window.innerHeight,
        }));

        return NextResponse.json({
          success: true,
          screenshot: `data:image/png;base64,${screenshot}`,
          scrollPosition,
        });
      }

      case "type": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        const { text } = body;
        await currentPage.keyboard.type(text, { delay: 50 });
        await delay(200);

        const screenshot = await currentPage.screenshot({
          encoding: "base64",
          fullPage: false,
        });

        return NextResponse.json({
          success: true,
          screenshot: `data:image/png;base64,${screenshot}`,
        });
      }

      case "pressKey": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        const { key } = body;
        await currentPage.keyboard.press(key);
        await delay(300);

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

      case "getClickableElements": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        // Get all clickable elements (links, buttons, inputs)
        const elements = await currentPage.evaluate(() => {
          const clickable: any[] = [];
          const selectors = 'a, button, input[type="submit"], input[type="button"], [onclick], [role="button"], .btn';

          document.querySelectorAll(selectors).forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight + 100) {
              const href = (el as HTMLAnchorElement).href || null;
              const text = el.textContent?.trim().substring(0, 50) || el.getAttribute('aria-label') || '';

              clickable.push({
                index,
                tagName: el.tagName.toLowerCase(),
                text,
                href,
                rect: {
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                  width: rect.width,
                  height: rect.height,
                },
              });
            }
          });

          return clickable;
        });

        return NextResponse.json({
          success: true,
          elements,
        });
      }

      case "hover": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        const { x: hoverX, y: hoverY } = body;
        await currentPage.mouse.move(hoverX, hoverY);
        await delay(300);

        const screenshot = await currentPage.screenshot({
          encoding: "base64",
          fullPage: false,
        });

        return NextResponse.json({
          success: true,
          screenshot: `data:image/png;base64,${screenshot}`,
        });
      }

      case "goBack": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        await currentPage.goBack({ waitUntil: "networkidle2" });
        await delay(500);

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

      case "goForward": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        await currentPage.goForward({ waitUntil: "networkidle2" });
        await delay(500);

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

      case "refresh": {
        if (!currentPage) {
          return NextResponse.json({ error: "No page open" }, { status: 400 });
        }

        await currentPage.reload({ waitUntil: "networkidle2" });
        await delay(500);

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
