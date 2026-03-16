import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
export type { MessageParam };

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onToolCall: (name: string, input: Record<string, unknown>) => void;
  onToolResult: (name: string, result: string, isError: boolean, isImage?: boolean) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  onRawLog?: (request: string, response: string) => void;
  /** Called when AI uses ask_user tool. Resolve the promise with the user's answer to continue. */
  onAskUser?: (question: string) => Promise<string>;
}
