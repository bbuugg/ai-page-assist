# Smart Page Context Injection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current "inject full truncated HTML upfront" approach with lightweight page context (URL + title + text summary) plus a new `extract_page_elements` tool, so AI can precisely query what it needs rather than scanning a truncated HTML dump.

**Architecture:** On each `handleSend`, inject only URL + page title + ~3000-char plain-text summary as context. A new `extract_page_elements` content-script tool accepts `selectors` and/or `keywords` arrays and returns structured element data. The system prompt tells AI to use this tool (and the existing `query_page`) to find elements, and only fall back to `get_full_page_html` if those fail.

**Tech Stack:** TypeScript, Chrome Extension (content script + side panel), Anthropic SDK, React/Zustand

---

### Task 1: Add `extract_page_elements` tool definition

**Files:**
- Create: `src/lib/tools/definitions/extract_page_elements.ts`
- Modify: `src/lib/tools/registry.ts`

**Step 1: Create the tool definition file**

```ts
// src/lib/tools/definitions/extract_page_elements.ts
import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'extract_page_elements',
  schema: {
    name: 'extract_page_elements',
    description:
      'Extract elements from the live page by CSS selectors and/or keywords. ' +
      'Returns tag, id, class, text snippet, and simplified outerHTML for each match. ' +
      'Use this before resorting to get_full_page_html.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selectors: {
          type: 'array',
          items: { type: 'string' },
          description: 'CSS selectors to query (e.g. ["nav", ".price", "#cart"]). Each is tried independently.',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Text keywords to search across all visible elements.',
        },
        limit: {
          type: 'number',
          description: 'Max elements per selector/keyword. Default 5.',
        },
      },
      required: [],
    },
  },
  meta: { label: 'Extract Page Elements', description: 'Extract elements by selector or keyword' },
  handler: 'content',
};
```

**Step 2: Register the tool in registry.ts**

In `src/lib/tools/registry.ts`, add:
```ts
import { def as extract_page_elements } from './definitions/extract_page_elements';
```
And add `extract_page_elements` to the `ALL_TOOLS` array.

**Step 3: Commit**
```
git add src/lib/tools/definitions/extract_page_elements.ts src/lib/tools/registry.ts
git commit -m "feat: add extract_page_elements tool definition"
```

---

### Task 2: Implement `extract_page_elements` handler in content.ts

**Files:**
- Modify: `src/content/content.ts` (inside the `switch (tool)` block, after the `query_page` case ~line 715)

**Step 1: Add the case**

Insert after the `query_page` case (around line 715), before `case 'scroll_page'`:

