/* ===== LUMEN PDF STORE — IndexedDB layer for PDF blobs ===== */
const PdfStore = (() => {
  const DB_NAME = 'lumen_pdfs';
  const STORE_NAME = 'pdfs';
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB limit
  let db = null;
  let supported = typeof indexedDB !== 'undefined';

  function open() {
    if (!supported) return Promise.reject(new Error('浏览器不支持 IndexedDB'));
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME, { keyPath: 'paperId' });
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function save(paperId, blob) {
    if (blob.size > MAX_SIZE) throw new Error(`PDF 文件过大（${(blob.size / 1024 / 1024).toFixed(1)}MB），上限 100MB`);
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ paperId, blob, size: blob.size, savedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(paperId) {
    try {
      const d = await open();
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(paperId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch { return null; }
  }

  async function remove(paperId) {
    try {
      const d = await open();
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(paperId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch { /* ignore */ }
  }

  async function has(paperId) {
    try {
      const record = await get(paperId);
      return !!record;
    } catch { return false; }
  }

  async function cleanup() {
    try {
      const d = await open();
      const tx = d.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const allKeys = await new Promise((resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const paperIds = new Set(Store.getPapers().map(p => p.id));
      let cleaned = 0;
      for (const key of allKeys) {
        if (!paperIds.has(key)) {
          await remove(key);
          cleaned++;
        }
      }
      return cleaned;
    } catch { return 0; }
  }

  return { save, get, remove, has, cleanup };
})();

/* ===== LUMEN STORE — localStorage data layer ===== */
const Store = (() => {
  const PAPERS_KEY = 'lumen_papers';
  const CONFIG_KEY = 'lumen_config';

  /* ---- PAPERS ---- */
  function getPapers() {
    try { return JSON.parse(localStorage.getItem(PAPERS_KEY) || '[]'); }
    catch { return []; }
  }
  function savePapers(papers) {
    localStorage.setItem(PAPERS_KEY, JSON.stringify(papers));
  }
  function addPaper(paper) {
    const papers = getPapers();
    const id = Date.now().toString();
    const newPaper = {
      id, title: paper.title, authors: paper.authors || '',
      url: paper.url || '', year: paper.year || '',
      tag: paper.tag || '其他', abstract: paper.abstract || '',
      addedAt: new Date().toISOString(),
      analyzed: false, messages: []
    };
    papers.unshift(newPaper);
    savePapers(papers);
    return newPaper;
  }
  function getPaper(id) {
    return getPapers().find(p => p.id === id) || null;
  }
  function updatePaper(id, updates) {
    const papers = getPapers();
    const idx = papers.findIndex(p => p.id === id);
    if (idx === -1) return false;
    papers[idx] = { ...papers[idx], ...updates };
    savePapers(papers);
    return true;
  }
  function deletePaper(id) {
    const papers = getPapers().filter(p => p.id !== id);
    savePapers(papers);
    PdfStore.remove(id); // fire-and-forget is fine — IndexedDB cleanup is non-critical
  }
  function addMessage(paperId, role, text) {
    const papers = getPapers();
    const idx = papers.findIndex(p => p.id === paperId);
    if (idx === -1) return null;
    const msg = { id: Date.now().toString(), role, text, time: new Date().toISOString() };
    papers[idx].messages = papers[idx].messages || [];
    papers[idx].messages.push(msg);
    savePapers(papers);
    return msg;
  }
  function clearMessages(paperId) {
    updatePaper(paperId, { messages: [] });
  }

  /* ---- CONFIG ---- */
  const DEFAULT_CONFIG = {
    provider: 'volc',
    apiKey: '790364d6-772c-445d-ab32-eab563815dba',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    model: 'doubao-seed-2-0-pro-260215',
    maxTokens: 2000,
    temperature: 0.7,
    _version: 2,
    systemPrompt: '你是一位专业的学术论文分析助手。你的任务是帮助研究者深入理解论文内容。请用清晰简洁的中文回答，使用 Markdown 格式，适当使用标题、列表和代码块来组织内容。对于公式，请用文字描述。'
  };
  function getConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      if (!saved._version || saved._version < DEFAULT_CONFIG._version) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG));
        return { ...DEFAULT_CONFIG };
      }
      return { ...DEFAULT_CONFIG, ...saved };
    } catch {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG));
      return { ...DEFAULT_CONFIG };
    }
  }
  function saveConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...getConfig(), ...cfg }));
  }
  function resetConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG));
  }
  function hasValidConfig() {
    const c = getConfig();
    return !!(c.apiKey && c.model);
  }

  /* ---- PROVIDERS ---- */
  const PROVIDERS = {
    anthropic: {
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com',
      models: [
        { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (最强)' },
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (推荐)' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (快速)' },
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { value: 'custom', label: '自定义模型' }
      ]
    },
    openai: {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      models: [
        { value: 'gpt-4o', label: 'GPT-4o (推荐)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (快速)' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'o1-preview', label: 'o1-preview' },
        { value: 'custom', label: '自定义模型' }
      ]
    },
    deepseek: {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      models: [
        { value: 'deepseek-chat', label: 'DeepSeek-V3 (推荐)' },
        { value: 'deepseek-reasoner', label: 'DeepSeek-R1 (推理)' },
        { value: 'custom', label: '自定义模型' }
      ]
    },
    volc: {
      name: '火山引擎',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      models: [
        { value: 'doubao-seed-2-0-pro-260215', label: '豆包 Seed 2.0 Pro (推荐)' },
        { value: 'doubao-seed-2-0-lite-260428', label: '豆包 Seed 2.0 Lite (快速)' },
        { value: 'doubao-seed-2-0-mini-260428', label: '豆包 Seed 2.0 Mini (轻量)' },
        { value: 'deepseek-v3-2-251201', label: 'DeepSeek V3' },
        { value: 'qwen3-32b-20250429', label: '通义千问3 32B' },
        { value: 'custom', label: '自定义模型' }
      ]
    },
    custom: {
      name: '自定义',
      baseUrl: '',
      models: [{ value: 'custom', label: '自定义模型' }]
    }
  };

  return { getPapers, savePapers, addPaper, getPaper, updatePaper, deletePaper, addMessage, clearMessages, getConfig, saveConfig, hasValidConfig, resetConfig, PROVIDERS };
})();

