import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'highlight_element',
  schema: { name: 'highlight_element', description: 'Highlight a specific element on the page using a CSS selector.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'A valid CSS selector string identifying the element to highlight.' } }, required: ['selector'] } },
  meta: { label: 'Highlight Element', description: 'Highlight an element by CSS selector' },
  handler: 'content',
};
