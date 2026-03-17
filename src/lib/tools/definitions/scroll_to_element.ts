import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'scroll_to_element',
  schema: { name: 'scroll_to_element', description: 'Scroll the page until a specific element is visible in the viewport.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector of the element to scroll into view.' }, block: { type: 'string', description: 'Vertical alignment: start, center, end, or nearest. Default nearest.' } }, required: ['selector'] } },
  meta: { label: 'Scroll to Element', description: 'Scroll element into view' },
  handler: 'content',
};
