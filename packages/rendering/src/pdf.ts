import type { Browser, BrowserContext } from 'playwright';
import { chromium } from 'playwright';

export type PdfRenderOptions = {
  format?: 'A4' | 'Letter';
  timeoutMs?: number;
  maxHtmlBytes?: number;
};

export interface PdfRenderer {
  render(html: string, options?: PdfRenderOptions): Promise<Buffer>;
  close(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_HTML_BYTES = 500_000;

export class PlaywrightPdfRenderer implements PdfRenderer {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  constructor(
    private readonly launchOptions: {
      headless?: boolean;
      timeoutMs?: number;
      maxHtmlBytes?: number;
    } = {},
  ) {}

  async render(html: string, options: PdfRenderOptions = {}): Promise<Buffer> {
    const maxHtmlBytes = options.maxHtmlBytes ?? this.launchOptions.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;
    const timeoutMs = options.timeoutMs ?? this.launchOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (Buffer.byteLength(html, 'utf8') > maxHtmlBytes) {
      throw new Error(`HTML exceeds maximum size of ${maxHtmlBytes} bytes`);
    }

    const browser = await this.getBrowser();
    let context: BrowserContext | null = null;

    try {
      context = await browser.newContext({
        javaScriptEnabled: false,
        bypassCSP: false,
      });

      await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (url === 'about:blank' || url.startsWith('data:')) {
          await route.continue();
          return;
        }
        await route.abort('blockedbyclient');
      });

      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);

      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });

      const pdf = await page.pdf({
        format: options.format ?? 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });

      return Buffer.from(pdf);
    } finally {
      if (context) {
        await context.close();
      }
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.launching = null;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }
    if (!this.launching) {
      this.launching = chromium.launch({
        headless: this.launchOptions.headless ?? true,
      });
    }
    this.browser = await this.launching;
    return this.browser;
  }
}

export class FakePdfRenderer implements PdfRenderer {
  readonly calls: string[] = [];
  failNext = false;

  async render(html: string): Promise<Buffer> {
    this.calls.push(html);
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Fake PDF renderer failure');
    }
    return Buffer.from(`%PDF-1.4\n% fake pdf for ${html.length} bytes\n%%EOF\n`, 'utf8');
  }

  async close(): Promise<void> {}
}
