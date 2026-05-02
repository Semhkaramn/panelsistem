import type { Panel } from "@prisma/client";

interface ScrapeResult {
  success: boolean;
  value?: string;
  error?: string;
  screenshot?: string;
}

// Browserless.io API endpoint for scraping
const BROWSERLESS_URL = process.env.BROWSERLESS_API_KEY
  ? `https://chrome.browserless.io/scrape?token=${process.env.BROWSERLESS_API_KEY}`
  : null;

export async function scrapePanel(panel: Panel): Promise<ScrapeResult> {
  // If no Browserless API key, use mock data for development
  if (!BROWSERLESS_URL) {
    console.log(`[DEV] Scraping panel: ${panel.name}`);
    // Simulate scraping with random value changes
    const mockValue = `$${(Math.random() * 10000).toFixed(2)}`;
    return {
      success: true,
      value: mockValue,
    };
  }

  try {
    // First, login to get cookies
    const loginResult = await browserlessLogin(panel);
    if (!loginResult.success) {
      return { success: false, error: loginResult.error };
    }

    // Then scrape the target page with cookies
    const scrapeResult = await browserlessScrape(
      panel.targetUrl,
      panel.elementSelector,
      loginResult.cookies
    );

    return scrapeResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function browserlessLogin(
  panel: Panel
): Promise<{ success: boolean; cookies?: string; error?: string }> {
  if (!BROWSERLESS_URL) {
    return { success: false, error: "Browserless not configured" };
  }

  const loginScript = {
    url: panel.loginUrl,
    waitFor: 3000,
    elements: [
      {
        selector: 'input[type="email"], input[name="email"], input[id*="email"]',
        timeout: 10000,
      },
    ],
    gotoOptions: {
      waitUntil: "networkidle2",
    },
    // Login automation
    evaluate: `
      async () => {
        // Find and fill email
        const emailInput = document.querySelector('input[type="email"], input[name="email"], input[id*="email"]');
        if (emailInput) {
          emailInput.value = '${panel.email}';
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Find and fill password
        const passwordInput = document.querySelector('input[type="password"]');
        if (passwordInput) {
          passwordInput.value = '${panel.password}';
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Find and click submit button
        await new Promise(r => setTimeout(r, 500));
        const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) submitBtn.click();

        // Wait for navigation
        await new Promise(r => setTimeout(r, 3000));

        return document.cookie;
      }
    `,
  };

  try {
    const response = await fetch(BROWSERLESS_URL.replace("/scrape", "/function"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: `
          module.exports = async ({ page }) => {
            await page.goto('${panel.loginUrl}', { waitUntil: 'networkidle2' });
            await page.waitForTimeout(2000);

            // Fill login form
            await page.type('input[type="email"], input[name="email"]', '${panel.email}');
            await page.type('input[type="password"]', '${panel.password}');

            // Submit
            await page.click('button[type="submit"]');
            await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
            await page.waitForTimeout(2000);

            const cookies = await page.cookies();
            return { cookies };
          }
        `,
      }),
    });

    const data = await response.json();
    return {
      success: true,
      cookies: JSON.stringify(data.cookies),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    };
  }
}

async function browserlessScrape(
  url: string,
  selector: string,
  cookies?: string
): Promise<ScrapeResult> {
  if (!BROWSERLESS_URL) {
    return { success: false, error: "Browserless not configured" };
  }

  try {
    const response = await fetch(BROWSERLESS_URL.replace("/scrape", "/function"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: `
          module.exports = async ({ page }) => {
            ${cookies ? `
            const cookieData = ${cookies};
            await page.setCookie(...cookieData);
            ` : ""}

            await page.goto('${url}', { waitUntil: 'networkidle2' });
            await page.waitForTimeout(3000);

            const element = await page.$('${selector}');
            if (!element) {
              return { success: false, error: 'Element not found' };
            }

            const value = await page.evaluate(el => el.textContent?.trim(), element);
            const screenshot = await page.screenshot({ encoding: 'base64' });

            return { success: true, value, screenshot };
          }
        `,
      }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Scrape failed",
    };
  }
}

// Auto-detect common element selectors
export function suggestSelectors(html: string): string[] {
  const suggestions: string[] = [];

  // Common patterns for values/amounts
  const patterns = [
    // Tables with totals
    'tr.total td',
    'tr.total_amounts td',
    '.total-row td',
    'tfoot td',

    // Buttons with values
    'button.btn-primary',
    '.commission-value',
    '.balance-value',
    '.amount',

    // Dashboard cards
    '.card-value',
    '.stat-value',
    '.metric-value',
    '[class*="balance"]',
    '[class*="commission"]',
    '[class*="earning"]',
    '[class*="revenue"]',

    // Generic value containers
    '.value',
    '.number',
    '.currency',
  ];

  return patterns;
}

export function parseSelector(selector: string): { type: string; value: string } {
  if (selector.startsWith('#')) {
    return { type: 'id', value: selector.slice(1) };
  }
  if (selector.startsWith('.')) {
    return { type: 'class', value: selector.slice(1) };
  }
  if (selector.includes('[')) {
    return { type: 'attribute', value: selector };
  }
  return { type: 'tag', value: selector };
}
