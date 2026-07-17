const state = { user: null, products: [], solutions: [], siteSettings: {}, stats: [], inquiries: [], notificationCount: null, latestInquiryId: null, importRows: [], importFileName: '', importCanCommit: false, siteImportMode: '', siteImportRows: [], siteImportFileName: '', siteImportCanCommit: false };
const roleNames = { admin: '管理员', editor: '编辑', viewer: '查看者' };
const statusNames = { new: '新询盘', contacted: '已联系', qualified: '有效需求', closed: '已关闭', spam: '无效信息' };
const actionNames = { login: '登录', logout: '退出', create: '创建', update: '修改', delete: '删除', import: '表格导入', change_password: '修改密码' };
const entityNames = { session: '会话', product: '产品', solution: '方案', content: '网站内容', inquiry: '询盘', user: '用户' };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

const productHeaderAliases = {
  category: 'category', 分类: 'category',
  category_label: 'category_label', 分类名称: 'category_label',
  code: 'code', 产品编号: 'code',
  title: 'title', 产品名称: 'title',
  summary: 'summary', 摘要: 'summary',
  theme: 'theme', 主题: 'theme',
  image_url: 'image_url', 图片链接: 'image_url',
  description: 'description', 详细介绍: 'description',
  features: 'features', 核心特点: 'features',
  applications: 'applications', 应用领域: 'applications',
  substrates: 'substrates', 适用基材: 'substrates',
  performance: 'performance', 性能参数: 'performance',
  process: 'process', 施工工艺: 'process',
  package_info: 'package_info', 包装信息: 'package_info',
  document_url: 'document_url', 资料链接: 'document_url',
  position: 'position', 显示顺序: 'position',
  is_published: 'is_published', 是否发布: 'is_published',
};
const solutionHeaderAliases = { title: 'title', 方案名称: 'title', summary: 'summary', 方案摘要: 'summary', position: 'position', 显示顺序: 'position', is_published: 'is_published', 是否发布: 'is_published' };
const contentHeaderAliases = { key: 'key', 字段: 'key', value: 'value', 内容: 'value' };

