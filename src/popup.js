import { browserAPI, getBrowserType, injectContentScript, saveToken } from './utils.js';

if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  // We're in Chrome, the polyfill script will handle this
  console.debug('Loading in Chrome mode');
}

import hljs from 'highlight.js';
import { marked } from 'marked';
import 'highlight.js/styles/github.css';
import 'remixicon/fonts/remixicon.css';
import './input.css';

// Add at the beginning after imports
async function initializeTheme() {
  const { theme } = await browserAPI.storage.sync.get(['theme']);
  applyTheme(theme || 'light');
}

function applyTheme(theme) {
  if (theme === 'system') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } else if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// Add settings panel handling
function toggleSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  panel.classList.toggle('hidden');
}

// Update the default prompts
const defaultPrompts = {
  proofread: "Please proofread this text:",
  summarize: "Please summarize this text:",
  rewrite: "Please rewrite this text:",
  makeList: "Please convert this text into a bullet point list:"
};

// Modify loadSettings to include apiType
async function loadSettings() {
  const settings = await browserAPI.storage.sync.get({
    apiType: 'custom',
    apiUrl: 'http://localhost:11434',
    apiToken: '',
    modelName: 'meta-llama/Llama-2-7b-chat',
    maxTokens: 500,
    theme: 'light',
    proofreadPrompt: defaultPrompts.proofread,
    summarizePrompt: defaultPrompts.summarize,
    rewritePrompt: defaultPrompts.rewrite,
    rewritePrompt: defaultPrompts.rewrite,
    makeListPrompt: defaultPrompts.makeList,
    handoffEnabled: false,
    systemPersona: "You are a gullible elderly person who is confused but trying to help."
  });

  // Populate form fields
  document.getElementById('apiType').value = settings.apiType;
  document.getElementById('apiUrl').value = settings.apiUrl;
  document.getElementById('apiToken').value = settings.apiToken;
  document.getElementById('modelName').value = settings.modelName;
  document.getElementById('maxTokens').value = settings.maxTokens;
  document.getElementById('theme').value = settings.theme;

  // Show/hide API URL based on API type
  const customApiSection = document.getElementById('customApiSection');
  customApiSection.style.display = settings.apiType !== 'huggingface' ? 'block' : 'none';

  // Populate prompt fields
  document.getElementById('proofreadPrompt').value = settings.proofreadPrompt || defaultPrompts.proofread;
  document.getElementById('summarizePrompt').value = settings.summarizePrompt || defaultPrompts.summarize;
  document.getElementById('rewritePrompt').value = settings.rewritePrompt || defaultPrompts.rewrite;
  document.getElementById('makeListPrompt').value = settings.makeListPrompt || defaultPrompts.makeList;

  // Handoff Settings
  const handoffToggle = document.getElementById('handoffToggle');
  const systemPersona = document.getElementById('systemPersona');
  const handoffControls = document.getElementById('handoffControls');
  const handoffStatus = document.getElementById('handoffStatus');

  if (handoffToggle) {
    handoffToggle.checked = settings.handoffEnabled;
    if (settings.handoffEnabled) {
      handoffControls.classList.remove('hidden');
      handoffStatus.textContent = "Scanning..."; // Initial state
      handoffStatus.className = "px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    } else {
      handoffControls.classList.add('hidden');
      handoffStatus.textContent = "Disabled";
      handoffStatus.className = "px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 dark:bg-dark-surface-200 dark:text-dark-surface-400";
    }
  }

  if (systemPersona) {
    systemPersona.value = settings.systemPersona || "You are a gullible elderly person who is confused but trying to help.";
  }

  applyTheme(settings.theme);
}

// Add API type change handler
function handleApiTypeChange(event) {
  const customApiSection = document.getElementById('customApiSection');
  customApiSection.style.display = event.target.value !== 'huggingface' ? 'block' : 'none';
}

