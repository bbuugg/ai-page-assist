import type { ToolDef } from '../types';

export const def: ToolDef = {
  name: 'get_element_css',
  schema: {
    name: 'get_element_css',
    description: 'Get the computed CSS of the currently selected element on the page.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  meta: { label: 'Get Element CSS', description: 'Read computed CSS of the selected element' },
  handler: 'content',
};
