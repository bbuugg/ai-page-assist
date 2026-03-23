const NAVIGATION_WAIT_TIMEOUT_MS = 12000;
// Track which tab the side panel is viewing
let activePanelTabId: number | null = null;
// Track the content page tab (distinct from the extension panel tab)
let inspectedTabId: number | null = null;
// Tab groups per session id
const sessionTabGroups = new Map<string, number>();
// Tab IDs opened by the AI per session
const sessionAiTabs = new Map<string, number[]>();

function pushAiTabsUpdate(sessionId: string) {
  const ids = sessionAiTabs.get(sessionId) ?? [];
  Promise.all(
    ids.map((id) =>
      chrome.tabs.get(id)
        .then((tab) => ({ id, title: tab.title ?? String(id), url: tab.url ?? '' }))
        .catch(() => ({ id, title: String(id), url: '' }))
    )
  ).then((tabs) => {
    chrome.runtime.sendMessage({ type: 'AI_TABS_UPDATE', tabs }).catch(() => {});
  });
}

let activeSessionId: string | null = null;
let isAIProcessing = false;

function sendCommand(tabId: number, method: string, params = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(result);
    });
  });
}

function waitForTabComplete(tabId: number, timeoutMs = NAVIGATION_WAIT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    let timer: number | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer !== null) clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };

    const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    timer = setTimeout(finish, timeoutMs) as unknown as number;

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab || tab.status === 'complete') finish();
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
    isAIProcessing = false;
  });
});

// Open side panel on action click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id! });
});

// Allow side panel on all URLs
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: true });
});