// Modify handleSaveSettings to handle API type
async function handleSaveSettings() {
  const saveButton = document.getElementById('saveSettings');
  const saveMessage = document.getElementById('saveMessage');

  saveButton.disabled = true;
  saveMessage.classList.remove('hidden');

  try {
    const apiType = document.getElementById('apiType').value;
    const modelName = document.getElementById('modelName').value.trim();
    const apiToken = document.getElementById('apiToken').value.trim();
    const maxTokens = parseInt(document.getElementById('maxTokens').value);
    const theme = document.getElementById('theme').value;

    // Determine API URL based on type
    let apiUrl;
    if (apiType === 'custom') {
      apiUrl = document.getElementById('apiUrl').value.trim();
      if (!apiUrl) throw new Error('API URL is required for custom API');
    } else if (apiType === 'ollama') {
      apiUrl = document.getElementById('apiUrl').value.trim();
      if (!apiUrl) apiUrl = 'http://localhost:11434';
    } else {
      // For Hugging Face, construct the URL using the model name
      if (!modelName) throw new Error('Model name is required for Hugging Face API');
      apiUrl = `https://api-inference.huggingface.co/models/${modelName}`;
    }

    // Validate
    if ((apiType === 'custom' || apiType === 'ollama') && !apiUrl) throw new Error('API URL is required');
    if (!maxTokens || maxTokens < 1 || maxTokens > 2048) {
      throw new Error('Max tokens must be between 1 and 2048');
    }

    // Save token separately using encryption
    if (apiToken) {
      await saveToken(apiToken);
    }

    // Get prompt values from form
    const proofreadPrompt = document.getElementById('proofreadPrompt').value;
    const summarizePrompt = document.getElementById('summarizePrompt').value;
    const rewritePrompt = document.getElementById('rewritePrompt').value;
    const makeListPrompt = document.getElementById('makeListPrompt').value;

    // Save settings including prompts
    await browserAPI.storage.sync.set({
      apiType,
      apiUrl,
      modelName,
      maxTokens,
      theme,
      proofreadPrompt,
      summarizePrompt,
      rewritePrompt,
      rewritePrompt,
      makeListPrompt,
      handoffEnabled: document.getElementById('handoffToggle')?.checked || false,
      systemPersona: document.getElementById('systemPersona')?.value || ""
    });

    saveMessage.textContent = 'Settings saved successfully';
    saveMessage.classList.remove('text-red-600');
    saveMessage.classList.add('text-green-600');

    setTimeout(() => {
      document.getElementById('settingsPanel').classList.add('hidden');
      saveButton.disabled = false;
      saveMessage.classList.add('hidden');
    }, 750);

    updateFooterInfo();
    applyTheme(theme);

  } catch (error) {
    console.error('Save error:', error);
    saveMessage.textContent = error.message;
    saveMessage.classList.remove('text-green-600');
    saveMessage.classList.add('text-red-600');
    saveButton.disabled = false;
  }
}

// Configure marked with highlight.js
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false
});

// Initialize highlight.js
hljs.configure({
  ignoreUnescapedHTML: true,
  throwUnescapedHTML: false
});

let lastContent = '';
let pollInterval = null;

async function pollForContentChanges() {
  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
      return;
    }

    const response = await browserAPI.tabs.sendMessage(tab.id, {
      action: 'getContent'
    }).catch(() => null);

    if (response) {
      const newContent = response.content;
      if (newContent && newContent !== lastContent) {
        lastContent = newContent;
        document.getElementById('content').value = newContent;
      }
    }
  } catch (error) {
    console.error('Polling error:', error);
  }
}

async function loadTabContent() {
  const loading = document.getElementById('loading');
  const content = document.getElementById('content');

  loading.classList.remove('hidden');
  content.value = '';

  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
      content.value = "Cannot access this page's content.";
      return;
    }

    // Inject content script
    await injectContentScript(tab.id);

    // Short delay to ensure content script is ready
    await new Promise(resolve => setTimeout(resolve, 100));

    const response = await browserAPI.tabs.sendMessage(tab.id, {
      action: 'getContent'
    }).catch(err => {
      console.error('Message error:', err);
      return { content: 'Could not get page content. Please try refreshing the page.' };
    });

    content.value = response.content;
    lastContent = response.content;

    if (pollInterval) {
      clearInterval(pollInterval);
    }

    pollInterval = setInterval(pollForContentChanges, 1000);

  } catch (error) {
    console.error('Error:', error);
    content.value = 'Could not get page content. Please try refreshing the page.';
  } finally {
    loading.classList.add('hidden');
  }
}

