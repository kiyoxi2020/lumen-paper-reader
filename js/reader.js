/* ===== READER PAGE ===== */
let paperId = null;
let paper = null;
let isLoading = false;
let abortController = null;

const QUICK_PROMPTS = [
  '核心贡献是什么？', '方法论详解', '关键公式推导',
  '与相关工作对比', '实验设置与结果', '局限性与未来方向', '一句话总结'
];

async function init() {
  const params = new URLSearchParams(location.search);
  paperId = params.get('id');
  if (!paperId) { location.href = 'index.html'; return; }

  paper = Store.getPaper(paperId);
  if (!paper) { location.href = 'index.html'; return; }

  // Set title
  document.title = `Lumen · ${paper.title}`;
  document.getElementById('paperTitleMini').textContent = paper.title;

  // Model badge
  const cfg = Store.getConfig();
  const providerName = Store.PROVIDERS[cfg.provider]?.name || '未知';
  const modelShort = cfg.model.split('-').slice(0,3).join('-');
  document.getElementById('modelBadgeText').textContent = cfg.apiKey ? `${providerName} · ${modelShort}` : '未配置';
  document.getElementById('chatModelName').textContent = cfg.apiKey ? providerName + ' · ' + modelShort : '未配置';

  // Render paper doc
  renderPaperDoc();

  // Quick prompts
  renderQuickPrompts();

  // Load chat history
  renderMessages();

  // Auto-analyze if new paper
  if (!paper.analyzed && !paper.messages?.length) {
    await autoAnalyze();
  }
}

function renderPaperDoc() {
  const doc = document.getElementById('paperDoc');
  const urlLink = paper.url ? `<a href="${paper.url}" target="_blank">${paper.url}</a>` : '';
  doc.innerHTML = `
    <h1>${paper.title}</h1>
    <div class="paper-meta">
      ${paper.authors ? `<strong>作者：</strong>${paper.authors}<br>` : ''}
      ${paper.year ? `<strong>年份：</strong>${paper.year}<br>` : ''}
      ${paper.tag ? `<strong>领域：</strong>${paper.tag}<br>` : ''}
      ${urlLink ? `<strong>链接：</strong>${urlLink}` : ''}
    </div>
    ${paper.abstract ? `
      <div class="abstract-block">
        <strong>Abstract</strong>
        <p>${paper.abstract}</p>
      </div>
    ` : ''}
    <div class="section-h">正文内容</div>
    <p class="placeholder-text">
      ${paper.url
        ? `本论文已记录在库中。如需阅读完整 PDF，请点击右上角链接在新标签页打开。右侧 AI 已基于摘要和标题进行了初步分析，您可以直接开始提问。`
        : `论文已添加至库中。右侧 AI 将基于您提供的信息进行分析，您可以在右侧对话框中详细描述论文内容，AI 会协助您深入理解。`
      }
    </p>
    <p class="placeholder-text" style="margin-top:12px">
      <strong>提示：</strong>您可以将论文的关键段落粘贴到对话框中，AI 将进行针对性解析。支持贴入公式、方法描述、实验结果等内容。
    </p>
  `;

  // Info tab
  renderInfoTab();
}

function renderInfoTab() {
  const infoCard = document.getElementById('infoCard');
  infoCard.innerHTML = `
    <div class="info-section">
      <h3>论文信息</h3>
      ${infoRow('标题', paper.title)}
      ${infoRow('作者', paper.authors || '—')}
      ${infoRow('年份', paper.year || '—')}
      ${infoRow('领域', paper.tag || '—')}
      ${infoRow('状态', paper.analyzed ? '已 AI 分析' : '待分析')}
      ${infoRow('添加时间', new Date(paper.addedAt).toLocaleString('zh-CN'))}
    </div>
    <div class="info-section">
      <h3>链接</h3>
      ${paper.url ? `<div class="info-row"><span class="info-key">原文</span><span class="info-val"><a href="${paper.url}" target="_blank" style="color:var(--accent)">${paper.url}</a></span></div>` : '<div class="info-row"><span class="info-key">—</span></div>'}
    </div>
    <div class="info-section">
      <h3>标签</h3>
      <div style="padding:8px 0"><span class="info-tag">${paper.tag || '其他'}</span></div>
    </div>
  `;
}

