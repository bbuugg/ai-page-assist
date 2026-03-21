import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'wait_for_element',
  schema: { name: 'wait_for_element', description: 'Wait until an element matching a CSS selector appears in the DOM, up to a timeout.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector to wait for.' }, timeout_ms: { type: 'number', description: 'Max milliseconds to wait. Default 5000.' } }, required: ['selector'] } },
  meta: { label: 'Wait for Element', description: 'Wait until an element appears in the DOM' },
  handler: 'content',
};