// Add missing handlers
async function handleQuickAction() {
  const loading = document.getElementById('loading');
  const responseArea = document.getElementById('response');
  const content = document.getElementById('content').value;

  if (!loading || !responseArea || !content) {
    console.error('Required elements not found');
    return;
  }

  loading.classList.remove('hidden');
  responseArea.textContent = '';

  try {
    const settings = await browserAPI.storage.sync.get({
      proofreadPrompt: defaultPrompts.proofread,
      summarizePrompt: defaultPrompts.summarize,
      rewritePrompt: defaultPrompts.rewrite,
      makeListPrompt: defaultPrompts.makeList
    });

    const action = this.dataset.action;
    const promptKey = `${action}Prompt`;
    const promptText = String(settings[promptKey] || defaultPrompts[action]);

    // Send the prompt + content to the API
    const result = await browserAPI.runtime.sendMessage({
      action: 'sendToAPI',
      content: `${promptText} ${content}`
    });

    if (browserAPI.runtime.lastError) {
      throw new Error(browserAPI.runtime.lastError.message);
    }

    displayResponse(result);
  } catch (error) {
    console.error('Communication error:', error);
    displayResponse({
      success: false,
      error: error.message || 'Failed to communicate with extension. Please try reloading.'
    });
  } finally {
    loading.classList.add('hidden');
  }
}

async function handleSendToChat() {
  const loading = document.getElementById('loading');
  const responseArea = document.getElementById('response');
  const content = document.getElementById('content');
  const question = document.getElementById('question');

  if (!loading || !responseArea || !content || !question) {
    console.error('Required elements not found');
    return;
  }

  loading.classList.remove('hidden');
  responseArea.textContent = '';

  try {
    const result = await browserAPI.runtime.sendMessage({
      action: 'sendToAPI',
      content: `Context: ${content.value}\n\nQuestion: ${question.value}`
    });

    if (browserAPI.runtime.lastError) {
      throw new Error(browserAPI.runtime.lastError.message);
    }

    displayResponse(result);
  } catch (error) {
    console.error('Communication error:', error);
    displayResponse({
      success: false,
      error: error.message || 'Failed to communicate with extension. Please try reloading.'
    });
  } finally {
    loading.classList.add('hidden');
  }
}

function handleCopyToClipboard() {
  const responseContent = document.getElementById('responseContent');
  if (responseContent && responseContent.textContent.trim()) {
    navigator.clipboard.writeText(responseContent.textContent.trim()).then(() => {
      console.log('Content copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy content:', err);
    });
  }
}

// Clear UI state when changing tabs
function clearUIState() {
  const question = document.getElementById('question');
  const responseArea = document.getElementById('response');
  const clearQuestion = document.getElementById('clearQuestion');
  const sendToChat = document.getElementById('sendToChat');

  if (question) question.value = '';
  if (responseArea) responseArea.innerHTML = '<div id="responseContent"></div>';
  if (clearQuestion) clearQuestion.classList.add('hidden');
  if (sendToChat) sendToChat.disabled = true;
}

// Modify tab listeners to include clearing UI state
browserAPI.tabs.onActivated.addListener(() => {
  clearUIState();
  loadTabContent();
});

browserAPI.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    clearUIState();
    loadTabContent();
  }
});

function displayResponse(response) {
  // First ensure response area exists, if not initialize it
  if (!document.getElementById('response')) {
    initializeResponseArea();
  }

  const responseArea = document.getElementById('response');
  if (!responseArea) {
    console.error('Failed to initialize response area');
    return;
  }

  // Ensure child elements exist
  if (!responseArea.querySelector('#responseContent')) {
    const content = document.createElement('div');
    content.id = 'responseContent';
    responseArea.appendChild(content);
  }

  const responseContent = document.getElementById('responseContent');
  const copyButton = document.getElementById('copyToClipboard');

  responseArea.classList.remove('hidden');

  if (!response.success) {
    responseContent.innerHTML = `<div class="error-message">❌ ${response.error.trim()}</div>`;
    return;
  }

  try {
    if (typeof marked === 'undefined') {
      responseContent.innerHTML = `<div class="text-content">${response.message.trim().replace(/\n/g, '<br>')}</div>`;
      return;
    }

    let htmlContent = marked.parse(response.message.trim());
    responseContent.innerHTML = htmlContent;

    if (typeof hljs !== 'undefined') {
      responseContent.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }

  } catch (error) {
    console.error('Response processing error:', error);
    responseContent.textContent = response.message;
  }

  if (responseContent.textContent.trim()) {
    copyButton.disabled = false;
  } else {
    copyButton.disabled = true;
  }
}

function initializeResponseArea() {
  let responseArea = document.getElementById('response');

  // If response area doesn't exist, create it
  if (!responseArea) {
    responseArea = document.createElement('div');
    responseArea.id = 'response';
    responseArea.className = 'bg-white/50 rounded-lg border border-surface-200/75 p-3 overflow-y-auto shadow-sm relative min-h-[100px]';
    document.querySelector('.container')?.appendChild(responseArea);
  }

  // Clear existing content and maintain structure
  responseArea.innerHTML = `<div id="responseContent"></div>`;

  return responseArea;
}