// 支持 Excel 导出的 CSV 引号、单元格内换行和 TSV 制表符格式。
function parseDelimitedText(source, delimiter, headerAliases = productHeaderAliases, requiredHeaders = ['code']) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) { row.push(cell); cell = ''; }
    else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += character;
  }
  row.push(cell.replace(/\r$/, ''));
  if (row.some((value) => value.trim())) rows.push(row);
  if (!rows.length) throw new Error('表格中没有数据。');

  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, '').trim());
  const canonicalHeaders = headers.map((header) => headerAliases[header] || '');
  const missingHeaders = requiredHeaders.filter((header) => !canonicalHeaders.includes(header));
  if (missingHeaders.length) throw new Error(`表格缺少必需列：${missingHeaders.join('、')}。`);
  const usedHeaders = canonicalHeaders.filter(Boolean);
  if (new Set(usedHeaders).size !== usedHeaders.length) throw new Error('表格中存在重复或含义相同的列名。');

  return rows.map((values) => Object.fromEntries(canonicalHeaders.flatMap((header, index) => header ? [[header, values[index] ?? '']] : [])));
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(fileName, rows) {
  const content = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${content}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function resetImportDialog() {
  state.importRows = [];
  state.importFileName = '';
  state.importCanCommit = false;
  document.querySelector('#import-form').reset();
  document.querySelector('#import-result').hidden = true;
  document.querySelector('#import-preview-wrap').hidden = true;
  document.querySelector('#commit-import').disabled = true;
}

// 模板开头加入 UTF-8 BOM，避免 Windows Excel 打开中文列名时出现乱码。
function downloadProductImportTemplate() {
  downloadCsv('products-import-template.csv', [['分类', '分类名称', '产品编号', '产品名称', '摘要', '主题', '图片链接', '详细介绍', '核心特点', '应用领域', '适用基材', '性能参数', '施工工艺', '包装信息', '资料链接', '显示顺序', '是否发布']]);
}

function renderImportPreview(result) {
  const resultElement = document.querySelector('#import-result');
  resultElement.hidden = false;
  resultElement.classList.toggle('error', result.errors.length > 0);
  resultElement.innerHTML = `<strong>共 ${result.summary.total} 行：新增 ${result.summary.create}，更新 ${result.summary.update}，错误 ${result.summary.errors}。</strong>${result.errors.length ? `<ul>${result.errors.map((error) => `<li>第 ${error.row || '—'} 行${error.code ? `（${escapeHtml(error.code)}）` : ''}：${escapeHtml(error.message)}</li>`).join('')}</ul>` : '<p>预检通过，可以确认导入。</p>'}`;
  const previewWrap = document.querySelector('#import-preview-wrap');
  previewWrap.hidden = result.preview.length === 0;
  document.querySelector('#import-preview-table').innerHTML = result.preview.map((item) => `<tr><td>${item.row}</td><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.title || '保留原名称')}</td><td><span class="status status-${item.action === 'create' ? 'qualified' : 'contacted'}">${item.action === 'create' ? '新增' : '更新'}</span></td></tr>`).join('');
  state.importCanCommit = result.canImport;
  document.querySelector('#commit-import').disabled = !result.canImport;
}

async function previewProductImport() {
  const file = document.querySelector('#product-import-file').files[0];
  if (!file) { toast('请先选择 CSV 或 TSV 文件。', 'error'); return; }
  if (!/\.(csv|tsv)$/i.test(file.name)) { toast('仅支持 .csv 和 .tsv 文件。', 'error'); return; }
  if (file.size > 600 * 1024) { toast('文件不能超过 600 KB。', 'error'); return; }

  const button = document.querySelector('#preview-import');
  button.disabled = true;
  button.textContent = '正在预检…';
  try {
    const source = await file.text();
    const firstLine = source.split(/\r?\n/, 1)[0];
    const delimiter = file.name.toLowerCase().endsWith('.tsv') || (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
    state.importRows = parseDelimitedText(source, delimiter);
    state.importFileName = file.name;
    const result = await api('/api/admin/import/products/preview', { method: 'POST', body: JSON.stringify({ rows: state.importRows, fileName: file.name }) });
    renderImportPreview(result);
  } catch (error) {
    state.importCanCommit = false;
    document.querySelector('#commit-import').disabled = true;
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '预检文件';
  }
}

async function commitProductImport(event) {
  event.preventDefault();
  if (!state.importCanCommit) { toast('请先完成预检。', 'error'); return; }
  const button = document.querySelector('#commit-import');
  button.disabled = true;
  button.textContent = '正在导入…';
  try {
    const result = await api('/api/admin/import/products', { method: 'POST', body: JSON.stringify({ rows: state.importRows, fileName: state.importFileName }) });
    document.querySelector('#import-dialog').close();
    toast(`导入完成：新增 ${result.created} 个，更新 ${result.updated} 个产品。`);
    await Promise.all([loadProducts(), loadDashboard()]);
  } catch (error) {
    toast(error.message, 'error');
    button.disabled = false;
  } finally {
    button.textContent = '确认导入';
  }
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace('/admin/login');
    throw new Error('登录状态已失效。');
  }
  if (!response.ok) throw new Error(result.error || '操作失败。');
  return result;
}

function toast(message, type = '') {
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.textContent = message;
  document.querySelector('#toast-region').append(element);
  setTimeout(() => element.remove(), 4200);
}

function setSection(name) {
  if (['users', 'audit'].includes(name) && state.user.role !== 'admin') name = 'dashboard';
  document.querySelectorAll('.admin-section').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.section === name));
  const titles = { dashboard: '业务概览', content: '网站内容', solutions: 'Solutions 管理', products: '产品管理', inquiries: '客户询盘', users: '用户与权限', audit: '操作日志', password: '修改密码' };
  document.querySelector('#page-title').textContent = titles[name];
  document.querySelector('#sidebar').classList.remove('open');
  if (name === 'dashboard') loadDashboard();
  if (name === 'content') loadSiteContent();
  if (name === 'solutions') loadSolutions();
  if (name === 'products') loadProducts();
  if (name === 'inquiries') loadInquiries();
  if (name === 'users') loadUsers();
  if (name === 'audit') loadAudit();
}

