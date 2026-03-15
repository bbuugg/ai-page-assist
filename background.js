chrome.action.onClicked.addListener((tab) => {
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    console.error("Cannot run extension on internal browser pages.");
    return;
  }
  
  chrome.tabs.sendMessage(tab.id, { action: "toggleOverlay" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      // Fallback: execute script if content script wasn't injected automatically (e.g. extension just installed)
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).then(() => {
        chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });
        // We'll trust the injected script to create the UI when it loads, 
        // or we can send the message again.
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: "toggleOverlay" });
        }, 100);
      });
    }
  });
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "inspectElement") {
    const tabId = sender.tab.id;
    const { x, y } = request;

    chrome.debugger.attach({ tabId }, "1.3", async () => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }

      try {
        await sendCommand(tabId, "DOM.enable");
        await sendCommand(tabId, "CSS.enable");
        // Initialize the DOM agent's node tree before querying by location
        await sendCommand(tabId, "DOM.getDocument");

        // Use nodeId for the current operation, but return backendNodeId for persistence
        const { nodeId: rawNodeId, backendNodeId } = await sendCommand(tabId, "DOM.getNodeForLocation", { x, y });

        // nodeId can be 0 if the node isn't yet resolved; push via backendNodeId to get a valid nodeId
        let nodeId = rawNodeId;
        if (!nodeId && backendNodeId) {
          const { nodeIds } = await sendCommand(tabId, "DOM.pushNodesByBackendIdsToFrontend", {
            backendNodeIds: [backendNodeId]
          });
          nodeId = nodeIds[0];
        }

        if (!nodeId) {
          throw new Error("Could not resolve node at the given location.");
        }

        // If the resolved node is a text node (nodeType 3), move up to the parent element
        // because CSS.getMatchedStylesForNode only works on element nodes
        const nodeDesc = await sendCommand(tabId, "DOM.describeNode", { nodeId });
        if (nodeDesc.node && nodeDesc.node.nodeType === 3 && nodeDesc.node.parentId) {
          nodeId = nodeDesc.node.parentId;
        }

        // 2. Get HTML
        const { outerHTML } = await sendCommand(tabId, "DOM.getOuterHTML", { nodeId });

        // 3. Get Styles
        const matchedStyles = await sendCommand(tabId, "CSS.getMatchedStylesForNode", { nodeId });
        const formattedCSS = formatCDPStyles(matchedStyles);

        sendResponse({ html: outerHTML, css: formattedCSS, backendNodeId: backendNodeId });
      } catch (err) {
        sendResponse({ error: err.message });
      } finally {
        chrome.debugger.detach({ tabId });
      }
    });

    return true; 
  }

  if (request.action === "saveChanges") {
    const tabId = sender.tab.id;
    const { backendNodeId, type, value } = request;

    chrome.debugger.attach({ tabId }, "1.3", async () => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }

      try {
        await sendCommand(tabId, "DOM.enable");
        // Must call getDocument once to initialize the DOM agent for this session
        await sendCommand(tabId, "DOM.getDocument");
        
        // Push the backendNodeId to obtain a valid nodeId for the current debugger session
        const { nodeIds } = await sendCommand(tabId, "DOM.pushNodesByBackendIdsToFrontend", { 
          backendNodeIds: [backendNodeId] 
        });
        const nodeId = nodeIds[0];

        if (!nodeId) {
          throw new Error("Node no longer exists in current page context.");
        }
        
        if (type === 'html') {
          await sendCommand(tabId, "DOM.setOuterHTML", { nodeId, outerHTML: value });
          sendResponse({ success: true });
        } else if (type === 'css') {
          const cleanStyle = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
          let styleContent = cleanStyle;
          if (cleanStyle.includes('{')) {
            styleContent = cleanStyle.substring(cleanStyle.indexOf('{') + 1, cleanStyle.lastIndexOf('}')).trim();
          }
          
          await sendCommand(tabId, "DOM.setAttributeValue", { 
            nodeId, 
            name: "style", 
            value: styleContent 
          });
          sendResponse({ success: true });
        }
      } catch (err) {
        sendResponse({ error: err.message });
      } finally {
        chrome.debugger.detach({ tabId });
      }
    });

    return true;
  }
});

function sendCommand(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

function formatCDPStyles(matchedStyles) {
  let cssText = '';

  // Helper: extract text from a CSSStyle object (prefer cssText, fallback to cssProperties)
  function styleText(style) {
    if (!style) return '';
    if (style.cssText && style.cssText.trim()) return formatCSSString(style.cssText);
    if (style.cssProperties && style.cssProperties.length) {
      return style.cssProperties
        .filter(p => p.name && p.value && !p.disabled)
        .map(p => '  ' + p.name + ': ' + p.value + ';')
        .join('\n');
    }
    return '';
  }

  // 1. Inline styles
  const inlineText = styleText(matchedStyles.inlineStyle);
  if (inlineText) {
    cssText += '/* Inline Styles */\nelement.style {\n' + inlineText + '\n}\n\n';
  }

  // 2. HTML attribute styles (e.g. width="100" height="50" on <img>)
  const attrText = styleText(matchedStyles.attributesStyle);
  if (attrText) {
    cssText += '/* HTML Attribute Styles */\nelement[attributes] {\n' + attrText + '\n}\n\n';
  }

  // 3. Matched class/id/tag rules
  if (matchedStyles.matchedCSSRules && matchedStyles.matchedCSSRules.length) {
    cssText += '/* Matched Rules */\n';
    matchedStyles.matchedCSSRules.forEach(match => {
      const rule = match.rule;
      if (!rule || !rule.selectorText) return;
      if (rule.selectorText.includes('.ai-extension')) return;
      const text = styleText(rule.style);
      if (text) cssText += `${rule.selectorText} {\n${text}\n}\n\n`;
    });
  }

  // 4. Inherited styles
  if (matchedStyles.inherited && matchedStyles.inherited.length) {
    cssText += '/* Inherited Styles */\n';
    matchedStyles.inherited.forEach(entry => {
      if (entry.matchedCSSRules) {
        entry.matchedCSSRules.forEach(match => {
          const rule = match.rule;
          if (!rule || !rule.selectorText) return;
          if (rule.selectorText.includes('.ai-extension')) return;
          const text = styleText(rule.style);
          if (text) cssText += `${rule.selectorText} {\n${text}\n}\n\n`;
        });
      }
    });
  }

  // 5. Pseudo-element styles
  if (matchedStyles.pseudoElements && matchedStyles.pseudoElements.length) {
    cssText += '/* Pseudo-element Styles */\n';
    matchedStyles.pseudoElements.forEach(pseudo => {
      const pseudoType = pseudo.pseudoType || '';
      if (pseudo.matches) {
        pseudo.matches.forEach(match => {
          const rule = match.rule;
          if (!rule || !rule.selectorText) return;
          const text = styleText(rule.style);
          if (text) cssText += `${rule.selectorText}::${pseudoType} {\n${text}\n}\n\n`;
        });
      }
    });
  }

  return cssText.trim();
}

function formatCSSString(cssText) {
  return cssText.split(';').filter(s => s.trim()).map(s => '  ' + s.trim() + ';').join('\n');
}
