function sendCommand(tabId: number, method: string, params = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(result);
    });
  });
}

// Detect overlay panel close and clean up page effects
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'overlay-panel') return;
  port.onDisconnect.addListener(() => {
    const tabId = inspectedTabId ?? activePanelTabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { action: 'hideBorderFx' }).catch(() => {});
      chrome.tabs.sendMessage(tabId, { action: 'removeHighlight' }).catch(() => {});
    }
    activePanelTabId = null;
    inspectedTabId = null;
  });
});

// Open side panel on action click
chrome.action.onClicked.addListener((tab) => {
  // Block restricted system pages where side panel cannot function
  const url = tab.url ?? '';
  const blocked =
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge-extension://') ||
    (url.startsWith('chrome://') && url !== 'chrome://newtab/') ||
    (url.startsWith('edge://') && url !== 'edge://newtab/');
  if (blocked) return;
  chrome.sidePanel.open({ tabId: tab.id! });
});

// Allow side panel on all URLs
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: true });
});

// Track which tab the side panel is viewing
let activePanelTabId: number | null = null;
// Track the content page tab (distinct from the extension panel tab)
let inspectedTabId: number | null = null;
// Tab groups per session id
const sessionTabGroups = new Map<string, number>();
let activeSessionId: string | null = null;

