import type { ToolDef } from '../types';

export const def: ToolDef = {
  name: 'get_element_html',
  schema: {
    name: 'get_element_html',
    description: 'Get the HTML of the currently selected element on the page. Returns the outer HTML string.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  meta: { label: 'Get Element HTML', description: 'Read outer HTML of the selected element' },
  handler: 'content',
};
