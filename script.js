// 获取导航相关元素，后续统一管理吸顶和移动菜单状态。
const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.main-nav');

// 页面向下滚动超过顶部信息栏后，将主导航固定在视口顶部。
const syncHeader = () => {
  header.classList.toggle('is-sticky', window.scrollY > 34);
};

syncHeader();
window.addEventListener('scroll', syncHeader, { passive: true });

// 移动端菜单开关，同时更新 aria-expanded，方便辅助技术读取状态。
menuToggle.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

// 点击任意导航链接后自动收起移动菜单。
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) {
    navigation.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
});

// 对数据库文本进行 HTML 转义，避免用户导入的内容被当作标签执行。
function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// 跨页面链接统一在新的浏览上下文中打开；浏览器会根据用户设置决定新标签页或新窗口。
function configureNewWindowLinks(scope = document) {
  scope.querySelectorAll('a[href^="/"]').forEach((link) => {
    const destination = new URL(link.href, window.location.origin);
    const pointsToDifferentPage = destination.pathname !== window.location.pathname || destination.search;

    if (pointsToDifferentPage) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.removeAttribute('target');
      link.removeAttribute('rel');
    }
  });
}

configureNewWindowLinks();

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// 只允许预设配色，避免数据库字段生成任意 CSS 类名。
function normalizeTheme(theme) {
  return ['red', 'blue', 'mint', 'gold'].includes(theme) ? theme : 'mint';
}

// 仅接受站内绝对路径或 HTTP(S) 图片地址，其他值回退到 CSS 默认视觉。
function normalizeImageUrl(value) {
  if (!value) return '';
  try {
    const imageUrl = new URL(value, window.location.origin);
    if (!['http:', 'https:'].includes(imageUrl.protocol)) return '';
    return value.startsWith('/') ? `${imageUrl.pathname}${imageUrl.search}` : imageUrl.href;
  } catch {
    return '';
  }
}

function renderValueList(value) {
  const items = String(value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items.length) return '<p class="detail-empty">To be confirmed during technical review.</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

// 使用 IntersectionObserver 只在元素首次进入视口时播放渐入动画。
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
);

function observeReveals(scope = document) {
  scope.querySelectorAll('.reveal:not(.is-visible)').forEach((element) => revealObserver.observe(element));
}

observeReveals();

let productCards = [];

// 产品筛选按钮根据数据库中的实际分类动态生成。
function renderProducts(products) {
  const filterBar = document.querySelector('.filter-bar');
  const productGrid = document.querySelector('.product-grid');
  if (!filterBar || !productGrid) return;
  const categories = [...new Map(products.map((product) => [product.category, product.category_label])).entries()];

  filterBar.innerHTML = [
    '<button class="filter-button active" type="button" data-filter="all">All platforms</button>',
    ...categories.map(
      ([category, label]) =>
        `<button class="filter-button" type="button" data-filter="${escapeHtml(category)}">${escapeHtml(label.split('/')[0].trim())}</button>`,
    ),
  ].join('');

  productGrid.innerHTML = products
    .map((product, index) => {
      const theme = normalizeTheme(product.theme);
      const imageUrl = normalizeImageUrl(product.image_url);
      const visualContent = imageUrl
        ? `<img class="product-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async">`
        : `<span class="sample sample-${theme}"></span>`;
      return `
        <article class="product-card reveal" data-category="${escapeHtml(product.category)}">
          <a class="product-card-main" href="/product.html?code=${encodeURIComponent(product.code)}" aria-label="View ${escapeHtml(product.title)} details">
            <div class="product-visual visual-${theme}${imageUrl ? ' has-image' : ''}">
              ${visualContent}
              <b>${escapeHtml(product.code)}</b>
            </div>
            <div class="product-meta">
              <span>${escapeHtml(product.category_label)}</span>
              <span>${String(index + 1).padStart(2, '0')}</span>
            </div>
            <h3>${escapeHtml(product.title)}</h3>
            <p>${escapeHtml(product.summary)}</p>
          </a>
          <a class="product-inquiry" href="/reservation.html?code=${encodeURIComponent(product.code)}" aria-label="联系我们：${escapeHtml(product.title)}">联系我们 <span>↗</span></a>
        </article>
      `;
    })
    .join('');

  productCards = [...productGrid.querySelectorAll('[data-category]')];
  configureNewWindowLinks(productGrid);

  // 图片不存在或加载失败时，自动恢复原有 CSS 球体，不留下破图图标。
  productGrid.querySelectorAll('.product-image').forEach((image) => {
    image.addEventListener('error', () => {
      const visual = image.closest('.product-visual');
      const theme = [...visual.classList].find((className) => className.startsWith('visual-'))?.replace('visual-', '') || 'mint';
      const fallback = document.createElement('span');
      fallback.className = `sample sample-${normalizeTheme(theme)}`;
      visual.classList.remove('has-image');
      image.replaceWith(fallback);
    });
  });
  filterBar.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      filterBar.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item === button));
      productCards.forEach((card) => {
        card.classList.toggle('is-hidden', filter !== 'all' && card.dataset.category !== filter);
      });
    });
  });

  observeReveals(productGrid);
}