/* ===== TOAST ===== */
function showToast(msg, type = '') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* ===== AI API CALL ===== */
async function callAI(messages, onChunk, signal) {
  const cfg = Store.getConfig();
  if (!cfg.apiKey) throw new Error('请先在「模型配置」页面设置 API Key');

  const provider = Store.PROVIDERS[cfg.provider] || Store.PROVIDERS.custom;
  const baseUrl = cfg.baseUrl || provider.baseUrl;

  // Build request based on provider
  if (cfg.provider === 'anthropic') {
    return callAnthropic(cfg, baseUrl, messages, onChunk, signal);
  } else {
    return callOpenAICompat(cfg, baseUrl, messages, onChunk, signal);
  }
}

async function callAnthropic(cfg, baseUrl, messages, onChunk, signal) {
  // Separate system message
  const sysMsg = cfg.systemPrompt || '';
  const userMessages = messages.filter(m => m.role !== 'system');

  const body = {
    model: cfg.model,
    max_tokens: cfg.maxTokens || 2000,
    system: sysMsg,
    messages: userMessages,
    stream: true
  };

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            onChunk(parsed.delta.text);
          }
        } catch {}
      }
    }
  }
}

async function callOpenAICompat(cfg, baseUrl, messages, onChunk, signal) {
  const allMessages = [];
  if (cfg.systemPrompt) allMessages.push({ role: 'system', content: cfg.systemPrompt });
  allMessages.push(...messages.filter(m => m.role !== 'system'));

  const body = {
    model: cfg.model,
    max_tokens: cfg.maxTokens || 2000,
    temperature: parseFloat(cfg.temperature) || 0.7,
    messages: allMessages,
    stream: true
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) onChunk(delta);
        } catch {}
      }
    }
  }
}

/* ===== MARKDOWN ===== */
function renderMarkdown(text) {
  let html = text
    // Preserve blockquotes before escaping
    .replace(/^> (.+)$/gm, '\x01BQ\x01$1\x01/BQ\x01')
    // Escape HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Restore blockquotes
    .replace(/\x01BQ\x01/g, '<blockquote>').replace(/\x01\/BQ\x01/g, '</blockquote>')
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  if (!html.startsWith('<')) html = '<p>' + html + '</p>';
  return html;
}