function applyPermissions() {
  const canEdit = ['admin', 'editor'].includes(state.user.role);
  document.querySelectorAll('.admin-only').forEach((element) => { element.hidden = state.user.role !== 'admin'; });
  document.querySelectorAll('.can-edit').forEach((element) => { element.hidden = !canEdit; });
  document.querySelector('#user-name').textContent = state.user.displayName;
  document.querySelector('#user-role').textContent = roleNames[state.user.role];
  document.querySelector('#user-avatar').textContent = state.user.displayName.slice(0, 1).toUpperCase();
  document.querySelector('#password-warning').hidden = !state.user.mustChangePassword;
}

function renderStatsEditor() {
  const canEdit = ['admin', 'editor'].includes(state.user.role);
  document.querySelector('#stats-editor').innerHTML = state.stats.length ? state.stats.map((item, index) => `<div class="stat-editor-row" data-stat-index="${index}"><input data-stat-field="value" value="${escapeHtml(item.value)}" placeholder="数值，如 20+" ${canEdit ? '' : 'disabled'}><input data-stat-field="label" value="${escapeHtml(item.label)}" placeholder="说明" ${canEdit ? '' : 'disabled'}><input data-stat-field="position" type="number" min="0" value="${item.position}" ${canEdit ? '' : 'disabled'}><button class="icon-button can-edit" type="button" data-remove-stat="${index}" ${canEdit ? '' : 'hidden'}>×</button></div>`).join('') : '<p class="empty-cell">暂无企业数字</p>';
}

async function loadSiteContent() {
  try {
    const result = await api('/api/admin/content');
    state.siteSettings = result.settings;
    state.stats = result.stats;
    document.querySelectorAll('[data-setting]').forEach((input) => { input.value = result.settings[input.dataset.setting] || ''; input.disabled = state.user.role === 'viewer'; });
    renderStatsEditor();
  } catch (error) { toast(error.message, 'error'); }
}

async function saveSiteContent() {
  const settings = Object.fromEntries([...document.querySelectorAll('[data-setting]')].map((input) => [input.dataset.setting, input.value]));
  const stats = [...document.querySelectorAll('[data-stat-index]')].map((row) => ({
    value: row.querySelector('[data-stat-field="value"]').value,
    label: row.querySelector('[data-stat-field="label"]').value,
    position: row.querySelector('[data-stat-field="position"]').value,
  }));
  try { await api('/api/admin/content', { method: 'PUT', body: JSON.stringify({ settings, stats }) }); toast('网站内容已保存，官网刷新后即可看到更新。'); await loadSiteContent(); } catch (error) { toast(error.message, 'error'); }
}

function renderSolutions() {
  const keyword = document.querySelector('#solution-search').value.trim().toLowerCase();
  const canEdit = ['admin', 'editor'].includes(state.user.role);
  const solutions = state.solutions.filter((item) => item.title.toLowerCase().includes(keyword));
  document.querySelector('#solution-table').innerHTML = solutions.length ? solutions.map((item) => `<tr><td><strong>${escapeHtml(item.title)}</strong></td><td>${escapeHtml(item.summary)}</td><td>${item.position}</td><td><span class="status status-${item.is_published ? 'published' : 'draft'}">${item.is_published ? '已发布' : '未发布'}</span></td><td><div class="row-actions">${canEdit ? `<button class="row-button" data-edit-solution="${item.id}">编辑</button>` : '<span class="muted">只读</span>'}${state.user.role === 'admin' ? `<button class="row-button danger" data-delete-solution="${item.id}">删除</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">暂无匹配方案</td></tr>';
}

async function loadSolutions() {
  try { state.solutions = (await api('/api/admin/solutions')).solutions; renderSolutions(); } catch (error) { toast(error.message, 'error'); }
}

function openSolution(solution = {}) {
  const form = document.querySelector('#solution-form');
  form.reset();
  document.querySelector('#solution-dialog-title').textContent = solution.id ? '编辑方案' : '新增方案';
  form.elements.id.value = solution.id || '';
  form.elements.title.value = solution.title || '';
  form.elements.summary.value = solution.summary || '';
  form.elements.position.value = solution.position ?? 0;
  form.elements.is_published.checked = solution.id ? Boolean(solution.is_published) : true;
  document.querySelector('#solution-dialog').showModal();
}

async function saveSolution(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.is_published = form.elements.is_published.checked;
  const id = data.id; delete data.id;
  try { await api(id ? `/api/admin/solutions/${id}` : '/api/admin/solutions', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }); document.querySelector('#solution-dialog').close(); toast(id ? '方案已更新。' : '方案已创建。'); await loadSolutions(); } catch (error) { toast(error.message, 'error'); }
}

