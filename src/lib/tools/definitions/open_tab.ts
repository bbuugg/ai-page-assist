import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'open_tab',
  schema: { name: 'open_tab', description: 'Open a new browser tab, optionally navigating to a URL.', input_schema: { type: 'object' as const, properties: { url: { type: 'string', description: 'URL to open in the new tab. Omit for blank tab.' } }, required: [] } },
  meta: { label: 'Open Tab', description: 'Open a new browser tab' },
  handler: 'background',
};
