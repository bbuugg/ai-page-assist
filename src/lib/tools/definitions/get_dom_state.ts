import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'get_dom_state',
  schema: { name: 'get_dom_state', description: 'Get a structured summary of the current page state: title, URL, and a list of all visible interactive elements (buttons, links, inputs, selects) with their selectors, text, and attributes. Use this to understand what is on the page before interacting with it.', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  meta: { label: 'Get DOM State', description: 'Get structured list of interactive page elements' },
  handler: 'content',
};