async function deleteSolution(id) {
  const solution = state.solutions.find((item) => item.id === Number(id));
  if (!window.confirm(`确认删除方案“${solution?.title || id}”？`)) return;
  try { await api(`/api/admin/solutions/${id}`, { method: 'DELETE' }); toast('方案已删除。'); await loadSolutions(); } catch (error) { toast(error.message, 'error'); }
}

function openSiteImport(mode) {
  state.siteImportMode = mode;
  state.siteImportRows = [];
  state.siteImportFileName = '';
  state.siteImportCanCommit = false;
  document.querySelector('#site-import-form').reset();
  document.querySelector('#site-import-result').hidden = true;
  document.querySelector('#site-import-preview-wrap').hidden = true;
  document.querySelector('#commit-site-import').disabled = true;
  document.querySelector('#site-import-title').textContent = mode === 'content' ? '导入 About / 网站内容' : '导入 Solutions';
  document.querySelector('#site-import-guide').textContent = mode === 'content' ? '模板包含当前网站内容，可修改“内容”列后重新导入。' : '以方案名称匹配；已有名称更新，不存在的名称新增。';
  document.querySelector('#site-import-dialog').showModal();
}

async function downloadSiteImportTemplate() {
  if (state.siteImportMode === 'content') {
    if (!Object.keys(state.siteSettings).length) await loadSiteContent();
    downloadCsv('website-content-template.csv', [['字段', '内容'], ...Object.entries(state.siteSettings)]);
  } else downloadCsv('solutions-import-template.csv', [['方案名称', '方案摘要', '显示顺序', '是否发布']]);
}

function renderSiteImportPreview(result) {
  const isContent = state.siteImportMode === 'content';
  const resultElement = document.querySelector('#site-import-result');
  resultElement.hidden = false;
  resultElement.classList.toggle('error', result.errors.length > 0);
  const summary = isContent ? `更新 ${result.summary.update}` : `新增 ${result.summary.create}，更新 ${result.summary.update}`;
  resultElement.innerHTML = `<strong>共 ${result.summary.total} 行：${summary}，错误 ${result.summary.errors}。</strong>${result.errors.length ? `<ul>${result.errors.map((error) => `<li>第 ${error.row || '—'} 行：${escapeHtml(error.message)}</li>`).join('')}</ul>` : '<p>预检通过，可以确认导入。</p>'}`;
  const previewWrap = document.querySelector('#site-import-preview-wrap');
  previewWrap.hidden = result.preview.length === 0;
  document.querySelector('#site-import-preview-table').innerHTML = result.preview.map((item) => `<tr><td>${item.row}</td><td>${escapeHtml(isContent ? item.key : item.title)}</td><td>${escapeHtml(isContent ? item.value : item.summary || '保留原摘要')}</td><td><span class="status status-contacted">${isContent || item.action === 'update' ? '更新' : '新增'}</span></td></tr>`).join('');
  state.siteImportCanCommit = result.canImport;
  document.querySelector('#commit-site-import').disabled = !result.canImport;
}