```ts
case 'extract_page_elements': {
  if (!sessionActive) showScanEffect();
  const selectors = (input.selectors as string[] | undefined) ?? [];
  const keywords = (input.keywords as string[] | undefined) ?? [];
  const limit = Math.min(Number(input.limit) || 5, 20);

  function getCssPath(el: Element): string {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.documentElement) {
      let seg = cur.tagName.toLowerCase();
      if (cur.id) { seg += `#${cur.id}`; parts.unshift(seg); break; }
      const siblings = cur.parentElement ? Array.from(cur.parentElement.children).filter(c => c.tagName === cur!.tagName) : [];
      if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      parts.unshift(seg);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function elementInfo(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
    const text = (el.textContent ?? '').trim().slice(0, 300);
    const html = getSimplifiedHTML(el, 800);
    const path = getCssPath(el);
    return `tag: ${tag}${id}${cls}\ncss_path: ${path}\ntext: ${JSON.stringify(text)}\nhtml: ${html}`;
  }

  const seen = new Set<Element>();
  const sections: string[] = [];

  for (const sel of selectors) {
    try {
      const nodes = Array.from(document.querySelectorAll(sel)).filter(e => !seen.has(e)).slice(0, limit);
      nodes.forEach(e => seen.add(e));
      if (nodes.length > 0) {
        sections.push(`## selector: ${sel}\n` + nodes.map(elementInfo).join('\n---\n'));
      }
    } catch { /* invalid selector — skip */ }
  }

  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    const nodes = Array.from(document.querySelectorAll('*'))
      .filter(e => !seen.has(e) && e.children.length === 0 && (e.textContent ?? '').toLowerCase().includes(lower))
      .slice(0, limit);
    nodes.forEach(e => seen.add(e));
    if (nodes.length > 0) {
      sections.push(`## keyword: ${kw}\n` + nodes.map(elementInfo).join('\n---\n'));
    }
  }

  const result = sections.length > 0
    ? sections.join('\n\n')
    : 'No elements found for the given selectors/keywords.';
  sendResponse({ result });
  if (!sessionActive) setTimeout(() => hideScanEffect(), 800);
  break;
}
```

**Step 2: Commit**
```
git add src/content/content.ts
git commit -m "feat: implement extract_page_elements handler in content script"
```

---

### Task 3: Replace full-HTML injection with lightweight context in ChatPanel.tsx

**Files:**
- Modify: `src/overlay/components/ChatPanel.tsx` (lines ~304–344)

The current logic calls `executeTool('get_full_page_html', {})` and truncates to 18000 chars. Replace this block with a lightweight context that:
1. Gets `document.title` via a new background/content message (or reuse `execute_js` tool)
2. Gets a plain-text summary via `execute_js`
3. Builds a small context message

**Step 1: Replace the injection block**

Replace the block from `if (!lastContextMsg || isStale) {` (line ~321) to the closing `}` (line ~344) with:

```ts
if (!lastContextMsg || isStale) {
  try {
    // Lightweight context: title + plain-text summary (~3000 chars)
    const titleResult = await executeTool('execute_js', {
      code: 'document.title'
    });
    const summaryResult = await executeTool('execute_js', {
      code: `(() => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          { acceptNode: n => (n.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) }
        );
        const parts = [];
        let node;
        while ((node = walker.nextNode()) && parts.join(' ').length < 3000) {
          const t = node.textContent?.trim();
          if (t) parts.push(t);
        }
        return parts.join(' ').slice(0, 3000);
      })()`
    });
    const title = titleResult.content ?? '';
    const summary = summaryResult.content ?? '';
    const ctxMsg: MessageParam = {
      role: 'user',
      content:
        `${PAGE_CTX_MARKER}\nCurrent page URL: ${pageUrl}\nPage title: ${title}\n` +
        `Page text summary (auto-injected, first ~3000 chars of visible text):\n${summary}\n\n` +
        `Use extract_page_elements or query_page to look up specific elements. Only call get_full_page_html if those tools fail to find what you need.`
    };
    const ackMsg: MessageParam = { role: 'assistant', content: 'Page context received.' };
    const filtered = historyRef.current.filter(
      (m) =>
        !(m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(PAGE_CTX_MARKER)) &&
        !(m.role === 'assistant' && typeof m.content === 'string' && m.content === 'Page context received.')
    );
    baseHistory = [ctxMsg, ackMsg, ...filtered];
  } catch (e) {
    console.warn('Failed to auto-inject page context:', e);
  }
}
```

**Step 2: Commit**
```
git add src/overlay/components/ChatPanel.tsx
git commit -m "feat: replace full-HTML injection with lightweight page context"
```

---

### Task 4: Update system prompt

**Files:**
- Modify: `src/lib/ai/prompt.ts`

**Step 1: Update the page context section**

Replace the current "Page context:" paragraph (lines 5–8) with:

```ts
'Page context:\n' +
'At the start of each conversation turn a lightweight context is injected as a user message starting with "[__page_ctx__]". ' +
'It contains the page URL, title, and a plain-text summary of visible text (first ~3000 chars). ' +
'This is intentionally lightweight — it does NOT contain full HTML.\n\n' +
'How to find elements on the page:\n' +
'1. First use extract_page_elements with relevant CSS selectors (e.g. "nav", ".price", "#cart", "table") and/or keywords from the user\'s question.\n' +
'2. If that returns partial results, refine with query_page.\n' +
'3. Only call get_full_page_html as a last resort when extract_page_elements and query_page both fail to find what you need.\n\n',
```

Also update rule 1 and 1a in the "Tool usage rules" section to reflect the new primary workflow (extract_page_elements first, not page HTML).

**Step 2: Commit**
```
git add src/lib/ai/prompt.ts
git commit -m "feat: update system prompt for extract_page_elements-first workflow"
```

---

### Task 5: Build and smoke test

**Step 1: Build**
```bash
npm run build   # or whatever the build command is (check package.json)
```

**Step 2: Manual smoke test**
1. Load the extension in Chrome (chrome://extensions → Load unpacked)
2. Open any content-heavy page (e.g. Wikipedia)
3. Open the AI Page Inspector panel, type: "What are the main navigation links?"
4. Verify in the raw log that:
   - The injected context is small (no full HTML blob)
   - AI calls `extract_page_elements` with selector like `"nav"` or keyword `"navigation"`
   - AI gets useful results and answers correctly
5. Test fallback: ask about something very obscure that won't be in the text summary. Verify AI eventually calls `get_full_page_html` only after `extract_page_elements` fails.

**Step 3: Final commit**
```
git add -A
git commit -m "chore: smart page context injection complete"
```
