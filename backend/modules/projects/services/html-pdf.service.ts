/* eslint-disable global-require */
let cachedRenderer: { driver: 'puppeteer' | 'playwright'; module: any } | null = null;

async function ensureRenderer() {
  if (cachedRenderer) return cachedRenderer;
  try {
    const puppeteer = require('puppeteer');
    cachedRenderer = { driver: 'puppeteer', module: puppeteer };
    return cachedRenderer;
  } catch (error) {
    // continue to playwright fallback
  }
  try {
    const playwright = require('playwright');
    cachedRenderer = { driver: 'playwright', module: playwright };
    return cachedRenderer;
  } catch (error) {
    throw new Error('HTML renderer not available');
  }
}

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

  if (renderer.driver === 'puppeteer') {
    return renderWithPuppeteer(renderer.module, html, pdfOptions);
  }
  return renderWithPlaywright(renderer.module, html, pdfOptions);
}

async function renderWithPuppeteer(puppeteer: any, html: string, options: HtmlPdfOptions) {
  let browser: any;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf(options);
    await page.close();
    await browser.close();
    return buffer;
  } catch (error) {
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