async function previewSiteImport() {
  const file = document.querySelector('#site-import-file').files[0];
  if (!file) { toast('请先选择 CSV 或 TSV 文件。', 'error'); return; }
  if (!/\.(csv|tsv)$/i.test(file.name) || file.size > 600 * 1024) { toast('请选择不超过 600 KB 的 CSV 或 TSV 文件。', 'error'); return; }
  const button = document.querySelector('#preview-site-import');
  button.disabled = true; button.textContent = '正在预检…';
  try {
    const source = await file.text();
    const firstLine = source.split(/\r?\n/, 1)[0];
    const delimiter = file.name.toLowerCase().endsWith('.tsv') || (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
    const isContent = state.siteImportMode === 'content';
    state.siteImportRows = parseDelimitedText(source, delimiter, isContent ? contentHeaderAliases : solutionHeaderAliases, isContent ? ['key', 'value'] : ['title']);
    state.siteImportFileName = file.name;
    const result = await api(`/api/admin/import/${isContent ? 'content' : 'solutions'}/preview`, { method: 'POST', body: JSON.stringify({ rows: state.siteImportRows, fileName: file.name }) });
    renderSiteImportPreview(result);
  } catch (error) { state.siteImportCanCommit = false; document.querySelector('#commit-site-import').disabled = true; toast(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = '预检文件'; }
}

async function commitSiteImport(event) {
  event.preventDefault();
  if (!state.siteImportCanCommit) { toast('请先完成预检。', 'error'); return; }
  const button = document.querySelector('#commit-site-import');
  button.disabled = true; button.textContent = '正在导入…';
  try {
    const result = await api(`/api/admin/import/${state.siteImportMode === 'content' ? 'content' : 'solutions'}`, { method: 'POST', body: JSON.stringify({ rows: state.siteImportRows, fileName: state.siteImportFileName }) });
    document.querySelector('#site-import-dialog').close();
    toast(state.siteImportMode === 'content' ? `已更新 ${result.updated} 项网站内容。` : `导入完成：新增 ${result.created}，更新 ${result.updated}。`);
    if (state.siteImportMode === 'content') await loadSiteContent(); else await loadSolutions();
  } catch (error) { toast(error.message, 'error'); button.disabled = false; }
  finally { button.textContent = '确认导入'; }
}

async function loadDashboard() {
  try {
    const { counts, recentInquiries } = await api('/api/admin/dashboard');
    const metrics = [
      ['全部产品', counts.products], ['已发布产品', counts.publishedProducts], ['客户询盘', counts.inquiries], ['新询盘', counts.newInquiries],
    ];
    if (counts.users !== null) metrics.push(['启用用户', counts.users]);
    document.querySelector('#metric-grid').innerHTML = metrics.map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
    document.querySelector('#recent-inquiries').innerHTML = recentInquiries.length ? recentInquiries.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.company || '—')}</td><td>${item.product_code ? `<strong>${escapeHtml(item.product_title)}</strong><br><span class="muted">${escapeHtml(item.product_code)}</span>` : escapeHtml(item.application || '普通咨询')}</td><td><span class="status status-${item.status}">${statusNames[item.status] || item.status}</span></td><td>${formatDate(item.created_at)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">暂无客户询盘</td></tr>';
  } catch (error) { toast(error.message, 'error'); }
}

function renderProducts() {
  const keyword = document.querySelector('#product-search').value.trim().toLowerCase();
  const products = state.products.filter((item) => [item.title, item.code, item.category_label].some((value) => String(value).toLowerCase().includes(keyword)));
  const canEdit = ['admin', 'editor'].includes(state.user.role);
  document.querySelector('#product-table').innerHTML = products.length ? products.map((item) => `<tr>
    <td><div class="product-cell">${item.image_url ? `<img class="product-thumb" src="${escapeHtml(item.image_url)}" alt="">` : '<span class="product-thumb"></span>'}<strong>${escapeHtml(item.title)}</strong></div></td>
    <td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.category_label)}</td><td>${item.position}</td>
    <td><span class="status status-${item.is_published ? 'published' : 'draft'}">${item.is_published ? '已发布' : '未发布'}</span></td>
    <td><div class="row-actions">${canEdit ? `<button class="row-button" data-edit-product="${item.id}">编辑</button>` : '<span class="muted">只读</span>'}${state.user.role === 'admin' ? `<button class="row-button danger" data-delete-product="${item.id}">删除</button>` : ''}</div></td>
  </tr>`).join('') : '<tr><td colspan="6" class="empty-cell">没有匹配的产品</td></tr>';
}

async function loadProducts() {
  try { state.products = (await api('/api/admin/products')).products; renderProducts(); } catch (error) { toast(error.message, 'error'); }
}

function openProduct(product = {}) {
  const form = document.querySelector('#product-form');
  form.reset();
  document.querySelector('#product-dialog-title').textContent = product.id ? '编辑产品' : '新增产品';
  for (const [key, value] of Object.entries(product)) {
    if (!form.elements[key]) continue;
    if (key === 'is_published') form.elements[key].checked = Boolean(value);
    else form.elements[key].value = value ?? '';
  }
  if (!product.id) { form.elements.theme.value = 'mint'; form.elements.is_published.checked = true; }
  document.querySelector('#product-dialog').showModal();
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.is_published = form.elements.is_published.checked;
  const id = data.id;
  delete data.id;
  try {
    await api(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    document.querySelector('#product-dialog').close();
    toast(id ? '产品信息已更新。' : '产品已创建。');
    await loadProducts();
  } catch (error) { toast(error.message, 'error'); }
}

async function deleteProduct(id) {
  const product = state.products.find((item) => item.id === Number(id));
  if (!window.confirm(`确认删除产品“${product?.title || id}”？此操作不可恢复。`)) return;
  try { await api(`/api/admin/products/${id}`, { method: 'DELETE' }); toast('产品已删除。'); await loadProducts(); } catch (error) { toast(error.message, 'error'); }
}

function renderInquiries() {
  const keyword = document.querySelector('#inquiry-product-filter').value.trim().toLowerCase();
  const inquiries = state.inquiries.filter((item) => !keyword || [item.product_title, item.product_code].some((value) => String(value || '').toLowerCase().includes(keyword)));
  document.querySelector('#inquiry-table').innerHTML = inquiries.length ? inquiries.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.company || '未填写公司')}</span></td><td>${escapeHtml(item.email)}<br>${escapeHtml(item.phone || '—')}</td><td>${item.product_code ? `<strong>${escapeHtml(item.product_title)}</strong><br><span class="muted">${escapeHtml(item.product_code)}</span>` : '<span class="muted">普通咨询</span>'}</td><td>${escapeHtml(item.application || '—')}</td><td><span class="status status-${item.status}">${statusNames[item.status] || item.status}</span></td><td>${formatDate(item.created_at)}</td><td><button class="row-button" data-view-inquiry="${item.id}">${state.user.role === 'viewer' ? '查看' : '处理'}</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty-cell">暂无匹配的客户询盘</td></tr>';
}

