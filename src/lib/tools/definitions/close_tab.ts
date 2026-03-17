import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'close_tab',
  schema: { name: 'close_tab', description: 'Close a browser tab by its tab ID. Omit tab_id to close the current inspected tab.', input_schema: { type: 'object' as const, properties: { tab_id: { type: 'number', description: 'Tab ID to close. Omit to close the current tab.' } }, required: [] } },
  meta: { label: 'Close Tab', description: 'Close a browser tab' },
  handler: 'background',
};
