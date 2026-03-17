import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'go_forward',
  schema: { name: 'go_forward', description: 'Navigate the current browser tab forward one step in history.', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  meta: { label: 'Go Forward', description: 'Navigate forward in browser history' },
  handler: 'background',
};
