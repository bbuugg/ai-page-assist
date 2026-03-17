import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'switch_tab',
  schema: { name: 'switch_tab', description: 'Switch to a browser tab by its tab ID.', input_schema: { type: 'object' as const, properties: { tab_id: { type: 'number', description: 'The ID of the tab to switch to.' } }, required: ['tab_id'] } },
  meta: { label: 'Switch Tab', description: 'Switch to a browser tab by ID' },
  handler: 'background',
};
