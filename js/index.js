/* ===== INDEX PAGE ===== */
let currentFilter = 'all';
let currentSort = 'date-desc';
let currentSearch = '';
let selectedPdfFile = null;

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function init() {
  loadSeedData();
  renderGrid();
  updateStats();
  PdfStore.cleanup(); // clean orphaned PDFs on load

  // Filter tags
  document.querySelectorAll('.ftag').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ftag').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderGrid();
    });
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', e => {
    currentSort = e.target.value;
    renderGrid();
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', e => {
    currentSearch = e.target.value.toLowerCase();
    renderGrid();
  });

  // Check model config badge
  if (!Store.hasValidConfig()) {
    showToast('请先配置模型 API，才能使用 AI 分析', '');
  }
}

function loadSeedData() {
  if (Store.getPapers().length > 0) return;
  const seed = [
    {
      title: 'Attention Is All You Need',
      authors: 'Vaswani, Shazeer, Parmar et al.',
      url: 'https://arxiv.org/abs/1706.03762',
      year: '2017', tag: 'NLP',
      abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, a model architecture eschewing recurrence and instead relying entirely on an attention mechanism.',
      analyzed: true,
      messages: [
        { id: '1', role: 'ai', text: '## 论文核心梳理\n\n**主要贡献**：提出 Transformer 架构，完全基于 Self-Attention 机制，摒弃 RNN/CNN。\n\n**关键模块**：\n- Multi-Head Attention\n- Position-wise FFN\n- Positional Encoding\n- 残差连接 + LayerNorm\n\n**核心公式**：Attention(Q,K,V) = softmax(QKᵀ/√d_k)·V\n\n**结果**：WMT 2014 英德翻译 BLEU 28.4，比此前最优提升 2 分以上。', time: new Date(Date.now() - 86400000).toISOString() },
        { id: '2', role: 'user', text: '为什么需要多头注意力？', time: new Date(Date.now() - 86000000).toISOString() },
        { id: '3', role: 'ai', text: 'Multi-Head Attention 的核心优势在于**并行捕获不同子空间的语义关系**。\n\n单头注意力只能学习一种对齐模式，而 h=8 个头可以同时关注：\n- 句法依赖关系\n- 语义相似度\n- 位置模式\n- 长距离依赖\n\n最后通过拼接+线性变换融合，表达能力显著增强。', time: new Date(Date.now() - 85000000).toISOString() }
      ]
    },
    {
      title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
      authors: 'Devlin, Chang, Lee, Toutanova',
      url: 'https://arxiv.org/abs/1810.04805',
      year: '2019', tag: 'NLP',
      abstract: 'We introduce a new language representation model called BERT designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.',
      analyzed: true,
      messages: [
        { id: '1', role: 'ai', text: '## BERT 核心梳理\n\n**核心创新**：双向 Transformer 预训练，通过 MLM（掩码语言模型）和 NSP（下一句预测）两个任务联合训练。\n\n**对比 GPT**：GPT 只能从左到右，BERT 利用 [MASK] token 同时看到左右上下文，语义表示更完整。\n\n**影响**：在 11 个 NLP 下游任务上刷新 SOTA，开启预训练-微调范式的时代。', time: new Date(Date.now() - 172800000).toISOString() }
      ]
    },
    {
      title: 'Denoising Diffusion Probabilistic Models',
      authors: 'Ho, Jain, Abbeel',
      url: 'https://arxiv.org/abs/2006.11239',
      year: '2020', tag: '生成模型',
      abstract: 'We present high quality image synthesis results using diffusion probabilistic models, a class of latent variable models inspired by considerations from nonequilibrium thermodynamics.',
      analyzed: false, messages: []
    }
  ];
  seed.forEach(p => {
    const paper = Store.addPaper(p);
    if (p.messages.length) {
      Store.updatePaper(paper.id, { messages: p.messages, analyzed: p.analyzed });
    }
  });
}

