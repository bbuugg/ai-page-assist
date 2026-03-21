import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'ask_user',
  schema: { name: 'ask_user', description: 'Ask the user a clarifying question and wait for their response before continuing. Use this when you need information from the user to proceed (e.g. which element to target, what value to use, confirmation before a destructive action).', input_schema: { type: 'object' as const, properties: { question: { type: 'string', description: 'The question to ask the user.' }, is_yes_no: { type: 'boolean', description: 'Set to true if the question expects a yes or no answer, so the UI can show quick-reply buttons.' } }, required: ['question'] } },
  meta: { label: 'Ask User', description: 'Ask the user a clarifying question' },
  handler: async () => { throw new Error('ask_user must be handled by the AI loop'); },
};