// Stitch 首页只展示前三个产品，完整列表仍位于独立产品中心。
function renderHomeProducts(products) {
  const previewGrid = document.querySelector('[data-home-products]');
  if (!previewGrid) return;

  previewGrid.innerHTML = products.slice(0, 3).map((product, index) => {
    const imageUrl = normalizeImageUrl(product.image_url) || '/assets/stitch/product-studio.jpg';
    return `
      <a class="stitch-product-preview reveal" href="/product.html?code=${encodeURIComponent(product.code)}" aria-label="View ${escapeHtml(product.title)} details">
        <div class="stitch-preview-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.title)}" loading="lazy"><span>${String(index + 1).padStart(2, '0')}</span></div>
        <div class="stitch-preview-meta"><small>${escapeHtml(product.category_label)}</small><b>${escapeHtml(product.code)}</b></div>
        <h3>${escapeHtml(product.title)}</h3>
        <p>${escapeHtml(product.summary)}</p>
        <strong>View details ↗</strong>
      </a>
    `;
  }).join('');

  observeReveals(previewGrid);
  configureNewWindowLinks(previewGrid);
}

// 独立产品详情页根据 URL 中的 code 参数查找对应产品。
function renderProductDetail(products) {
  const detailContainer = document.querySelector('[data-product-detail]');
  const informationContainer = document.querySelector('[data-product-information]');
  if (!detailContainer) return;

  const requestedCode = new URLSearchParams(window.location.search).get('code');
  const product = products.find((item) => item.code === requestedCode);

  if (!product) {
    detailContainer.innerHTML = `
      <div class="product-not-found">
        <p class="eyebrow"><span></span> Product not found</p>
        <h1>The requested product is unavailable.</h1>
        <a class="button button-primary" href="/products.html">Return to products <span>→</span></a>
      </div>
    `;
    if (informationContainer) informationContainer.innerHTML = '';
    configureNewWindowLinks(detailContainer);
    return;
  }

  const theme = normalizeTheme(product.theme);
  const imageUrl = normalizeImageUrl(product.image_url);
  const visualContent = imageUrl
    ? `<img class="product-detail-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.title)}">`
    : `<span class="sample product-detail-sample sample-${theme}"></span>`;

  document.title = `${product.title} — TeiKyo`;
  detailContainer.innerHTML = `
    <div class="product-detail-grid">
      <div class="product-detail-visual visual-${theme}${imageUrl ? ' has-image' : ''}">
        ${visualContent}
        <span class="product-detail-index">${escapeHtml(product.code)}</span>
      </div>
      <div class="product-detail-copy">
        <p class="eyebrow"><span></span> ${escapeHtml(product.category_label)}</p>
        <h1>${escapeHtml(product.title)}</h1>
        <p class="product-detail-code">Product platform / ${escapeHtml(product.code)}</p>
        <p class="product-detail-summary">${escapeHtml(product.summary)}</p>
        <div class="product-detail-actions">
          <a class="button button-primary" href="/reservation.html?code=${encodeURIComponent(product.code)}">联系我们 <span>→</span></a>
          <a class="text-link" href="/products.html">All products <span>↗</span></a>
        </div>
      </div>
    </div>
  `;

  if (informationContainer) {
    const documentUrl = normalizeImageUrl(product.document_url);
    informationContainer.innerHTML = `
      <div class="product-overview reveal">
        <div>
          <p class="eyebrow dark"><span></span> Product overview</p>
          <h2>Designed around<br><em>real application needs.</em></h2>
        </div>
        <p>${escapeHtml(product.description || product.summary)}</p>
      </div>
      <div class="product-information-grid">
        <article class="product-information-card reveal"><span>01</span><h3>Key features</h3>${renderValueList(product.features)}</article>
        <article class="product-information-card reveal"><span>02</span><h3>Applications</h3>${renderValueList(product.applications)}</article>
        <article class="product-information-card reveal"><span>03</span><h3>Compatible substrates</h3>${renderValueList(product.substrates)}</article>
        <article class="product-information-card reveal"><span>04</span><h3>Performance focus</h3>${renderValueList(product.performance)}</article>
      </div>
      <div class="product-process reveal">
        <div><p class="eyebrow dark"><span></span> Application guidance</p><h3>Process</h3>${renderValueList(product.process)}</div>
        <div><p class="eyebrow dark"><span></span> Supply information</p><h3>Packaging</h3><p>${escapeHtml(product.package_info || 'Contact sales for available pack sizes.')}</p></div>
        <div class="product-document"><p class="eyebrow dark"><span></span> Documentation</p><h3>Technical resources</h3>${documentUrl ? `<a class="text-link dark-link" href="${escapeHtml(documentUrl)}">Download document <span>↓</span></a>` : '<p>Technical data and safety documents are available after product confirmation.</p>'}</div>
      </div>
    `;
    observeReveals(informationContainer);
    configureNewWindowLinks(informationContainer);
  }

  configureNewWindowLinks(detailContainer);

  const reservationLink = document.querySelector('[data-product-reservation-link]');
  if (reservationLink) {
    reservationLink.href = `/reservation.html?code=${encodeURIComponent(product.code)}`;
    configureNewWindowLinks(reservationLink.parentElement);
  }
}