async function loadInquiries() {
  const filter = document.querySelector('#inquiry-filter').value;
  try {
    state.inquiries = (await api(`/api/admin/inquiries${filter ? `?status=${filter}` : ''}`)).inquiries;
    renderInquiries();
  } catch (error) { toast(error.message, 'error'); }
}

function openInquiry(id) {
  const item = state.inquiries.find((entry) => entry.id === Number(id));
  if (!item) return;
  const form = document.querySelector('#inquiry-form');
  form.elements.id.value = item.id;
  form.elements.status.value = item.status;
  form.elements.internal_notes.value = item.internal_notes || '';
  form.elements.status.disabled = state.user.role === 'viewer';
  form.elements.internal_notes.disabled = state.user.role === 'viewer';
  document.querySelector('#inquiry-dialog-title').textContent = `${item.name} 的询盘`;
  const details = [
    ['询盘类型', item.inquiry_type === 'product_reservation' ? '产品预定信' : '普通咨询'],
    ['关联产品', item.product_code ? `${item.product_title} / ${item.product_code}` : '—'],
    ['公司', item.company], ['邮箱', item.email], ['电话', item.phone], ['地区', item.region],
    ['预计数量', item.quantity], ['期望日期', item.desired_date], ['需求方向', item.application],
    ['提交时间', formatDate(item.created_at)], ['需求说明', item.message],
  ];
  document.querySelector('#inquiry-details').innerHTML = details.map(([label, value], index) => `<div class="detail-item ${index === 10 ? 'wide' : ''}"><span>${label}</span><strong>${escapeHtml(value || '—')}</strong></div>`).join('');
  document.querySelector('#inquiry-dialog').showModal();
}