function infoRow(key, val) {
  return `<div class="info-row"><span class="info-key">${key}</span><span class="info-val">${val}</span></div>`;
}

function switchTab(tab) {
  document.getElementById('tabContentView').classList.toggle('hidden', tab !== 'content');
  document.getElementById('tabInfoView').classList.toggle('hidden', tab !== 'info');
  document.getElementById('tabContent').classList.toggle('active', tab === 'content');
  document.getElementById('tabInfo').classList.toggle('active', tab === 'info');
}

function renderQuickPrompts() {
  const chips = document.getElementById('quickChips');
  chips.innerHTML = '';
  QUICK_PROMPTS.forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'quick-chip';
    btn.textContent = q;
    btn.onclick = () => { document.getElementById('chatInput').value = q; sendMessage(); };
    chips.appendChild(btn);
  });
}

function renderMessages() {
  const container = document.getElementById('chatMessages');
  const welcome = document.getElementById('chatWelcome');
  const msgs = paper.messages || [];

  if (msgs.length === 0 && !paper.analyzed) {
    if (welcome) { welcome.style.display = 'flex'; welcome.querySelector('p').textContent = '正在分析论文，请稍候…'; }
    return;
  }
  if (welcome) welcome.remove();

  container.innerHTML = '';
  msgs.forEach(m => appendBubble(m.role, m.text, m.time, false));
  container.scrollTop = container.scrollHeight;
}

function appendBubble(role, text, time, animate, returnEl) {
  const container = document.getElementById('chatMessages');
  const welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  if (role === 'ai') {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = text;
  }
  const timeEl = document.createElement('div');
  timeEl.className = 'msg-time';
  const d = time ? new Date(time) : new Date();
  timeEl.textContent = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  div.appendChild(bubble);
  div.appendChild(timeEl);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  if (returnEl) return { div, bubble, timeEl };
}

function showTyping() {
  const container = document.getElementById('chatMessages');
  const welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.remove();
  const div = document.createElement('div');
  div.className = 'msg ai'; div.id = 'typingMsg';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
  div.appendChild(bubble);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return { div, bubble };
}

function removeTyping() {
  document.getElementById('typingMsg')?.remove();
}

async function autoAnalyze() {
  if (!Store.hasValidConfig()) {
    const welcome = document.getElementById('chatWelcome');
    if (welcome) welcome.querySelector('p').textContent = '请先在「模型配置」页面设置 API Key，才能使用 AI 分析';
    return;
  }

  const prompt = `请对论文《${paper.title}》进行系统分析。

作者：${paper.authors || '未知'}
年份：${paper.year || '未知'}
摘要：${paper.abstract || '（未提供）'}

请从以下维度进行梳理：
1. **核心贡献** — 这篇论文的主要创新点是什么？
2. **方法概述** — 提出了什么方法/模型/框架？核心思路是什么？
3. **关键实验** — 主要实验结论和与基线的对比
4. **研究意义** — 对该领域的影响和贡献
5. **可能局限** — 方法的局限性或未来改进方向

请用清晰的结构化格式回答。`;

  showTyping();
  isLoading = true;
  abortController = new AbortController();

  try {
    const msgs = [{ role: 'user', content: prompt }];
    let fullText = '';
    removeTyping();
    const { div, bubble } = (() => {
      const container = document.getElementById('chatMessages');
      const d = document.createElement('div'); d.className = 'msg ai';
      const b = document.createElement('div'); b.className = 'msg-bubble';
      const t = document.createElement('div'); t.className = 'msg-time';
      t.textContent = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
      d.appendChild(b); d.appendChild(t);
      container.appendChild(d); return { div: d, bubble: b };
    })();

    await callAI(msgs, (chunk) => {
      fullText += chunk;
      bubble.innerHTML = renderMarkdown(fullText);
      document.getElementById('chatMessages').scrollTop = 999999;
    }, abortController.signal);

    Store.addMessage(paperId, 'ai', fullText);
    Store.updatePaper(paperId, { analyzed: true });
    paper = Store.getPaper(paperId);
  } catch(e) {
    removeTyping();
    if (e.name !== 'AbortError') {
      const errText = '自动分析失败：' + e.message + '\n\n请检查模型配置后手动提问。';
      appendBubble('ai', errText, null, false);
    }
  }
  isLoading = false;
}

