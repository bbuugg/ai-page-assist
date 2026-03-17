import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'get_full_page_html',
  schema: { name: 'get_full_page_html', description: 'Get the full outer HTML of the entire page (document.documentElement).', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  meta: { label: 'Get Full Page HTML', description: 'Read HTML of the entire page' },
  handler: 'content',
};
