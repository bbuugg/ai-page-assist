import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'ask_user',
  schema: {
    name: 'ask_user',
    description: 'Ask the user a clarifying question and wait for their response before continuing. Use this when you need information from the user to proceed (e.g. which element to target, what value to use, confirmation before a destructive action).',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'The question to ask the user.' },
        mode: {
          type: 'string',
          enum: ['text', 'yes_no', 'single', 'multiple'],
          description: 'Input mode — MUST be set correctly. "yes_no": use for ANY yes/no or confirm/cancel question, NEVER use "text" for these. "single": user picks exactly one from options list. "multiple": user picks one or more from options list. "text": ONLY for genuinely open-ended answers with no fixed choices.',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of choices shown to the user. Required when mode is "single" or "multiple".',
        },
      },
      required: ['question'],
    },
  },
  meta: { label: '询问用户', description: '向用户提问并等待回答' },
  handler: async () => { throw new Error('ask_user must be handled by the AI loop'); },
};