async function sendMessage() {
  if (isLoading) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  if (!Store.hasValidConfig()) {
    showToast('请先配置模型 API Key', 'error');
    return;
  }

  input.value = '';
  input.style.height = 'auto';

  Store.addMessage(paperId, 'user', text);
  appendBubble('user', text, null, true);

  paper = Store.getPaper(paperId);
  const history = (paper.messages || []).slice(-20).map(m => ({
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: m.text
  }));

  // Add paper context to first message
  const paperContext = `当前论文：《${paper.title}》\n作者：${paper.authors || '未知'}\n摘要：${paper.abstract?.slice(0, 500) || '未提供'}\n\n`;
  if (history.length > 0 && history[0].role === 'user') {
    history[0] = { ...history[0], content: paperContext + history[0].content };
  }

  isLoading = true;
  document.getElementById('sendBtn').disabled = true;
  abortController = new AbortController();

  // Show streaming bubble
  showTyping();
  let fullText = '';

  try {
    removeTyping();
    const container = document.getElementById('chatMessages');
    const d = document.createElement('div'); d.className = 'msg ai';
    const b = document.createElement('div'); b.className = 'msg-bubble';
    const t = document.createElement('div'); t.className = 'msg-time';
    t.textContent = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
    d.appendChild(b); d.appendChild(t);
    container.appendChild(d);

    await callAI(history, (chunk) => {
      fullText += chunk;
      b.innerHTML = renderMarkdown(fullText);
      container.scrollTop = 999999;
    }, abortController.signal);

    Store.addMessage(paperId, 'ai', fullText);
    paper = Store.getPaper(paperId);
  } catch(e) {
    removeTyping();
    if (e.name !== 'AbortError') {
      const errText = '请求失败：' + e.message;
      appendBubble('ai', errText, null, false);
      showToast(e.message, 'error');
    }
  }

  isLoading = false;
  document.getElementById('sendBtn').disabled = false;
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function clearChat() {
  if (!confirm('确定清空所有对话记录？')) return;
  Store.clearMessages(paperId);
  Store.updatePaper(paperId, { analyzed: false });
  paper = Store.getPaper(paperId);
  const container = document.getElementById('chatMessages');
  container.innerHTML = `<div class="chat-welcome" id="chatWelcome"><div class="welcome-orb"></div><p>对话已清空，可重新分析或直接提问</p></div>`;
  showToast('已清空对话', '');
}

function openOriginal() {
  if (paper.url) window.open(paper.url, '_blank');
  else showToast('未设置论文链接', 'error');
}

function exportChat() {
  const msgs = (paper.messages || []);
  if (!msgs.length) { showToast('暂无对话记录', ''); return; }
  let md = `# ${paper.title}\n\n`;
  md += `作者：${paper.authors || '—'} · 年份：${paper.year || '—'}\n\n---\n\n`;
  msgs.forEach(m => {
    const role = m.role === 'ai' ? '🤖 AI 助手' : '👤 用户';
    const time = new Date(m.time).toLocaleString('zh-CN');
    md += `### ${role} · ${time}\n\n${m.text}\n\n---\n\n`;
  });
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${paper.title.slice(0,40)}_对话记录.md`;
  a.click();
  showToast('已导出 Markdown 文件', 'success');
}

document.addEventListener('DOMContentLoaded', init);
