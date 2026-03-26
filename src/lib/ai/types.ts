import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
export type { MessageParam };

export type AskUserMode = 'text' | 'yes_no' | 'single' | 'multiple';

export const CONTEXT_SWITCHING_TOOLS = new Set(['open_url', 'switch_tab', 'go_back', 'go_forward', 'refresh']);

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onToolCall: (name: string, input: Record<string, unknown>) => void;
  onToolResult: (name: string, result: string, isError: boolean) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  onRawLog?: (request: string, response: string) => void;
  /** Called when AI uses ask_user tool. Resolve the promise with the user's answer to continue. */
  onAskUser?: (question: string, mode: AskUserMode, options?: string[]) => Promise<string>;
  /** Called when a thinking block is received (Anthropic extended thinking). */
  onThinking?: (text: string) => void;
  /** Called when AI uses rename_session tool. */
  onRenameSession?: (title: string) => void;
}
