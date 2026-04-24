/* ===== SETTINGS PAGE ===== */
let selectedProvider = 'anthropic';
let keyVisible = false;

function init() {
  const cfg = Store.getConfig();
  selectedProvider = cfg.provider || 'anthropic';

  // Render provider cards
  renderProviderCards();

  // Load saved config
  document.getElementById('apiKey').value = cfg.apiKey || '';
  document.getElementById('baseUrl').value = cfg.baseUrl || '';
  document.getElementById('maxTokens').value = cfg.maxTokens || 2000;
  document.getElementById('temperature').value = cfg.temperature || 0.7;
  document.getElementById('systemPrompt').value = cfg.systemPrompt || '';

  updateModelOptions(cfg.model);
  updateFieldVisibility();
  renderSummary();
}

function renderProviderCards() {
  document.querySelectorAll('.provider-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.provider === selectedProvider);
    card.onclick = () => selectProvider(card.dataset.provider);
  });
}

function selectProvider(providerKey) {
  selectedProvider = providerKey;
  renderProviderCards();
  updateFieldVisibility();
  updateModelOptions();

  // Auto-fill base URL
  const provider = Store.PROVIDERS[providerKey];
  if (provider && provider.baseUrl && providerKey !== 'custom') {
    document.getElementById('baseUrl').value = provider.baseUrl;
  } else if (providerKey === 'custom') {
    document.getElementById('baseUrl').value = '';
  }
}

function updateModelOptions(currentModel) {
  const provider = Store.PROVIDERS[selectedProvider] || Store.PROVIDERS.custom;
  const select = document.getElementById('modelSelect');
  const customInput = document.getElementById('modelCustomInput');

  select.innerHTML = '';
  provider.models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    if (m.value === currentModel) opt.selected = true;
    select.appendChild(opt);
  });

  // Handle "custom" default selection
  if (currentModel && !provider.models.find(m => m.value === currentModel)) {
    // Current model not in list — must be custom
    const customOpt = select.querySelector('[value="custom"]');
    if (customOpt) { customOpt.selected = true; customInput.value = currentModel; customInput.classList.remove('hidden'); }
  }

  onModelSelectChange();
}

function onModelSelectChange() {
  const val = document.getElementById('modelSelect').value;
  const customInput = document.getElementById('modelCustomInput');
  if (val === 'custom') { customInput.classList.remove('hidden'); customInput.focus(); }
  else { customInput.classList.add('hidden'); }
}

function updateFieldVisibility() {
  // Show/hide base URL hint
  const baseUrlField = document.getElementById('fieldBaseUrl');
  const provider = Store.PROVIDERS[selectedProvider];
  const hintEl = baseUrlField.querySelector('.field-hint');
  if (hintEl && provider?.baseUrl) {
    hintEl.textContent = `默认：${provider.baseUrl}`;
  }
}

function toggleKey() {
  keyVisible = !keyVisible;
  const input = document.getElementById('apiKey');
  input.type = keyVisible ? 'text' : 'password';
  document.getElementById('eyeIcon').innerHTML = keyVisible
    ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
}

async function testConnection() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) { showToast('请先填写 API Key', 'error'); return; }

  const modelSelect = document.getElementById('modelSelect').value;
  const model = modelSelect === 'custom' ? document.getElementById('modelCustomInput').value.trim() : modelSelect;
  if (!model) { showToast('请选择或填写模型名称', 'error'); return; }

  const result = document.getElementById('testResult');
  result.className = 'test-result show testing';
  result.textContent = '⏳ 正在测试连接…';

  // Temporarily save for test
  const tempCfg = {
    provider: selectedProvider,
    apiKey,
    baseUrl: document.getElementById('baseUrl').value.trim(),
    model,
    maxTokens: 100,
    temperature: 0.5,
    systemPrompt: '你是助手'
  };

  const originalCfg = Store.getConfig();
  Store.saveConfig(tempCfg);

  try {
    let replied = false;
    await callAI(
      [{ role: 'user', content: '请回复"连接成功"三个字即可' }],
      (chunk) => { replied = replied || !!chunk; }
    );
    result.className = 'test-result show success';
    result.textContent = `✅ 连接成功！模型 ${model} 响应正常。`;
  } catch(e) {
    result.className = 'test-result show error';
    result.textContent = `❌ 连接失败：${e.message}`;
    // Restore original on failure
    Store.saveConfig(originalCfg);
  }
}

function saveConfig() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) { showToast('请填写 API Key', 'error'); return; }

  const modelSelect = document.getElementById('modelSelect').value;
  const model = modelSelect === 'custom' ? document.getElementById('modelCustomInput').value.trim() : modelSelect;
  if (!model) { showToast('请填写模型名称', 'error'); return; }

  const maxT = parseInt(document.getElementById('maxTokens').value) || 2000;
  const temp = parseFloat(document.getElementById('temperature').value);

  Store.saveConfig({
    provider: selectedProvider,
    apiKey,
    baseUrl: document.getElementById('baseUrl').value.trim(),
    model,
    maxTokens: maxT,
    temperature: isNaN(temp) ? 0.7 : temp,
    systemPrompt: document.getElementById('systemPrompt').value.trim()
  });

  renderSummary();
  showToast('配置已保存', 'success');

  const result = document.getElementById('testResult');
  result.className = 'test-result show success';
  result.textContent = `✅ 配置已保存。当前模型：${model}`;
}

function renderSummary() {
  const cfg = Store.getConfig();
  const summary = document.getElementById('configSummary');

  if (!cfg.apiKey) {
    summary.innerHTML = '<div class="summary-empty">尚未配置任何模型</div>';
    return;
  }

  const providerName = Store.PROVIDERS[cfg.provider]?.name || cfg.provider;
  const maskedKey = cfg.apiKey.slice(0, 6) + '••••••••' + cfg.apiKey.slice(-4);

  summary.innerHTML = `
    <div class="config-status">
      <div class="config-status-dot"></div>
      <span class="config-status-text">已配置，AI 功能可用</span>
    </div>
    <div class="summary-row">
      <span class="summary-key">服务商</span>
      <span class="summary-val">
        <span class="summary-provider-badge">${providerName}</span>
      </span>
    </div>
    <div class="summary-row">
      <span class="summary-key">模型</span>
      <span class="summary-val">${cfg.model}</span>
    </div>
    <div class="summary-row">
      <span class="summary-key">API Key</span>
      <span class="summary-val masked">${maskedKey}</span>
    </div>
    <div class="summary-row">
      <span class="summary-key">Base URL</span>
      <span class="summary-val">${cfg.baseUrl || '（默认）'}</span>
    </div>
    <div class="summary-row">
      <span class="summary-key">最大 Token</span>
      <span class="summary-val">${cfg.maxTokens}</span>
    </div>
    <div class="summary-row">
      <span class="summary-key">Temperature</span>
      <span class="summary-val">${cfg.temperature}</span>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', init);
