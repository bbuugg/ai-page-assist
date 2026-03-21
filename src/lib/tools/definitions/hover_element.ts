import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'hover_element',
  schema: { name: 'hover_element', description: 'Hover over an element to trigger its hover state (mouseover/mouseenter events).', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector of the element to hover.' } }, required: ['selector'] } },
  meta: { label: 'Hover Element', description: 'Hover over an element to trigger hover state' },
  handler: 'content',
};
