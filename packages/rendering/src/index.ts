/**
 * Placeholder rendering module.
 * Certificate HTML/PDF generation will be implemented in a later phase.
 */

export type RenderTemplateInput = {
  templateHtml: string;
  data: Record<string, unknown>;
};

export type RenderPdfInput = {
  html: string;
};

export type RenderedHtml = {
  html: string;
};

export type RenderedPdf = {
  pdf: Buffer;
};

export async function renderTemplateHtml(input: RenderTemplateInput): Promise<RenderedHtml> {
  void input;
  throw new Error('renderTemplateHtml is not implemented yet');
}

export async function renderHtmlToPdf(input: RenderPdfInput): Promise<RenderedPdf> {
  void input;
  throw new Error('renderHtmlToPdf is not implemented yet');
}

export async function closeRenderingResources(): Promise<void> {
  // Placeholder for future Playwright browser lifecycle cleanup.
}
