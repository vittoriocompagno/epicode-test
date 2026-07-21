import Handlebars from 'handlebars';

export type TemplateValidationIssue = {
  code:
    | 'MALFORMED_TEMPLATE'
    | 'UNSAFE_EXPRESSION'
    | 'UNSUPPORTED_EXPRESSION'
    | 'TOO_MANY_VARIABLES';
  message: string;
  details?: Record<string, unknown>;
};

export type TemplateValidationResult =
  | { ok: true; variables: string[] }
  | { ok: false; issues: TemplateValidationIssue[] };

export type RenderResult =
  | { ok: true; html: string }
  | {
      ok: false;
      code: 'MISSING_VARIABLES' | 'INVALID_TEMPLATE' | 'RENDER_FAILED';
      message: string;
      details?: Record<string, unknown>;
    };

const MAX_VARIABLES = 50;

type AstNode = {
  type: string;
  [key: string]: unknown;
};

/**
 * Variable value policy:
 * - `undefined` at a required path => missing (error)
 * - `null` => allowed, rendered as empty string
 * - `string` / `number` / `boolean` => rendered via Handlebars escaping
 * - nested objects are allowed for intermediate path segments (e.g. course.title)
 * - arrays/objects used as a leaf value are JSON-stringified then escaped
 */
export function extractTemplateVariables(templateHtml: string): string[] {
  const validation = validateTemplate(templateHtml);
  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => issue.message).join('; '));
  }
  return validation.variables;
}

export function validateTemplate(templateHtml: string): TemplateValidationResult {
  let ast: AstNode;
  try {
    ast = Handlebars.parse(templateHtml) as unknown as AstNode;
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: 'MALFORMED_TEMPLATE',
          message: error instanceof Error ? error.message : 'Malformed Handlebars template',
        },
      ],
    };
  }

  const issues: TemplateValidationIssue[] = [];
  const variables = new Set<string>();

  walkAst(ast, (node) => {
    if (node.type === 'MustacheStatement' || node.type === 'SubExpression') {
      const escaped = node.escaped;
      if (node.type === 'MustacheStatement' && escaped === false) {
        issues.push({
          code: 'UNSAFE_EXPRESSION',
          message: 'Unescaped Handlebars expressions are not allowed ({{{ }}} or {{& }})',
        });
        return;
      }

      const params = node.params;
      const hash = node.hash as { pairs?: unknown[] } | undefined;
      if ((Array.isArray(params) && params.length > 0) || (hash?.pairs?.length ?? 0) > 0) {
        issues.push({
          code: 'UNSUPPORTED_EXPRESSION',
          message: 'Handlebars helpers and parameterized expressions are not allowed',
        });
        return;
      }

      const path = node.path as AstNode | undefined;
      if (!path || path.type !== 'PathExpression') {
        issues.push({
          code: 'UNSUPPORTED_EXPRESSION',
          message: 'Only simple variable path expressions are supported',
        });
        return;
      }

      if (path.data === true) {
        issues.push({
          code: 'UNSUPPORTED_EXPRESSION',
          message: 'Handlebars data variables (@...) are not allowed',
        });
        return;
      }

      const original = typeof path.original === 'string' ? path.original : '';
      if (!original || original === 'this' || original === '.') {
        issues.push({
          code: 'UNSUPPORTED_EXPRESSION',
          message: 'Anonymous or context-root placeholders are not allowed',
        });
        return;
      }

      variables.add(original);
      return;
    }

    if (
      node.type === 'BlockStatement' ||
      node.type === 'PartialStatement' ||
      node.type === 'PartialBlockStatement' ||
      node.type === 'DecoratorBlock' ||
      node.type === 'Decorator'
    ) {
      issues.push({
        code: 'UNSUPPORTED_EXPRESSION',
        message: `Unsupported Handlebars construct: ${node.type}`,
      });
    }
  });

  if (variables.size > MAX_VARIABLES) {
    issues.push({
      code: 'TOO_MANY_VARIABLES',
      message: `Templates may declare at most ${MAX_VARIABLES} unique placeholders`,
      details: { count: variables.size },
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    variables: [...variables].sort((a, b) => a.localeCompare(b)),
  };
}

export function renderTemplate(
  templateHtml: string,
  variables: Record<string, unknown>,
): RenderResult {
  const validation = validateTemplate(templateHtml);
  if (!validation.ok) {
    return {
      ok: false,
      code: 'INVALID_TEMPLATE',
      message: 'Template failed validation',
      details: { issues: validation.issues },
    };
  }

  const missing = validation.variables.filter((path) => getByPath(variables, path) === undefined);
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'MISSING_VARIABLES',
      message: 'One or more required template variables are missing',
      details: { missing },
    };
  }

  const normalized = normalizeVariables(variables);

  try {
    const compiled = Handlebars.compile(templateHtml, {
      strict: false,
      assumeObjects: false,
      noEscape: false,
    });
    const html = compiled(normalized, {
      allowProtoPropertiesByDefault: false,
      allowProtoMethodsByDefault: false,
    });
    return { ok: true, html };
  } catch (error) {
    return {
      ok: false,
      code: 'RENDER_FAILED',
      message: error instanceof Error ? error.message : 'Failed to render template',
    };
  }
}

export {
  FakePdfRenderer,
  PlaywrightPdfRenderer,
  type PdfRenderOptions,
  type PdfRenderer,
} from './pdf.js';

function walkAst(node: AstNode, visit: (node: AstNode) => void): void {
  visit(node);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          walkAst(item, visit);
        }
      }
    } else if (isAstNode(value)) {
      walkAst(value, visit);
    }
  }
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && 'type' in value;
}

export function getByPath(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = source;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export function findMissingVariables(
  required: string[],
  variables: Record<string, unknown>,
): string[] {
  return required.filter((path) => getByPath(variables, path) === undefined);
}

function normalizeVariables(variables: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(variables)) {
    result[key] = normalizeValue(value);
  }

  return result;
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const nested: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(objectValue)) {
      nested[key] = normalizeValue(nestedValue);
    }
    return nested;
  }
  return String(value);
}
