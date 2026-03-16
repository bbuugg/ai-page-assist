import type { Tool } from '@anthropic-ai/sdk/resources/messages';

// ---- Tool schemas passed to Claude ----

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'get_element_html',
    description: 'Get the HTML of the currently selected element on the page. Returns the outer HTML string.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_element_css',
    description: 'Get the computed CSS of the currently selected element on the page.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_full_page_html',
    description: 'Get the full outer HTML of the entire page (document.documentElement).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'highlight_element',
    description: 'Highlight a specific element on the page using a CSS selector.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'A valid CSS selector string identifying the element to highlight.',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'execute_js',
    description: 'Execute arbitrary JavaScript in the context of the inspected page and return the result.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute. The return value will be serialized and returned.',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the current visible page and return it as a base64-encoded PNG. Use full_page: true to capture the entire page by stitching multiple viewport screenshots.',
    input_schema: {
      type: 'object' as const,
      properties: {
        full_page: {
          type: 'boolean',
          description: 'If true, captures the entire page height by scrolling and stitching screenshots. Default false (visible viewport only).',
        },
      },
      required: [],
    },
  },
  {
    name: 'fill_input',
    description: 'Fill a value into an input or textarea element on the page, properly triggering framework event listeners (React, Vue, etc).',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector for the input or textarea element.' },
        value: { type: 'string', description: 'The text value to fill in.' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'click_element',
    description: 'Click an element on the page identified by a CSS selector.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element to click.' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'open_url',
    description: 'Navigate the current browser tab to a given URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to navigate to, e.g. https://example.com',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_current_datetime',
    description: 'Get the current local date and time, timezone, and Unix timestamp. Use this whenever the user asks about the current time, date, day of week, or any time-sensitive information.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch the text content of any URL (web page, API endpoint, etc). Use this to look up real-time information, search results, weather, news, or any online resource. Returns the response body as text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The full URL to fetch, e.g. https://example.com' },
        extract_text: { type: 'boolean', description: 'If true, strip HTML tags and return plain text only. Default true.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'modify_element',
    description:
      'Modify DOM elements on the page by executing JavaScript. Use this to change styles, ' +
      'text content, attributes, innerHTML, or DOM structure. A snapshot is saved before the ' +
      'change so the user can undo it. The code runs in the page context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description:
            'JavaScript code that performs the DOM modification. MUST end with a return statement ' +
            'returning a short string describing what was changed (e.g. return "Changed h1 color to red"). ' +
            'Use document.querySelector / querySelectorAll to find elements.',
        },
        description: {
          type: 'string',
          description: 'Human-readable one-line summary of the modification shown to the user.',
        },
      },
      required: ['code', 'description'],
    },
  },
  {
    name: 'undo_last_modification',
    description: 'Undo the last modify_element call, restoring all changed DOM nodes to their previous state.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'upload_file_to_input',
    description: 'Upload a file to a file input element on the page. Provide the file as a base64-encoded string with its MIME type and filename. Use this to upload screenshots or images to file input fields (e.g. image search upload).',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector for the <input type="file"> element.' },
        base64: { type: 'string', description: 'Base64-encoded file content (without the data:mime;base64, prefix).' },
        mime_type: { type: 'string', description: 'MIME type of the file, e.g. "image/png", "image/jpeg".' },
        filename: { type: 'string', description: 'Filename to use, e.g. "screenshot.png".' },
      },
      required: ['selector', 'base64', 'mime_type', 'filename'],
    },
  },
  {
    name: 'scroll_page',
    description: 'Scroll the page or a specific element. Use this to reveal content below the fold before taking a screenshot or inspecting elements. x and y are pixel amounts (positive = down/right, negative = up/left). Omit selector to scroll the main page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        x: { type: 'number', description: 'Horizontal scroll amount in pixels. Default 0.' },
        y: { type: 'number', description: 'Vertical scroll amount in pixels. Positive scrolls down.' },
        selector: { type: 'string', description: 'Optional CSS selector of a scrollable element. Omit to scroll window.' },
      },
      required: ['y'],
    },
  },
  {
    name: 'query_page',
    description:
      'Query elements from the current page by CSS selector and/or keyword. ' +
      'Returns matching elements\' tag, text snippet, and outerHTML (truncated). ' +
      'Use this to find specific elements when the injected page HTML is incomplete or truncated. ' +
      'At least one of selector or keyword must be provided.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector, e.g. "nav a", ".price", "button"' },
        keyword:  { type: 'string', description: 'Filter elements whose visible text contains this keyword (case-insensitive)' },
        limit:    { type: 'number', description: 'Max number of elements to return (default 10, max 30)' },
      },
      required: [],
    },
  },
  {
    name: 'ask_user',
    description: 'Ask the user a clarifying question and wait for their response before continuing. Use this when you need information from the user to proceed (e.g. which element to target, what value to use, confirmation before a destructive action).',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'The question to ask the user.' },
      },
      required: ['question'],
    },
  },
];

export interface ToolMeta {
  name: ToolName;
  label: string;
  description: string;
}