// Re-inject visual effects after navigation completes
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const targetTabId = inspectedTabId ?? activePanelTabId;
  if (tabId !== targetTabId || !isAIProcessing) return;
  // Small delay to let content script initialize
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, { action: 'showBorderFx' }).catch(() => {});
  }, 300);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [sessionId, ids] of sessionAiTabs) {
    if (ids.includes(tabId)) {
      sessionAiTabs.set(sessionId, ids.filter((id) => id !== tabId));
      pushAiTabsUpdate(sessionId);
      break;
    }
  }
});

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
    isAIProcessing = true;
    sendResponse({});
    return true;
  }

  // Reset tab group when a new session starts
  if (request.action === 'resetTabGroup') {
    if (activeSessionId) sessionTabGroups.delete(activeSessionId);
    if (activeSessionId) sessionAiTabs.delete(activeSessionId);
    chrome.runtime.sendMessage({ type: 'AI_TABS_UPDATE', tabs: [] }).catch(() => {});
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
    if (action_inner === 'hideBorderFx') isAIProcessing = false;
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
    const checkAndSend = (tabId: number, tabUrl?: string) => {
      const url = tabUrl ?? '';
      if (/^(chrome|edge|about|data|javascript):/.test(url)) {
        const scheme = url.split(':')[0];
        sendResponse({ error: `Cannot access internal browser page (${scheme}://). Use open_url or tab navigation tools first, then retry page interaction tools on a normal web page.` });
        return;
      }
      doSend(tabId);
    };
    const contentTabId = inspectedTabId ?? activePanelTabId;
    if (contentTabId) {
      chrome.tabs.get(contentTabId, (tab) => {
        if (chrome.runtime.lastError) { doSend(contentTabId); return; }
        checkAndSend(contentTabId, tab.url);
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) { sendResponse({ error: 'No active tab' }); return; }
        inspectedTabId = tabId;
        checkAndSend(tabId, tabs[0]?.url);
      });
    }
    return true;
  }

  // Proxy fetch requests (bypasses CORS)
  if (request.action === 'fetchUrl') {
    const { url, headers, method, body } = request;
    if (!url || !url.startsWith('http')) {
      sendResponse({ error: `Invalid URL: ${url}` });
      return true;
    }
    fetch(url, { method: method ?? 'GET', credentials: 'omit', headers: headers ?? {}, body: body ?? undefined })
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
            await waitForTabComplete(tabId!);
            sendResponse({ result: 'ok' });
            break;
          case 'go_forward':
            await chrome.tabs.goForward(tabId!);
            await waitForTabComplete(tabId!);
            sendResponse({ result: 'ok' });
            break;
          case 'refresh':
            await chrome.tabs.reload(tabId!);
            await waitForTabComplete(tabId!);
            sendResponse({ result: 'ok' });
            break;
          case 'open_tab': {
            // Hide scan effect on the current page before switching to new tab
            if (inspectedTabId) {
              chrome.tabs.sendMessage(inspectedTabId, { action: 'hideBorderFx' }).catch(() => {});
            }
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
            if (tab.id !== undefined) {
              inspectedTabId = tab.id;
              if (activeSessionId) {
                const existing = sessionAiTabs.get(activeSessionId) ?? [];
                sessionAiTabs.set(activeSessionId, [...existing, tab.id]);
                pushAiTabsUpdate(activeSessionId);
              }
              await waitForTabComplete(tab.id);
              // Push update again after load so tab title is populated
              if (activeSessionId) pushAiTabsUpdate(activeSessionId);
            }
            sendResponse({ result: `Opened tab ${tab.id}${input.url ? ` at ${input.url}` : ''}` });
            break;
          }
          case 'close_tab': {
            const closeId = (input.tab_id as number | undefined) ?? tabId!;
            await chrome.tabs.remove(closeId);
            if (activeSessionId) {
              const existing = sessionAiTabs.get(activeSessionId) ?? [];
              sessionAiTabs.set(activeSessionId, existing.filter((id) => id !== closeId));
              pushAiTabsUpdate(activeSessionId);
            }
            sendResponse({ result: `Closed tab ${closeId}` });
            break;
          }
          case 'switch_tab': {
            const switchId = input.tab_id as number;
            await chrome.tabs.update(switchId, { active: true });
            inspectedTabId = switchId;
            await waitForTabComplete(switchId);
            sendResponse({ result: `Switched to tab ${switchId}` });
            break;
          }
          case 'list_tabs': {
            const tabs = await chrome.tabs.query({});
            const list = tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }));
            sendResponse({ result: JSON.stringify(list) });
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

  if (request.action === 'executeScript') {
    const resolvedTabId = inspectedTabId ?? activePanelTabId;
    const doExec = async (tabId: number) => {
      // Use CDP Runtime.evaluate to bypass page CSP entirely
      try {
        await new Promise<void>((res) => {
          chrome.debugger.attach({ tabId }, '1.3', () => { chrome.runtime.lastError; res(); });
        });
        // Wrap in IIFE so bare `return` statements are valid
        const expr = `(function(){ ${request.code} })()`;
        const cdpResult = await sendCommand(tabId, 'Runtime.evaluate', {
          expression: expr,
          returnByValue: true,
          awaitPromise: true,
          userGesture: true,
        }) as { result?: { type?: string; value?: unknown; description?: string }; exceptionDetails?: { text?: string; exception?: { description?: string; value?: string }; stackTrace?: unknown } };
        if (cdpResult.exceptionDetails) {
          const msg = cdpResult.exceptionDetails.exception?.description ?? cdpResult.exceptionDetails.exception?.value ?? cdpResult.exceptionDetails.text ?? 'Script error';
          const isCSP = msg.includes('EvalError') || msg.includes('Content Security Policy') || msg.includes('unsafe-eval');
          sendResponse({ error: isCSP ? `execute_js blocked by page CSP (unsafe-eval not allowed). Use get_full_page_html, click_element, fill_input, or modify_element instead.` : `execute_js threw an exception: ${msg}` });
        } else {
          const val = cdpResult.result?.value;
          const type = cdpResult.result?.type;
          if (type === 'undefined') sendResponse({ result: '__undefined__' });
          else if (val === null) sendResponse({ result: '__null__' });
          else sendResponse({ result: val });
        }
      } catch (e) {
        // CDP unavailable — inform AI to use DOM-based tools instead
        const errMsg = e instanceof Error ? e.message : String(e);
        sendResponse({ error: `execute_js unavailable (debugger attach failed: ${errMsg}). Use get_full_page_html, click_element, fill_input, or modify_element instead.` });
      }
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

  // CDP-based hover: uses debugger protocol so hover works even when page is unfocused
  if (request.action === 'cdpHover') {
    const tabId = inspectedTabId ?? activePanelTabId;
    if (!tabId) { sendResponse({ error: 'No active tab' }); return false; }
    (async () => {
      try {
        // Attach debugger if not already attached
        await new Promise<void>((res, rej) => {
          chrome.debugger.attach({ tabId }, '1.3', () =>
            chrome.runtime.lastError ? res() : res()
          );
        });
        const { x, y } = request as { x: number; y: number };
        const base = { x, y, modifiers: 0, button: 'none' as const, clickCount: 0, deltaX: 0, deltaY: 0 };
        await sendCommand(tabId, 'Input.dispatchMouseEvent', { ...base, type: 'mouseMoved' });
        sendResponse({ result: 'ok' });
      } catch (err) {
        sendResponse({ error: (err as Error).message });
      }
    })();
    return true;
  }

  if (request.action === 'openUrl') {
    const resolvedTabId = inspectedTabId ?? activePanelTabId;
    const doOpen = (tabId: number) => {
      chrome.tabs.update(tabId, { url: request.url }, async () => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        inspectedTabId = tabId;
        await waitForTabComplete(tabId);
        sendResponse({});
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
