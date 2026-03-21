import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'refresh',
  schema: { name: 'refresh', description: 'Reload the current browser tab.', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  meta: { label: 'Refresh', description: 'Reload the current tab' },
  handler: 'background',
};
