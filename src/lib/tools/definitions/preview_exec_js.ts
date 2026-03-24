import type { ToolDef } from '../types';

export const def: ToolDef = {
  name: 'preview_exec_js',
  schema: {
    name: 'preview_exec_js',
    description: 'Execute JavaScript inside the HTML preview page iframe to make partial DOM modifications. Use this instead of regenerating the full HTML when you only need to change specific elements. The code runs in the iframe\'s document context — use document.querySelector, element.textContent, element.style, etc. Return a value from your code to get feedback. Example: `document.querySelector(\'.title\').textContent = \'New Title\'; return \'done\';`',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute inside the preview iframe. Has access to the iframe\'s document and window. Return a value to confirm the change.' },
      },
      required: ['code'],
    },
  },
  meta: { label: 'Exec JS in Preview', description: 'Run JS inside the preview iframe' },
  handler: async (input) => {
    const code = input.code as string;
    const cmdId = Date.now().toString();

    // Write command to storage; preview page listens and executes
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ previewCmd: { id: cmdId, code } }, resolve);
    });

    // Poll for result (preview page writes back to previewCmdResult)
    const result = await new Promise<{ id: string; result?: string; error?: string }>((resolve, reject) => {
      const deadline = Date.now() + 8000;
      function poll() {
        chrome.storage.local.get(['previewCmdResult'], (r) => {
          const res = r.previewCmdResult;
          if (res && res.id === cmdId) {
            resolve(res);
          } else if (Date.now() > deadline) {
            reject(new Error('preview_exec_js timed out — is the preview page open?'));
          } else {
            setTimeout(poll, 100);
          }
        });
      }
      poll();
    });

    if (result.error) return { content: result.error, isError: true };
    return { content: result.result ?? 'done' };
  },
};