chrome.tabs.onActivated.addListener(({ tabId }) => {
  // Only update inspectedTabId if it's a real content tab (not the extension panel)
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab.url && !tab.url.startsWith('chrome-extension://')) {
      inspectedTabId = tabId;
    }
    activePanelTabId = tabId;
  });
  chrome.runtime.sendMessage({ type: 'TAB_CHANGED' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Track active session id
  if (request.action === 'setActiveSession') {
    activeSessionId = request.sessionId as string;
    sendResponse({});
    return true;
  }

  // Reset tab group when a new session starts
  if (request.action === 'resetTabGroup') {
    if (activeSessionId) sessionTabGroups.delete(activeSessionId);
    activeSessionId = null;
    sendResponse({});
    return true;
  }

  // Side panel announces itself
  if (request.action === 'panelReady') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      activePanelTabId = tab?.id ?? null;
      // Only set inspectedTabId if the active tab is a real content page
      if (tab?.url && !tab.url.startsWith('chrome-extension://')) {
        inspectedTabId = tab.id ?? null;
      }
      sendResponse({ tabId: inspectedTabId ?? activePanelTabId });
    });
    return true;
  }

  // Side panel requests current tab id
  if (request.action === 'getActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tabId: tabs[0]?.id ?? null });
    });
    return true;
  }

  // Forward tool commands from side panel → content script
  if (request.action === 'toContent') {
    const { action: _action, action_inner, ...rest } = request;
    const payload = action_inner ? { action: action_inner, ...rest } : rest;
    const doSend = (tabId: number) => {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not injected — inject it then retry once
          chrome.scripting.executeScript(
            { target: { tabId }, files: ['content.js'] },
            () => {
              if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
              }
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, payload, (response2) => {
                  if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
                  else sendResponse(response2);
                });
              }, 100);
            }
          );
        } else {
          sendResponse(response);
        }
      });
    };
    const contentTabId = inspectedTabId ?? activePanelTabId;
    if (contentTabId) {
      doSend(contentTabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) { sendResponse({ error: 'No active tab' }); return; }
        inspectedTabId = tabId;
        doSend(tabId);
      });
    }
    return true;
  }

  // Proxy fetch requests (bypasses CORS)
  if (request.action === 'fetchUrl') {
    const { url } = request;
    if (!url || !url.startsWith('http')) {
      sendResponse({ error: `Invalid URL: ${url}` });
      return true;
    }
    fetch(url, { credentials: 'omit' })
      .then(async (resp) => {
        const text = await resp.text();
        sendResponse({ text, status: resp.status, statusText: resp.statusText });
      })
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }

  // Proxy streaming POST (for Ollama — bypasses chrome-extension origin CORS block)
  if (request.action === 'proxyStream') {
    const { url, body, streamId } = request;
    sendResponse({ ok: true }); // ack immediately
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
    }).then(async (resp) => {
      if (!resp.ok) {
        chrome.runtime.sendMessage({ action: 'proxyStreamChunk', streamId, error: `${resp.status} ${resp.statusText}` });
        return;
      }
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        chrome.runtime.sendMessage({ action: 'proxyStreamChunk', streamId, chunk });
      }
      chrome.runtime.sendMessage({ action: 'proxyStreamChunk', streamId, done: true });
    }).catch((err) => {
      chrome.runtime.sendMessage({ action: 'proxyStreamChunk', streamId, error: String(err) });
    });
    return true;
  }

  // Forward tool results from content script → side panel
  if (request.action === 'toPanel') {
    chrome.runtime.sendMessage(request.payload).catch(() => {});
    return false;
  }

  // Tab/navigation/cookie tools from side panel
  if (request.action === 'tabTool') {
    const { tool, input } = request;
    const tabId = inspectedTabId ?? activePanelTabId;

    (async () => {
      try {
        switch (tool) {
          case 'go_back':
            await chrome.tabs.goBack(tabId!);
            sendResponse({ result: 'ok' });
            break;
          case 'go_forward':
            await chrome.tabs.goForward(tabId!);
            sendResponse({ result: 'ok' });
            break;
          case 'refresh':
            await chrome.tabs.reload(tabId!);
            sendResponse({ result: 'ok' });
            break;
          case 'open_tab': {
            const tab = await chrome.tabs.create({ url: input.url as string | undefined, active: true });
            // Add to session tab group (create group if needed)
            if (tab.id !== undefined) {
              await new Promise((r) => setTimeout(r, 200));
              try {
                const sid = activeSessionId;
                let groupId = sid ? sessionTabGroups.get(sid) ?? null : null;
                if (groupId !== null) {
                  // Verify group still exists
                  try {
                    await chrome.tabGroups.get(groupId);
                  } catch {
                    groupId = null;
                    if (sid) sessionTabGroups.delete(sid);
                  }
                }
                if (groupId === null) {
                  groupId = await chrome.tabs.group({ tabIds: [tab.id] });
                  await chrome.tabGroups.update(groupId, { title: 'AI', collapsed: false });
                  if (sid) sessionTabGroups.set(sid, groupId);
                } else {
                  await chrome.tabs.group({ tabIds: [tab.id], groupId });
                }
              } catch {
                // Tab grouping not supported or failed — ignore
              }
            }
            sendResponse({ result: `Opened tab ${tab.id}${input.url ? ` at ${input.url}` : ''}` });
            break;
          }
          case 'close_tab': {
            const closeId = (input.tab_id as number | undefined) ?? tabId!;
            await chrome.tabs.remove(closeId);
            sendResponse({ result: `Closed tab ${closeId}` });
            break;
          }
          case 'switch_tab': {
            const switchId = input.tab_id as number;
            await chrome.tabs.update(switchId, { active: true });
            inspectedTabId = switchId;
            sendResponse({ result: `Switched to tab ${switchId}` });
            break;
          }
          case 'list_tabs': {
            const tabs = await chrome.tabs.query({});
            const list = tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }));
            sendResponse({ result: JSON.stringify(list) });
            break;
          }
          case 'get_cookies': {
            const url = input.url as string | undefined;
            const cookies = url
              ? await chrome.cookies.getAll({ url })
              : await chrome.cookies.getAll({});
            sendResponse({ result: JSON.stringify(cookies) });
            break;
          }
          case 'set_cookie': {
            await chrome.cookies.set({
              url: input.url as string,
              name: input.name as string,
              value: input.value as string,
              ...(input.domain ? { domain: input.domain as string } : {}),
              ...(input.path ? { path: input.path as string } : {}),
              ...(input.expires ? { expirationDate: input.expires as number } : {}),
            });
            sendResponse({ result: `Cookie ${input.name} set` });
            break;
          }
          default:
            sendResponse({ error: `Unknown tab tool: ${tool}` });
        }
      } catch (err) {
        sendResponse({ error: (err as Error).message });
      }
    })();
    return true;
  }

  if (request.action === 'inspectElement') {
    const tabId = request.tabId;
    const { x, y } = request;
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: (px: number, py: number) => {
          const el = document.elementFromPoint(px, py);
          if (!el) return null;
          const html = el.outerHTML;
          const sheets = Array.from(document.styleSheets);
          const cssLines: string[] = [];
          for (const sheet of sheets) {
            let rules: CSSRuleList | null = null;
            try { rules = sheet.cssRules; } catch { continue; }
            for (const rule of Array.from(rules)) {
              if (rule instanceof CSSStyleRule) {
                try {
                  if (el.matches(rule.selectorText) && rule.style.cssText.trim()) {
                    cssLines.push(`${rule.selectorText} {\n  ${rule.style.cssText.trim()}\n}`);
                  }
                } catch {}
              }
            }
          }
          return { html, css: cssLines.join('\n\n') };
        },
        args: [Math.round(x), Math.round(y)],
        world: 'MAIN',
      },
      (results) => {
        if (chrome.runtime.lastError) { sendResponse({ error: chrome.runtime.lastError.message }); return; }
        const result = results?.[0]?.result;
        if (!result) { sendResponse({ error: 'No element at position' }); return; }
        sendResponse({ html: result.html, css: result.css, backendNodeId: null });
      }
    );
    return true;
  }

  if (request.action === 'highlightNode') {
    const tabId = request.tabId ?? activePanelTabId;
    if (!tabId) return false;
    chrome.tabs.sendMessage(tabId, { action: 'highlightNode', backendNodeId: request.backendNodeId });
    return false;
  }

  if (request.action === 'executeScript') {
    const resolvedTabId = inspectedTabId ?? activePanelTabId;
    const doExec = (tabId: number) => {
      // Pass code as arg and eval in MAIN world — avoids unsafe-eval in extension CSP
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: (code: string) => {
            try {
              const val = (0, eval)(code);
              if (val === undefined || val === null) return String(val);
              if (val instanceof Promise) return '__promise__';
              if (val instanceof Node) return (val as Element).outerHTML ?? String(val);
              try { return JSON.parse(JSON.stringify(val)); } catch { return String(val); }
            } catch (e) {
              throw e;
            }
          },
          args: [request.code],
          world: 'MAIN',
        },
        (results) => {
          if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
          else sendResponse({ result: results?.[0]?.result });
        }
      );
    };
    if (resolvedTabId) {
      doExec(resolvedTabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) { sendResponse({ error: 'No active tab' }); return; }
        inspectedTabId = tabId;
        doExec(tabId);
      });
    }
    return true;
  }

  if (request.action === 'openUrl') {
    const resolvedTabId = inspectedTabId ?? activePanelTabId;
    const doOpen = (tabId: number) => {
      chrome.tabs.update(tabId, { url: request.url }, () => {
        if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
        else sendResponse({});
      });
    };
    if (resolvedTabId) {
      doOpen(resolvedTabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) { sendResponse({ error: 'No active tab' }); return; }
        inspectedTabId = tabId;
        doOpen(tabId);
      });
    }
    return true;
  }
});