export const TOOL_META: ToolMeta[] = [
  { name: 'get_element_html',    label: 'Get Element HTML',    description: 'Read outer HTML of the selected element' },
  { name: 'get_element_css',     label: 'Get Element CSS',     description: 'Read computed CSS of the selected element' },
  { name: 'get_full_page_html',  label: 'Get Full Page HTML',  description: 'Read HTML of the entire page' },
  { name: 'highlight_element',   label: 'Highlight Element',   description: 'Highlight an element by CSS selector' },
  { name: 'execute_js',          label: 'Execute JavaScript',  description: 'Run arbitrary JS on the page' },
  { name: 'screenshot',          label: 'Screenshot',          description: 'Capture a screenshot of the page' },
  { name: 'fill_input',          label: 'Fill Input',          description: 'Fill text into an input or textarea' },
  { name: 'click_element',       label: 'Click Element',       description: 'Click an element by CSS selector' },
  { name: 'open_url',            label: 'Open URL',            description: 'Navigate the tab to a URL' },
  { name: 'scroll_page',         label: 'Scroll Page',         description: 'Scroll the page or a specific element' },
  { name: 'get_current_datetime',label: 'Get Date & Time',     description: 'Get the current local date and time' },
  { name: 'fetch_url',           label: 'Fetch URL',           description: 'Fetch content from any URL' },
  { name: 'modify_element',         label: 'Modify Element',      description: 'Modify DOM elements via AI-generated JS' },
  { name: 'undo_last_modification', label: 'Undo Modification',   description: 'Undo the last modify_element change' },
  { name: 'upload_file_to_input',   label: 'Upload File',         description: 'Upload a base64 file to a file input element' },
  { name: 'query_page',             label: 'Query Page',          description: 'Query page elements by CSS selector or keyword' },
];

export type ToolName =
  | 'get_element_html'
  | 'get_element_css'
  | 'get_full_page_html'
  | 'highlight_element'
  | 'execute_js'
  | 'screenshot'
  | 'fill_input'
  | 'click_element'
  | 'open_url'
  | 'scroll_page'
  | 'get_current_datetime'
  | 'fetch_url'
  | 'modify_element'
  | 'undo_last_modification'
  | 'upload_file_to_input'
  | 'query_page'
  | 'ask_user';

export interface ToolResult {
  content: string;
  isError?: boolean;
  isImage?: boolean;  // true when content is a base64 PNG data URL (without prefix)
}

// Send a tool command to content script via background service worker
function callContentTool(tool: string, input: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'toContent', action_inner: 'tool', tool, input },
      (response: { result?: unknown; error?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.error) reject(new Error(response.error));
        else resolve(response?.result);
      }
    );
    setTimeout(() => reject(new Error(`Tool ${tool} timed out`)), 10000);
  });
}

// Tools handled directly in the overlay (not forwarded to content script)
const CONTENT_TOOLS = new Set(['get_element_html', 'get_element_css', 'get_full_page_html', 'highlight_element', 'execute_js', 'fill_input', 'click_element', 'modify_element', 'undo_last_modification', 'upload_file_to_input', 'query_page', 'scroll_page']);

export async function executeTool(name: ToolName, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    // Most tools delegate straight to the content script
    if (CONTENT_TOOLS.has(name)) {
      const result = await callContentTool(name, input);
      return { content: result != null && String(result) !== '' ? String(result) : 'null' };
    }

    switch (name) {
      case 'screenshot': {
        const fullPage = !!(input.full_page);
        const action = fullPage ? 'screenshotFullPage' : 'screenshot';
        const dataUrl = await new Promise<string>((resolve, reject) => {
          chrome.runtime.sendMessage({ action }, (response: { dataUrl?: string; error?: string } | undefined) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (response?.error) reject(new Error(response.error));
            else resolve(response?.dataUrl ?? '');
          });
          setTimeout(() => reject(new Error('screenshot timed out')), 30000);
        });
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        return { content: base64, isImage: true };
      }
      case 'open_url': {
        const url = input.url as string;
        await new Promise<void>((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'openUrl', url }, (response: { error?: string } | undefined) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (response?.error) reject(new Error(response.error));
            else resolve();
          });
        });
        return { content: `Navigated to ${url}` };
      }
      case 'get_current_datetime': {
        const now = new Date();
        return { content: JSON.stringify({
          iso: now.toISOString(),
          local: now.toLocaleString(),
          date: now.toLocaleDateString(),
          time: now.toLocaleTimeString(),
          dayOfWeek: now.toLocaleDateString(undefined, { weekday: 'long' }),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          unixMs: now.getTime(),
        }) };
      }
      case 'fetch_url': {
        const url = input.url as string;
        const extractText = input.extract_text !== false;
        const result = await new Promise<{ text?: string; status?: number; statusText?: string; error?: string }>((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'fetchUrl', url }, (response) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(response);
          });
          setTimeout(() => reject(new Error('fetch_url timed out')), 30000);
        });
        if (result.error) return { content: result.error, isError: true };
        if (result.status && result.status >= 400) return { content: `HTTP ${result.status} ${result.statusText}`, isError: true };
        const text = result.text ?? '';
        if (extractText) {
          const stripped = text
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 20000);
          return { content: stripped };
        }
        return { content: text.slice(0, 20000) };
      }
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { content: (err as Error).message, isError: true };
  }
}
