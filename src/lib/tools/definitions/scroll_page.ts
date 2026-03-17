import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'scroll_page',
  schema: { name: 'scroll_page', description: 'Scroll the page or a specific element by a given pixel offset.', input_schema: { type: 'object' as const, properties: { x: { type: 'number', description: 'Horizontal scroll offset in pixels.' }, y: { type: 'number', description: 'Vertical scroll offset in pixels.' }, selector: { type: 'string', description: 'CSS selector of the element to scroll. Omit to scroll the window.' } }, required: [] } },
  meta: { label: 'Scroll Page', description: 'Scroll the page or a specific element' },
  handler: 'content',
};
