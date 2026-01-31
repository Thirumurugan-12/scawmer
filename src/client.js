import { getToken } from './utils.js';

class Client {
  constructor(config) {
    this.baseURL = config.baseURL;
    this.apiType = config.apiType || 'custom';
    this.chat = {
      completions: {
        create: this.createChatCompletion.bind(this)
      }
    };
  }

  async createChatCompletion(params) {
    const token = await getToken();
    if (!token) {
      throw new Error('API token not found');
    }

    const base = this.baseURL.replace(/\/+$/, '');
    let url = `${base}/v1/chat/completions`;
    const body = {
      model: params.model,
      messages: params.messages,
      max_tokens: params.max_tokens
    };

    if (this.apiType === 'ollama') {
      url = `${base}/api/chat`;
      Object.assign(body, { stream: false, options: { num_predict: params.max_tokens } });
      delete body.max_tokens;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token && this.apiType !== 'ollama') {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Omit 'Origin' header for ollama
    if (this.apiType === 'ollama' && headers['Origin']) {
      delete headers['Origin'];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let message = `API request failed with status ${response.status}`;
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errData = await response.json();
          message = errData.error?.message || JSON.stringify(errData);
        } else {
          message = await response.text();
        }
      } catch (err) {
        message += `. Additionally, failed to parse error response: ${err}`;
      }

      if (this.apiType === 'ollama' && response.status === 403) {
        message = `Request failed with status 403. Ensure Ollama is running with --cors. Raw response: ${message}`;
      }
      throw new Error(message);
    }

    const data = await response.json();
    if (this.apiType === 'ollama') {
      return { choices: [{ message: data.message }] };
    }
    return data;
  }
}

export default Client;