async function saveInquiry(event) {
  event.preventDefault();
  if (state.user.role === 'viewer') { document.querySelector('#inquiry-dialog').close(); return; }
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const id = data.id; delete data.id;
  try { await api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); document.querySelector('#inquiry-dialog').close(); toast('询盘处理结果已保存。'); await Promise.all([loadInquiries(), pollNotifications(true)]); } catch (error) { toast(error.message, 'error'); }
}

async function loadUsers() {
  if (state.user.role !== 'admin') return;
  try {
    const { users } = await api('/api/admin/users');
    document.querySelector('#user-table').innerHTML = users.map((user) => `<tr><td><strong>${escapeHtml(user.displayName)}</strong></td><td>${escapeHtml(user.username)}</td><td><select data-user-role="${user.id}"><option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>查看者</option><option value="editor" ${user.role === 'editor' ? 'selected' : ''}>编辑</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option></select></td><td><span class="status status-${user.isActive ? 'active' : 'disabled'}">${user.isActive ? '已启用' : '已禁用'}</span></td><td>${formatDate(user.createdAt)}</td><td><button class="row-button" data-save-user="${user.id}" data-active="${user.isActive ? 1 : 0}">保存角色</button><button class="row-button ${user.isActive ? 'danger' : ''}" data-toggle-user="${user.id}" data-active="${user.isActive ? 1 : 0}">${user.isActive ? '禁用' : '启用'}</button></td></tr>`).join('');
  } catch (error) { toast(error.message, 'error'); }
}

async function updateUser(id, isActive) {
  const role = document.querySelector(`[data-user-role="${id}"]`).value;
  try { await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role, isActive }) }); toast('用户权限已更新。'); await loadUsers(); } catch (error) { toast(error.message, 'error'); }
}

async function createUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); document.querySelector('#user-dialog').close(); form.reset(); toast('后台用户已创建，首次登录需要修改密码。'); await loadUsers(); } catch (error) { toast(error.message, 'error'); }
}

