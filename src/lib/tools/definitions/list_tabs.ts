import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'list_tabs',
  schema: { name: 'list_tabs', description: 'List all currently open browser tabs with their IDs, titles, and URLs.', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  meta: { label: 'List Tabs', description: 'List all open browser tabs' },
  handler: 'background',
};
