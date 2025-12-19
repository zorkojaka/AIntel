/* eslint-disable global-require */
type RendererInfo = { driver: 'playwright'; module: any };

let cachedRenderer: RendererInfo | null = null;
let engineStatusLogged = false;

function logEngineReady(driver: string) {
  if (engineStatusLogged) return;
  engineStatusLogged = true;
  console.log(`PDF_ENGINE=ready driver=${driver}`);
}

function logEngineMissing(reason: string) {
  if (engineStatusLogged) return;
  engineStatusLogged = true;
  console.warn(`PDF_ENGINE=missing reason=${reason}`);
}

async function ensureRenderer(): Promise<RendererInfo> {
  if (cachedRenderer) return cachedRenderer;

  try {
    const playwright = require('playwright');
    if (!playwright?.chromium) {
      throw new Error('Playwright chromium driver not available');
    }
    cachedRenderer = { driver: 'playwright', module: playwright };
    logEngineReady(cachedRenderer.driver);
    return cachedRenderer;
  } catch (error) {
    cachedRenderer = null;
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Playwright (Chromium) runtime missing in production image. Ensure Dockerfile runs "npx playwright install --with-deps chromium".'
        : 'HTML renderer not available. Install Playwright via "pnpm --filter aintel-backend add playwright" and run "npx playwright install chromium".';
    logEngineMissing((error as Error)?.message ?? 'unknown');
    const err = new Error(message);
    (err as any).cause = error;
    throw err;
  }
}

void ensureRenderer().catch(() => {
  /* logged above */
});

export interface HtmlPdfOptions {
  format?: string;
  printBackground?: boolean;
  margin?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
}

const DEFAULT_OPTIONS: HtmlPdfOptions = {
  format: 'A4',
  printBackground: true,
  margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
};

export async function renderHtmlToPdf(html: string, options: HtmlPdfOptions = {}): Promise<Buffer> {
  const renderer = await ensureRenderer();
  const pdfOptions = { ...DEFAULT_OPTIONS, ...options };

  return renderWithPlaywright(renderer.module, html, pdfOptions);
}

async function renderWithPlaywright(playwright: any, html: string, options: HtmlPdfOptions) {
  let browser: any;
  let context: any;
  try {
    const chromium = playwright.chromium;
    if (!chromium) {
      throw new Error('Playwright chromium driver not available');
    }
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const buffer = await page.pdf(options);
    await context.close();
    await browser.close();
    return buffer;
  } catch (error) {
    if (context) {
      try {
        await context.close();
      } catch {
        /* ignore */
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
    throw error;
  }
}
