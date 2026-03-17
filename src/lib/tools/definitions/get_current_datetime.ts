import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'get_current_datetime',
  schema: { name: 'get_current_datetime', description: 'Get the current local date and time.', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  meta: { label: 'Get Date & Time', description: 'Get the current local date and time' },
  handler: async () => ({ content: new Date().toLocaleString() }),
};
