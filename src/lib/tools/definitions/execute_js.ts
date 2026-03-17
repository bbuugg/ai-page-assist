import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'execute_js',
  schema: { name: 'execute_js', description: 'Execute arbitrary JavaScript in the context of the inspected page and return the result.', input_schema: { type: 'object' as const, properties: { code: { type: 'string', description: 'JavaScript code to execute. The return value will be serialized and returned as a string.' } }, required: ['code'] } },
  meta: { label: 'Execute JavaScript', description: 'Run arbitrary JS on the page' },
  handler: 'content',
};
