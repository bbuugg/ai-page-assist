import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'send_keys',
  schema: { name: 'send_keys', description: 'Send keyboard key(s) to the page or a specific element. Use for Enter, Tab, Escape, arrow keys, etc.', input_schema: { type: 'object' as const, properties: { key: { type: 'string', description: 'Key to send (e.g. Enter, Tab, Escape, ArrowDown). Follows KeyboardEvent.key values.' }, selector: { type: 'string', description: 'CSS selector of the element to send keys to. Omit to send to the focused element.' } }, required: ['key'] } },
  meta: { label: 'Send Keys', description: 'Send keyboard keys to the page or element' },
  handler: 'content',
};
