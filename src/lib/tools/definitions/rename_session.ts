import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'rename_session',
  schema: {
    name: 'rename_session',
    description: 'Rename the current chat session to a more descriptive title based on the conversation topic. Use this proactively after understanding what the user wants to accomplish, so the session history is easy to identify later.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'The new session title, concise and descriptive (max ~40 chars).' },
      },
      required: ['title'],
    },
  },
  meta: { label: '重命名会话', description: '修改当前会话名称' },
  handler: async () => { throw new Error('rename_session must be handled by the AI loop'); },
};
