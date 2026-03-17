import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'click_element',
  schema: { name: 'click_element', description: 'Click an element on the page using a CSS selector.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector for the element to click.' } }, required: ['selector'] } },
  meta: { label: 'Click Element', description: 'Click an element by CSS selector' },
  handler: 'content',
};