// 预定信页面根据产品编号锁定具体产品，避免客户提交时产品信息被篡改。
function renderReservation(products) {
  const productContainer = document.querySelector('[data-reservation-product]');
  const form = document.querySelector('[data-reservation-form]');
  if (!productContainer || !form) return;

  const requestedCode = new URLSearchParams(window.location.search).get('code');
  const product = products.find((item) => item.code === requestedCode);
  const submitButton = form.querySelector('button[type="submit"]');

  if (!product) {
    productContainer.innerHTML = `<div class="reservation-invalid"><p class="eyebrow dark"><span></span> Product unavailable</p><h2>Please select a published product.</h2><a class="button button-primary" href="/products.html">View products <span>→</span></a></div>`;
    form.hidden = true;
    configureNewWindowLinks(productContainer);
    return;
  }

  const imageUrl = normalizeImageUrl(product.image_url);
  form.elements.product_id.value = product.id;
  form.elements.product_code.value = product.code;
  submitButton.disabled = false;
  document.title = `Product inquiry: ${product.title} — TeiKyo`;
  productContainer.innerHTML = `
    <div class="reservation-product-visual ${imageUrl ? 'has-image' : ''}">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.title)}">` : `<span class="sample sample-${normalizeTheme(product.theme)}"></span>`}
    </div>
    <p class="eyebrow dark"><span></span> Selected product</p>
    <h2>${escapeHtml(product.title)}</h2>
    <strong>${escapeHtml(product.code)}</strong>
    <p>${escapeHtml(product.summary)}</p>
    <a class="text-link dark-link" href="/product.html?code=${encodeURIComponent(product.code)}">Review product details <span>↗</span></a>
  `;
  configureNewWindowLinks(productContainer);
}

function renderSolutions(solutions) {
  const solutionList = document.querySelector('.solution-list');
  if (!solutionList) return;
  solutionList.innerHTML = solutions
    .map(
      (solution, index) => `
        <article class="solution-row reveal">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <div>
            <h3>${escapeHtml(solution.title)}</h3>
            <p>${escapeHtml(solution.summary)}</p>
          </div>
          <b>↗</b>
        </article>
      `,
    )
    .join('');
  observeReveals(solutionList);
}

function renderInsights(insights) {
  const newsGrid = document.querySelector('.news-grid');
  if (!newsGrid) return;
  const featured = insights.find((insight) => insight.is_featured) || insights[0];
  const secondary = insights.filter((insight) => insight.id !== featured?.id).slice(0, 3);

  if (!featured) {
    newsGrid.innerHTML = '<p class="content-empty">No insights have been published yet.</p>';
    return;
  }

  newsGrid.innerHTML = `
    <article class="news-feature reveal">
      <div class="news-visual">
        <div class="layer-stack"><i></i><i></i><i></i><i></i></div>
        <span>${escapeHtml(featured.type.toUpperCase())} / ${String(featured.id).padStart(2, '0')}</span>
      </div>
      <div class="news-body">
        <p>${escapeHtml(featured.type)}${featured.read_time ? ` · ${escapeHtml(featured.read_time)}` : ''}</p>
        <h3>${escapeHtml(featured.title)}</h3>
        <a href="#contact">Read the brief <span>→</span></a>
      </div>
    </article>
    <div class="news-list">
      ${secondary
        .map(
          (insight) => `
            <article class="news-item reveal">
              <div>
                <p>${escapeHtml(insight.type)} · ${escapeHtml(formatDate(insight.published_at))}</p>
                <h3>${escapeHtml(insight.title)}</h3>
              </div>
              <span>↗</span>
            </article>
          `,
        )
        .join('')}
    </div>
  `;
  observeReveals(newsGrid);
}

function renderSettings(settings, stats) {
  document.querySelectorAll('.brand strong').forEach((element) => {
    element.textContent = settings.company_name || 'TeiKyo';
  });

  const homeHeading = document.querySelector('.hero-copy h1');
  const homeIntro = document.querySelector('.hero-intro');
  const aboutHeading = document.querySelector('.about-copy h2');
  const aboutBody = document.querySelector('.about-copy > p:not(.eyebrow)');
  const footerTagline = document.querySelector('.footer-top > p');

  if (homeHeading) {
    homeHeading.innerHTML = `${escapeHtml(settings.hero_primary || '')}<br><em>${escapeHtml(settings.hero_emphasis || '')}</em>`;
  }
  if (homeIntro) homeIntro.textContent = settings.hero_intro || '';
  if (aboutHeading) {
    aboutHeading.innerHTML = `${escapeHtml(settings.about_primary || '')} <em>${escapeHtml(settings.about_emphasis || '')}</em>`;
  }
  if (aboutBody) aboutBody.textContent = settings.about_body || '';

  const aboutHero = document.querySelector('[data-about-hero]');
  if (aboutHero) {
    aboutHero.querySelector('.eyebrow').innerHTML = `<span></span> ${escapeHtml(settings.about_hero_eyebrow || '')}`;
    aboutHero.querySelector('h1').innerHTML = `${escapeHtml(settings.about_hero_primary || '')}<br><em>${escapeHtml(settings.about_hero_emphasis || '')}</em>`;
    aboutHero.querySelector(':scope > p:last-child').textContent = settings.about_hero_intro || '';
  }

  const solutionsHero = document.querySelector('[data-solutions-hero]');
  if (solutionsHero) {
    solutionsHero.querySelector('.eyebrow').innerHTML = `<span></span> ${escapeHtml(settings.solutions_hero_eyebrow || '')}`;
    solutionsHero.querySelector('h1').innerHTML = `${escapeHtml(settings.solutions_hero_primary || '')}<br><em>${escapeHtml(settings.solutions_hero_emphasis || '')}</em>`;
    solutionsHero.querySelector(':scope > p:last-child').textContent = settings.solutions_hero_intro || '';
  }

  const solutionsIntro = document.querySelector('[data-solutions-intro]');
  if (solutionsIntro) {
    solutionsIntro.querySelector('.eyebrow').innerHTML = `<span></span> ${escapeHtml(settings.solutions_intro_eyebrow || '')}`;
    solutionsIntro.querySelector('h2').innerHTML = `${escapeHtml(settings.solutions_intro_primary || '')}<br><em>${escapeHtml(settings.solutions_intro_emphasis || '')}</em>`;
    solutionsIntro.querySelector(':scope > p:last-child').textContent = settings.solutions_intro_body || '';
  }
  if (footerTagline) footerTagline.textContent = settings.company_tagline || '';

  const emailLinks = document.querySelectorAll('a[href^="mailto:"]');
  emailLinks.forEach((link) => {
    const email = settings.contact_email || '';
    link.href = `mailto:${email}`;
    link.textContent = email;
    link.hidden = !email;
  });

  const phoneLinks = document.querySelectorAll('a[href^="tel:"]');
  phoneLinks.forEach((link) => {
    const phoneLink = settings.contact_phone_link || '';
    const phoneDisplay = settings.contact_phone_display || '';
    link.href = `tel:${phoneLink}`;
    link.textContent = phoneDisplay;
    link.hidden = !phoneLink || !phoneDisplay;
  });

  const headquarters = document.querySelector('.footer-grid div:nth-child(3) p');
  if (headquarters) {
    const address = settings.address || '';
    headquarters.innerHTML = escapeHtml(address).replaceAll('\n', '<br>');
    headquarters.parentElement.hidden = !address;
  }

  document.querySelectorAll('.hero-proof').forEach((container) => {
    container.innerHTML = stats
      .map((stat) => `<div><strong>${escapeHtml(stat.value)}</strong><span>${escapeHtml(stat.label)}</span></div>`)
      .join('');
  });
}

// 加载数据库内容；失败时保留 HTML 中的演示内容，页面仍可阅读。
async function loadDatabaseContent() {
  try {
    const response = await fetch('/api/content', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`内容接口返回 ${response.status}`);
    const content = await response.json();
    renderSettings(content.settings, content.stats);
    renderProducts(content.products);
    renderHomeProducts(content.products);
    renderProductDetail(content.products);
    renderReservation(content.products);
    renderSolutions(content.solutions);
    renderInsights(content.insights);
  } catch (error) {
    console.error('数据库内容加载失败：', error);
  }
}

loadDatabaseContent();

// 联系表单和产品预定信统一提交到后端，验证通过后写入 inquiries 表。
document.querySelectorAll('[data-contact-form], [data-reservation-form]').forEach((inquiryForm) => {
  const formStatus = inquiryForm.querySelector('.form-status');
  const submitButton = inquiryForm.querySelector('button[type="submit"]');

  // 产品页可通过查询参数把产品编号带入联系页。
  const subject = new URLSearchParams(window.location.search).get('subject');
  if (subject) {
    inquiryForm.querySelector('textarea').value = `I would like to discuss product ${subject}. `;
  }

  inquiryForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    // GitHub Pages 仅提供免费静态演示，无法写入 SQLite；改为调用访客的邮件客户端。
    if (window.location.hostname.endsWith('.github.io')) {
      const productCode = inquiryForm.elements.product_code?.value || '';
      const subject = productCode ? `TeiKyo product inquiry: ${productCode}` : 'TeiKyo coating inquiry';
      formStatus.textContent = 'The public demo cannot save inquiries. Opening your email client…';
      window.location.href = `mailto:info@teikyo.cn?subject=${encodeURIComponent(subject)}`;
      return;
    }

    const payload = Object.fromEntries(new FormData(inquiryForm).entries());
    const productIdentity = { id: payload.product_id || '', code: payload.product_code || '' };
    const originalButtonContent = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.textContent = 'Sending…';
    formStatus.textContent = '';

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to submit the inquiry.');

      const firstName = payload.name.trim().split(/\s+/)[0];
      const successMessage = payload.inquiry_type === 'product_reservation'
        ? 'Your product reservation request has been saved.'
        : 'Your project brief has been saved.';
      inquiryForm.reset();
      if (inquiryForm.elements.product_id) inquiryForm.elements.product_id.value = productIdentity.id;
      if (inquiryForm.elements.product_code) inquiryForm.elements.product_code.value = productIdentity.code;
      formStatus.textContent = `Thanks${firstName ? `, ${firstName}` : ''}. ${successMessage}`;
    } catch (error) {
      formStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonContent;
    }
  });
});
