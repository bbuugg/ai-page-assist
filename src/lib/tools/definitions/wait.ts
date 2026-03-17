import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'wait',
  schema: { name: 'wait', description: 'Wait for a specified number of milliseconds before continuing.', input_schema: { type: 'object' as const, properties: { ms: { type: 'number', description: 'Number of milliseconds to wait (max 10000).' } }, required: ['ms'] } },
  meta: { label: 'Wait', description: 'Wait for a number of milliseconds' },
  handler: 'content',
};