// Add cleanup when popup closes
window.addEventListener('unload', () => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});

// Add system theme change listener
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
  const { theme } = await browserAPI.storage.sync.get(['theme']);
  if (theme === 'system') {
    applyTheme('system');
  }
});

// Make updateFooterInfo more robust
async function updateFooterInfo() {
  try {
    const settings = await browserAPI.storage.sync.get(['apiUrl', 'modelName']);
    console.log('Footer info update:', settings);

    const apiUrlDisplay = document.getElementById('apiUrlDisplay');
    const modelNameDisplay = document.getElementById('modelNameDisplay');

    if (apiUrlDisplay) {
      const displayUrl = settings.apiUrl || 'API URL not set';
      apiUrlDisplay.textContent = displayUrl;
      apiUrlDisplay.title = displayUrl;
    }

    if (modelNameDisplay) {
      const displayModel = settings.modelName || 'meta-llama/Llama-2-7b-chat';
      modelNameDisplay.textContent = displayModel;
      modelNameDisplay.title = displayModel;
    }
  } catch (error) {
    console.error('Failed to update footer info:', error);
  }
}

// Listen for settings changes from any source
browserAPI.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    // Update theme if it changed
    if (changes.theme) {
      applyTheme(changes.theme.newValue);
    }

    // Update footer info if relevant settings changed
    if (changes.apiUrl || changes.modelName) {
      updateFooterInfo();
    }
  }
});

// Also listen for direct messages from settings page
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    updateFooterInfo();
    if (message.settings.theme) {
      applyTheme(message.settings.theme);
    }
  }
});

// Update the settings change listener
browserAPI.runtime.onMessage.addListener((message) => {
  if (message.action === 'settingsUpdated') {
    console.log('Settings updated:', message.settings);
    updateFooterInfo();
    if (message.settings.theme) {
      applyTheme(message.settings.theme);
    }
    return true;
  }
});

function initializeSettings() {
  const settingsButton = document.getElementById('toggleSettings');
  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettings = document.getElementById('closeSettings');
  const saveSettingsButton = document.getElementById('saveSettings');
  const toggleToken = document.getElementById('toggleToken');
  const apiToken = document.getElementById('apiToken');

  if (settingsButton && settingsPanel) {
    // Remove any existing listeners first
    settingsButton.replaceWith(settingsButton.cloneNode(true));

    // Get the fresh reference after replacing
    const newSettingsButton = document.getElementById('toggleSettings');

    // Add new click listener
    newSettingsButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      settingsPanel.classList.toggle('hidden');
    });
  }

  if (closeSettings) {
    closeSettings.addEventListener('click', () => {
      settingsPanel.classList.add('hidden');
    });
  }

  if (toggleToken && apiToken) {
    toggleToken.addEventListener('click', () => {
      const isPassword = apiToken.type === 'password';
      apiToken.type = isPassword ? 'text' : 'password';
      toggleToken.innerHTML = `<i class="ri-eye${isPassword ? '-off-' : '-'}line"></i>`;
    });
  }

  if (saveSettingsButton) {
    // Remove any existing listeners
    saveSettingsButton.replaceWith(saveSettingsButton.cloneNode(true));

    // Get fresh reference and add listener
    document.getElementById('saveSettings').addEventListener('click', handleSaveSettings);
  }

  // Add API type change listener
  const apiTypeSelect = document.getElementById('apiType');
  if (apiTypeSelect) {
    apiTypeSelect.addEventListener('change', handleApiTypeChange);
  }

  // Handoff Toggle Listener
  const handoffToggle = document.getElementById('handoffToggle');
  if (handoffToggle) {
    handoffToggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      const controls = document.getElementById('handoffControls');
      const status = document.getElementById('handoffStatus');

      // UI Updates
      if (enabled) {
        controls.classList.remove('hidden');
        status.textContent = "Scanning...";
        status.className = "px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      } else {
        controls.classList.add('hidden');
        status.textContent = "Disabled";
        status.className = "px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 dark:bg-dark-surface-200 dark:text-dark-surface-400";
      }

      // Save state immediately
      await browserAPI.storage.sync.set({ handoffEnabled: enabled });

      // Notify Content Script
      try {
        const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url.includes('web.whatsapp.com')) {
          // Add a simple retry mechanism or check if responsive
          const sendMessage = async (retries = 3) => {
            try {
              await browserAPI.tabs.sendMessage(tab.id, {
                action: 'toggleHandoff',
                enabled: enabled,
                persona: document.getElementById('systemPersona').value
              });
            } catch (err) {
              if (retries > 0 && err.message.includes('Receiving end does not exist')) {
                console.log("Content script not ready, retrying...");
                await new Promise(r => setTimeout(r, 500));
                await sendMessage(retries - 1);
              } else {
                throw err;
              }
            }
          };
          await sendMessage();
        }
      } catch (err) {
        console.warn('Could not notify content script:', err);
      }
    });
  }

  // Save Persona on blur
  const systemPersona = document.getElementById('systemPersona');
  if (systemPersona) {
    systemPersona.addEventListener('blur', async (e) => {
      await browserAPI.storage.sync.set({ systemPersona: e.target.value });
      // Notify Content Script of update
      try {
        const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
        const enabled = document.getElementById('handoffToggle').checked;
        if (tab && tab.url.includes('web.whatsapp.com') && enabled) {
          await browserAPI.tabs.sendMessage(tab.id, {
            action: 'updatePersona',
            persona: e.target.value
          });
        }
      } catch (err) {
        console.warn('Could not notify content script:', err);
      }
    });
  }
}

