import { browserAPI } from './utils.js';

// Global state
const state = {
  port: null,
  selectedText: '',
  pageText: ''
};

function connectToExtension() {
  // Only create connection if it doesn't exist or is disconnected
  if (!state.port || state.port.disconnected) {
    try {
      state.port = browserAPI.runtime.connect({ name: 'content-script' });
      state.port.onDisconnect.addListener(() => {
        state.port.disconnected = true;
      });
    } catch (error) {
      console.error('Connection error:', error);
    }
  }
}

function sanitizeContent(text) {
  // Remove potentially dangerous characters/scripts
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s.,!?-]/g, ' ')
    .trim();
}

function getPageContent() {
  const selectedText = window.getSelection().toString().trim();
  let content = '';

  if (selectedText) {
    state.selectedText = selectedText;
    content = selectedText;
  } else {
    content = Array.from(document.body.getElementsByTagName('*'))
      .filter(element => {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          !element.hidden;
      })
      .map(element => {
        return Array.from(element.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .join(' ');
      })
      .filter(text => text.length > 0)
      .join('\n')
      .replace(/[\s\n]+/g, ' ')
      .trim();

    state.pageText = content;
  }

  return sanitizeContent(content);
}

// Message listener
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getContent') {
    connectToExtension();
    sendResponse({ content: getPageContent() });
    return true;
  }

  // Handle WhatsApp Handoff messages
  if (window.location.hostname === 'web.whatsapp.com') {
    if (request.action === 'toggleHandoff') {
      if (window.waAutomation) {
        window.waAutomation.toggle(request.enabled, request.persona);
      }
    } else if (request.action === 'updatePersona') {
      if (window.waAutomation) {
        window.waAutomation.updatePersona(request.persona);
      }
    }
  }
});

// WhatsApp Automation Logic
class WhatsAppAutomation {
  constructor() {
    this.enabled = false;
    this.persona = "";
    this.observer = null;
    this.processing = false;
    this.lastProcessedMessage = null;

    // Selectors (Best effort, attribute based where possible)
    this.selectors = {
      // The main chat container usually has aria-label="Message list"
      // Fallback to div#main layout if specific aria-label is missing
      messageList: 'div[aria-label="Message list"], div#main div[role="region"]',

      // Incoming messages
      messageRow: 'div[role="row"]',

      // Input box - usually contenteditable
      inputBox: 'div[contenteditable="true"][data-tab="10"], #main div[contenteditable="true"]',

      // Send button
      sendButton: 'button[aria-label="Send"]',
      sendIcon: 'span[data-icon="send"]'
    };

    console.log("[WA-Auto] Initialized");
  }

  toggle(enabled, persona) {
    this.enabled = enabled;
    this.persona = persona;
    console.log(`[WA-Auto] Toggled: ${enabled}`);

    if (this.enabled) {
      this.startObservation();
    } else {
      this.stopObservation();
    }
  }

  updatePersona(persona) {
    this.persona = persona;
    console.log(`[WA-Auto] Persona updated`);
  }

  startObservation() {
    // Try to find the message list
    let list = document.querySelector(this.selectors.messageList);

    // Fallback: looking for the scrollable container in #main
    if (!list) {
      const main = document.getElementById('main');
      if (main) {
        // usually the second child or so is the message list container with tabindex=0
        list = main.querySelector('div[tabindex="0"]') || main;
      }
    }

    if (!list) {
      console.warn("[WA-Auto] Chat content not found. Please click on a contact to open a chat.");
      // Retry in a bit?
      setTimeout(() => { if (this.enabled) this.startObservation(); }, 2000);
      return;
    }

    if (this.observer) this.observer.disconnect();

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          this.handleNewMessage();
        }
      }
    });

    this.observer.observe(list, { childList: true, subtree: true });
    console.log("[WA-Auto] Listening for messages...");
  }

  stopObservation() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.processing = false;
  }

  async handleNewMessage() {
    if (this.processing) return;

    // Slight delay to let DOM settle
    await new Promise(r => setTimeout(r, 1000));

    // Get last message
    const rows = document.querySelectorAll(this.selectors.messageRow);
    if (rows.length === 0) return;

    const lastRow = rows[rows.length - 1];

    // Check if it's incoming (not sent by me)
    // "message-out" is usually my message, "message-in" is theirs.
    // If specific classes aren't reliable, check for specific "data-id" formats or alignment.
    // Let's look for "message-in" class inside the row.
    const isIncoming = lastRow.querySelector('.message-in') !== null;

    if (!isIncoming) {
      console.log("[WA-Auto] Last message is outgoing, ignoring.");
      return;
    }

    // Extract text
    const textSpan = lastRow.querySelector('span.selectable-text');
    if (!textSpan) return;

    const text = textSpan.innerText.trim();
    if (!text) return;

    // Prevent re-processing
    // Simple checksum or ID check if available
    if (this.lastProcessedMessage === text) {
      return;
    }

    this.processing = true;
    this.lastProcessedMessage = text;
    console.log(`[WA-Auto] New message received: ${text}`);

    await this.processMessage(text);

    this.processing = false;
  }

  async processMessage(text) {
    // 1. Check Keywords for Screenshot
    const keywords = ["qr", "code", "scan", "payment", "address", "photo", "pic", "image"];
    const lowerText = text.toLowerCase();

    if (keywords.some(k => lowerText.includes(k))) {
      console.log("[WA-Auto] Keyword detected, taking screenshot...");
      await browserAPI.runtime.sendMessage({ action: 'capture_screenshot' });
    }

    // 2. Random Delay (mimic reading/thinking)
    const delay = Math.floor(Math.random() * 3000) + 2000;
    await new Promise(r => setTimeout(r, delay));

    // 3. Generate Reply
    // Construct prompt with Persona
    const prompt = `System: ${this.persona}\n\nUser: ${text}\n\nReply as the persona. Keep it short and conversational.`;

    try {
      const response = await browserAPI.runtime.sendMessage({
        action: 'sendToAPI',
        content: prompt
      });

      if (response && response.success) {
        await this.sendReply(response.message);
      } else {
        console.error("[WA-Auto] LLM generation failed", response);
      }
    } catch (e) {
      console.error("[WA-Auto] Error generating reply", e);
    }
  }

  async sendReply(text) {
    console.log(`[WA-Auto] Replying: ${text}`);

    const input = document.querySelector(this.selectors.inputBox);
    if (!input) {
      console.error("[WA-Auto] Input box not found");
      return;
    }

    // Focus and simulate typing
    input.focus();

    // React input simulation is tricky. 
    // Usually execCommand 'insertText' works best for contenteditable.
    document.execCommand('insertText', false, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Wait a bit
    await new Promise(r => setTimeout(r, 500));

    // Click Send
    // Try multiple selectors
    let sendBtn = document.querySelector('span[data-icon="send"]');
    if (!sendBtn) sendBtn = document.querySelector('button[aria-label="Send"]');

    // Sometimes the icon is inside a button
    if (sendBtn && sendBtn.tagName === 'SPAN') {
      sendBtn = sendBtn.closest('button');
    }

    if (sendBtn) {
      sendBtn.click();
    } else {
      console.log("[WA-Auto] Send button not found, trying Enter key");
      // Fallback: Dispatch Enter key
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        keyCode: 13,
        which: 13,
        key: 'Enter'
      });
      input.dispatchEvent(event);
    }
  }
}

// Initialize on WhatsApp Web
if (window.location.hostname === 'web.whatsapp.com') {
  window.waAutomation = new WhatsAppAutomation();
}