function renderGrid() {
  let papers = Store.getPapers();

  // Filter
  if (currentFilter !== 'all') papers = papers.filter(p => p.tag === currentFilter);

  // Search
  if (currentSearch) {
    papers = papers.filter(p =>
      p.title.toLowerCase().includes(currentSearch) ||
      (p.authors || '').toLowerCase().includes(currentSearch) ||
      (p.tag || '').toLowerCase().includes(currentSearch)
    );
  }

  // Sort
  if (currentSort === 'date-asc') papers = papers.slice().reverse();
  else if (currentSort === 'title') papers = papers.slice().sort((a,b) => a.title.localeCompare(b.title));

  const grid = document.getElementById('paperGrid');
  grid.innerHTML = '';

  if (papers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6M9 16h6M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2"/><rect x="9" y="2" width="6" height="4" rx="1"/></svg></div><p>没有找到匹配的论文</p>`;
    grid.appendChild(empty);
    return;
  }

  papers.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'paper-card';
    card.style.animationDelay = (i * 0.04) + 's';
    const date = new Date(p.addedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    const msgCount = (p.messages || []).length;
    card.innerHTML = `
      <div class="card-header">
        <span class="card-tag">${esc(p.tag || '其他')}</span>
        <button class="card-menu-btn" onclick="deletePaper(event,'${p.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>
      <div class="card-title">${esc(p.title)}</div>
      <div class="card-authors">${esc(p.authors || '未知作者')}${p.year ? ' · ' + esc(p.year) : ''}</div>
      <div class="card-footer">
        <span class="card-date">${date}</span>
        <span class="card-status">
          <span class="status-dot ${p.analyzed ? 'analyzed' : ''}"></span>
          ${p.analyzed ? '已分析' : '待分析'}
        </span>
        ${msgCount > 0 ? `<span class="card-chat-count"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>${msgCount}</span>` : ''}
      </div>`;
    // Check PDF status async and add badge
    PdfStore.has(p.id).then(hasPdf => {
      if (hasPdf) {
        const footer = card.querySelector('.card-footer');
        const badge = document.createElement('span');
        badge.className = 'card-pdf-badge';
        badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF';
        footer.appendChild(badge);
      }
    });
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-menu-btn')) return;
      openPaper(p.id);
    });
    grid.appendChild(card);
  });
}

function openPaper(id) {
  window.location.href = `reader.html?id=${id}`;
}

function deletePaper(e, id) {
  e.stopPropagation();
  if (!confirm('确定删除这篇论文及其所有对话记录？')) return;
  Store.deletePaper(id);
  renderGrid();
  updateStats();
  showToast('已删除', '');
}

function updateStats() {
  const papers = Store.getPapers();
  document.getElementById('statTotal').textContent = papers.length;
  document.getElementById('statAnalyzed').textContent = papers.filter(p => p.analyzed).length;
}

/* ---- ADD MODAL ---- */
function openAddModal() {
  document.getElementById('addModal').classList.add('show');
  setupPdfDropZone();
}
function closeAddModal() {
  document.getElementById('addModal').classList.remove('show');
  ['newTitle','newUrl','newAuthors','newYear','newAbstract'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('addBtnText').textContent = '添加并分析';
  selectedPdfFile = null;
  document.getElementById('newPdfFile').value = '';
  document.getElementById('pdfUploadText').textContent = '点击或拖拽上传 PDF';
  document.getElementById('pdfUploadZone').classList.remove('has-file');
}

function onPdfSelected(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.type !== 'application/pdf') {
    showToast('请选择 PDF 文件', 'error');
    input.value = '';
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    showToast('PDF 文件过大，上限 100MB', 'error');
    input.value = '';
    return;
  }
  selectedPdfFile = file;
  document.getElementById('pdfUploadText').textContent = file.name;
  document.getElementById('pdfUploadZone').classList.add('has-file');
}

function setupPdfDropZone() {
  const zone = document.getElementById('pdfUploadZone');
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone.ondragleave = () => zone.classList.remove('drag-over');
  zone.ondrop = (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showToast('请选择 PDF 文件', 'error');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast('PDF 文件过大，上限 100MB', 'error');
      return;
    }
    selectedPdfFile = file;
    document.getElementById('pdfUploadText').textContent = file.name;
    zone.classList.add('has-file');
  };
}

async function submitAddPaper() {
  const title = document.getElementById('newTitle').value.trim();
  if (!title) { document.getElementById('newTitle').focus(); showToast('请输入论文标题', 'error'); return; }

  const paper = Store.addPaper({
    title,
    url: document.getElementById('newUrl').value.trim(),
    authors: document.getElementById('newAuthors').value.trim(),
    year: document.getElementById('newYear').value.trim(),
    tag: document.getElementById('newTag').value,
    abstract: document.getElementById('newAbstract').value.trim()
  });

  // Save PDF if selected
  if (selectedPdfFile) {
    try {
      await PdfStore.save(paper.id, selectedPdfFile);
    } catch(e) {
      console.error('PDF save failed:', e);
      showToast('PDF 保存失败，但论文已添加', 'error');
    }
  }

  closeAddModal();
  renderGrid();
  updateStats();
  showToast('已添加，正在打开…', 'success');
  setTimeout(() => openPaper(paper.id), 400);
}

document.addEventListener('DOMContentLoaded', init);
