import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'go_back',
  schema: { name: 'go_back', description: 'Navigate the current browser tab back one step in history.', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  meta: { label: 'Go Back', description: 'Navigate back in browser history' },
  handler: 'background',
};