// Add to DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
  // Remove old event listeners before adding new ones
  // document.querySelectorAll('.quick[data-action]').forEach(button => {
  //   button.removeEventListener('click', handleQuickAction);
  // });

  initializeTheme();
  initializeResponseArea();
  updateFooterInfo();
  initializeSettings(); // Add this line

  // Use event delegation instead of multiple listeners
  document.addEventListener('click', (e) => {
    const quickButton = e.target.closest('.quick[data-action]');
    if (quickButton) {
      e.stopPropagation();  // Prevent event bubbling
      handleQuickAction.call(quickButton);
    }
  }, { capture: true });  // Use capture phase to handle event first

  // Initialize settings link with separate handler 
  const settingsLink = document.getElementById('settingsLink');
  if (settingsLink) {
    settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Prevent this event from being handled by quick action handlers
      e.stopPropagation();
      window.location.href = 'settings.html';
    });
  }

  // Only attach quick action handlers to buttons with .quick AND data-action
  // document.querySelectorAll('.quick[data-action]').forEach(button => {
  //   if (button) {
  //     button.addEventListener('click', handleQuickAction);
  //   }
  // });

  // Add question input validation
  const questionInput = document.getElementById('question');
  const sendToChat = document.getElementById('sendToChat');

  if (questionInput) {
    questionInput.addEventListener('input', () => {
      if (sendToChat) {
        sendToChat.disabled = !questionInput.value.trim();
      }
    });
  }

  // Initialize send to chat button
  if (sendToChat) {
    sendToChat.addEventListener('click', handleSendToChat);
  }

  // Initialize question input and clear button  
  const clearQuestion = document.getElementById('clearQuestion');

  if (clearQuestion && questionInput) {
    // Check initial state
    clearQuestion.classList.toggle('hidden', !questionInput.value.trim());
    if (sendToChat) {
      sendToChat.disabled = !questionInput.value.trim();
    }

    questionInput.addEventListener('input', () => {
      if (sendToChat) {
        sendToChat.disabled = !questionInput.value.trim();
      }
      clearQuestion.classList.toggle('hidden', !questionInput.value.trim());
    });

    clearQuestion.addEventListener('click', () => {
      questionInput.value = '';
      if (sendToChat) {
        sendToChat.disabled = true;
      }
      clearQuestion.classList.add('hidden');
    });
  }

  if (copyButton) {
    copyButton.addEventListener('click', handleCopyToClipboard);
  }

  // Analyze Screen Button
  const analyzeBtn = document.getElementById('analyzeScreen');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
      const loading = document.getElementById('loading');
      const responseArea = document.getElementById('response');

      if (!loading || !responseArea) return;

      loading.classList.remove('hidden');
      responseArea.textContent = '';

      try {
        const result = await browserAPI.runtime.sendMessage({ action: 'analyze_screen' });
        displayResponse(result);
      } catch (error) {
        console.error(error);
        displayResponse({ success: false, error: error.message });
      } finally {
        loading.classList.add('hidden');
      }
    });
  }

  // Start content loading
  loadTabContent();

  // Initialize settings
  loadSettings();
});