async function loadAudit() {
  if (state.user.role !== 'admin') return;
  try {
    const { logs } = await api('/api/admin/audit-logs');
    document.querySelector('#audit-table').innerHTML = logs.length ? logs.map((log) => `<tr><td>${formatDate(log.created_at)}</td><td>${escapeHtml(log.username || '系统')}</td><td>${actionNames[log.action] || escapeHtml(log.action)}</td><td>${entityNames[log.entity_type] || escapeHtml(log.entity_type)} ${escapeHtml(log.entity_id)}</td><td>${escapeHtml(log.details || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">暂无操作日志</td></tr>';
  } catch (error) { toast(error.message, 'error'); }
}

async function pollNotifications(silent = false) {
  try {
    const result = await api('/api/admin/notifications');
    document.querySelectorAll('[data-notification-count]').forEach((badge) => { badge.textContent = result.newInquiries; badge.hidden = result.newInquiries === 0; });
    const latestInquiryId = Number(result.latest[0]?.id || 0);
    if (!silent && state.latestInquiryId !== null && latestInquiryId > state.latestInquiryId) {
      const latest = result.latest[0];
      toast(latest?.product_code ? `收到关于 ${latest.product_title} 的新预定信。` : '收到新的客户询盘，请及时处理。');
    }
    state.notificationCount = result.newInquiries;
    state.latestInquiryId = latestInquiryId;
  } catch (error) { if (!silent) console.warn(error); }
}

document.addEventListener('click', (event) => {
  const sectionButton = event.target.closest('[data-section],[data-open-section]');
  if (sectionButton) setSection(sectionButton.dataset.section || sectionButton.dataset.openSection);
  if (event.target.closest('[data-close-dialog]')) event.target.closest('dialog').close();
  const edit = event.target.closest('[data-edit-product]'); if (edit) openProduct(state.products.find((item) => item.id === Number(edit.dataset.editProduct)));
  const remove = event.target.closest('[data-delete-product]'); if (remove) deleteProduct(remove.dataset.deleteProduct);
  const editSolution = event.target.closest('[data-edit-solution]'); if (editSolution) openSolution(state.solutions.find((item) => item.id === Number(editSolution.dataset.editSolution)));
  const removeSolution = event.target.closest('[data-delete-solution]'); if (removeSolution) deleteSolution(removeSolution.dataset.deleteSolution);
  const removeStat = event.target.closest('[data-remove-stat]'); if (removeStat) { state.stats.splice(Number(removeStat.dataset.removeStat), 1); renderStatsEditor(); }
  const inquiry = event.target.closest('[data-view-inquiry]'); if (inquiry) openInquiry(inquiry.dataset.viewInquiry);
  const saveUser = event.target.closest('[data-save-user]'); if (saveUser) updateUser(saveUser.dataset.saveUser, saveUser.dataset.active === '1');
  const toggleUser = event.target.closest('[data-toggle-user]'); if (toggleUser) updateUser(toggleUser.dataset.toggleUser, toggleUser.dataset.active !== '1');
});

document.querySelector('#menu-button').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
document.querySelector('#notification-button').addEventListener('click', () => setSection('inquiries'));
document.querySelector('#save-content').addEventListener('click', saveSiteContent);
document.querySelector('#add-stat').addEventListener('click', () => { state.stats.push({ value: '', label: '', position: state.stats.length + 1 }); renderStatsEditor(); });
document.querySelector('#import-content').addEventListener('click', () => openSiteImport('content'));
document.querySelector('#download-content-template').addEventListener('click', async () => { state.siteImportMode = 'content'; await downloadSiteImportTemplate(); });
document.querySelector('#add-solution').addEventListener('click', () => openSolution());
document.querySelector('#import-solutions').addEventListener('click', () => openSiteImport('solutions'));
document.querySelector('#solution-search').addEventListener('input', renderSolutions);
document.querySelector('#solution-form').addEventListener('submit', saveSolution);
document.querySelector('#download-site-import-template').addEventListener('click', downloadSiteImportTemplate);
document.querySelector('#preview-site-import').addEventListener('click', previewSiteImport);
document.querySelector('#site-import-form').addEventListener('submit', commitSiteImport);
document.querySelector('#add-product').addEventListener('click', () => openProduct());
document.querySelector('#import-products').addEventListener('click', () => { resetImportDialog(); document.querySelector('#import-dialog').showModal(); });
document.querySelector('#download-import-template').addEventListener('click', downloadProductImportTemplate);
document.querySelector('#preview-import').addEventListener('click', previewProductImport);
document.querySelector('#import-form').addEventListener('submit', commitProductImport);
document.querySelector('#product-search').addEventListener('input', renderProducts);
document.querySelector('#product-form').addEventListener('submit', saveProduct);
document.querySelector('#inquiry-filter').addEventListener('change', loadInquiries);
document.querySelector('#inquiry-product-filter').addEventListener('input', renderInquiries);
document.querySelector('#inquiry-form').addEventListener('submit', saveInquiry);
document.querySelector('#add-user').addEventListener('click', () => document.querySelector('#user-dialog').showModal());
document.querySelector('#user-form').addEventListener('submit', createUser);
document.querySelector('#refresh-audit').addEventListener('click', loadAudit);
document.querySelector('#password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (data.newPassword !== data.confirmPassword) { toast('两次输入的新密码不一致。', 'error'); return; }
  delete data.confirmPassword;
  try { await api('/api/admin/change-password', { method: 'POST', body: JSON.stringify(data) }); form.reset(); state.user.mustChangePassword = false; document.querySelector('#password-warning').hidden = true; toast('密码已修改。'); } catch (error) { toast(error.message, 'error'); }
});
document.querySelector('#logout-button').addEventListener('click', async () => { try { await api('/api/admin/logout', { method: 'POST' }); } finally { window.location.replace('/admin/login'); } });

// 初始化用户信息后再加载各模块，避免页面短暂显示无权限按钮。
try {
  state.user = (await api('/api/admin/me')).user;
  applyPermissions();
  await Promise.all([loadDashboard(), pollNotifications(true)]);
  setInterval(() => pollNotifications(), 15000);
} catch (error) { console.warn(error); }
