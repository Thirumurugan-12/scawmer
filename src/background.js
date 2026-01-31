import Client from './client.js';
import { browserAPI, openSidePanel, getBrowserType, toggleSidebar } from './utils.js';

const rateLimiter = {
  lastRequest: 0,
  minDelay: 1000, // 1 second between requests
  pendingRequests: new Map()
};

async function sendToAPI(content) {
  // Check if this exact request is already pending
  const requestKey = content.trim();
  if (rateLimiter.pendingRequests.has(requestKey)) {
    return rateLimiter.pendingRequests.get(requestKey);
  }

  // Implement rate limiting
  const now = Date.now();
  if (now - rateLimiter.lastRequest < rateLimiter.minDelay) {
    return { success: false, error: 'Please wait a moment before sending another request.' };
  }
  rateLimiter.lastRequest = now;

  // Create a new promise for this request
  const requestPromise = (async () => {
    try {
      const settings = await browserAPI.storage.sync.get(['apiType', 'apiUrl', 'apiToken', 'modelName', 'maxTokens']);

      let apiUrl = settings.apiUrl;
      if (settings.apiType === 'huggingface') {
        if (!settings.modelName) {
          throw new Error('Model name is not configured. Please open settings and configure the model name.');
        }
        apiUrl = `https://api-inference.huggingface.co/models/${settings.modelName}`;
      } else if (!apiUrl) {
        throw new Error('API URL is not configured. Please open settings and configure the API URL.');
      }

      if (!content.trim()) {
        throw new Error('Please enter some text to process.');
      }

      const client = new Client({
        apiKey: settings.apiToken,
        baseURL: apiUrl
      });

      const chatCompletion = await client.chat.completions.create({
        model: settings.modelName || 'meta-llama/Llama-2-7b-chat',
        messages: [{ role: "user", content: content }],
        max_tokens: parseInt(settings.maxTokens) || 500
      });

      if (!chatCompletion.choices?.[0]?.message) {
        throw new Error('Invalid response from API. Please check your settings and try again.');
      }

      return { success: true, message: chatCompletion.choices[0].message.content.trim() };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      // Clean up the pending request
      rateLimiter.pendingRequests.delete(requestKey);
    }
  })();

  // Store the promise in pending requests
  rateLimiter.pendingRequests.set(requestKey, requestPromise);
  return requestPromise;
}

// Use a single message listener
const messageHandler = (request, sender, sendResponse) => {
  if (request.action === 'sendToAPI') {
    sendToAPI(request.content)
      .then(sendResponse)
      .catch(error => {
        sendResponse({
          success: false,
          error: error.message || 'API request failed'
        });
      });
    return true; // Required for async response
  }

  if (request.action === 'capture_screenshot') {
    browserAPI.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (browserAPI.runtime.lastError) {
        console.error('Screenshot failed:', browserAPI.runtime.lastError);
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `scam-evidence-${timestamp}.png`;

      try {
        browserAPI.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: false
        });
      } catch (e) {
        console.error("Download failed", e);
      }
    });
    return true;
  }
};

// Remove any existing listeners and add the new one
browserAPI.runtime.onMessage.removeListener(messageHandler);
browserAPI.runtime.onMessage.addListener(messageHandler);

// Add settings change listener
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    // Broadcast settings changes to all open tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        try {
          chrome.tabs.sendMessage(tab.id, {
            action: 'settingsUpdated',
            changes
          });
        } catch (error) {
          console.debug('Could not send to tab:', tab.id);
        }
      });
    });
  }
});

// Handle extension icon click to open sidebar
browserAPI.action.onClicked.addListener(async (tab) => {
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
    return; // Can't open on browser internal URLs
  }

  try {
    await openSidePanel(tab);
  } catch (error) {
    console.error('Failed to open panel:', error);
    // Fallback to opening as a popup if side panel fails
    browserAPI.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 400,
      height: 600
    });
  }
});

// Handle browser action click
if (getBrowserType() === 'firefox') {
  browser.browserAction.onClicked.addListener(async () => {
    try {
      // Use direct sidebar action
      const currentWindow = await browser.windows.getCurrent();
      await browser.sidebarAction.close();
      await new Promise(resolve => setTimeout(resolve, 250));
      await browser.sidebarAction.open({ windowId: currentWindow.id });
    } catch (error) {
      console.error('Failed to toggle sidebar:', error);
      browser.windows.create({
        url: 'popup.html',
        type: 'popup',
        width: 400,
        height: 600
      });
    }
  });
} else {
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
      await openSidePanel(tab);
    }
  });
}

// Initialize sidebar on install for Firefox
if (getBrowserType() === 'firefox') {
  browser.runtime.onInstalled.addListener(() => {
    browser.sidebarAction.open();
  });
}