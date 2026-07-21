import { describe, expect, it } from 'vitest';
import { extractTemplateVariables, renderTemplate, validateTemplate } from './index.js';

describe('extractTemplateVariables', () => {
  it('extracts simple placeholders', () => {
    expect(extractTemplateVariables('Hello {{studentName}}')).toEqual(['studentName']);
  });

  it('extracts nested placeholders', () => {
    expect(extractTemplateVariables('{{course.title}} — {{completionDate}}')).toEqual([
      'completionDate',
      'course.title',
    ]);
  });

  it('deduplicates placeholders', () => {
    expect(extractTemplateVariables('{{name}} and {{name}}')).toEqual(['name']);
  });
});

describe('validateTemplate', () => {
  it('rejects triple-brace expressions', () => {
    const result = validateTemplate('{{{unsafeHtml}}}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'UNSAFE_EXPRESSION')).toBe(true);
    }
  });

  it('rejects unescaped ampersand expressions', () => {
    const result = validateTemplate('{{& unsafeHtml}}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'UNSAFE_EXPRESSION')).toBe(true);
    }
  });

  it('rejects malformed Handlebars', () => {
    const result = validateTemplate('Hello {{studentName');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe('MALFORMED_TEMPLATE');
    }
  });

  it('rejects block helpers', () => {
    const result = validateTemplate('{{#if studentName}}yes{{/if}}');
    expect(result.ok).toBe(false);
  });
});

describe('renderTemplate', () => {
  it('renders when all variables are present', () => {
    const result = renderTemplate('Hello {{studentName}}', { studentName: 'Ada' });
    expect(result).toEqual({ ok: true, html: 'Hello Ada' });
  });

  it('lists missing required variables', () => {
    const result = renderTemplate('Hello {{studentName}}', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MISSING_VARIABLES');
      expect(result.details).toEqual({ missing: ['studentName'] });
    }
  });

  it('escapes HTML special characters', () => {
    const result = renderTemplate('<p>{{studentName}}</p>', {
      studentName: '<script>alert(1)</script>',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
      expect(result.html).not.toContain('<script>');
    }
  });

  it('renders numbers and booleans predictably', () => {
    const result = renderTemplate('{{count}} / {{active}}', { count: 3, active: true });
    expect(result).toEqual({ ok: true, html: '3 / true' });
  });

  it('renders nested values correctly', () => {
    const result = renderTemplate('{{course.title}}', {
      course: { title: 'Distributed Systems' },
    });
    expect(result).toEqual({ ok: true, html: 'Distributed Systems' });
  });

  it('treats null as an empty string', () => {
    const result = renderTemplate('X{{nickname}}Y', { nickname: null });
    expect(result).toEqual({ ok: true, html: 'XY' });
  });

  it('allows extra variables', () => {
    const result = renderTemplate('{{name}}', { name: 'Ada', unused: 'x' });
    expect(result).toEqual({ ok: true, html: 'Ada' });
  });
});
