// 多页面共享外壳：集中生成顶部信息栏、主导航和页脚，避免每个页面重复维护。
const pageName = document.body.dataset.page || 'home';
const navigationItems = [
  ['home', 'Home', '/'],
  ['products', 'Products', '/products.html'],
  ['solutions', 'Solutions', '/solutions.html'],
  ['capabilities', 'Capabilities', '/capabilities.html'],
  ['insights', 'Insights', '/insights.html'],
  ['about', 'About', '/about.html'],
];

const headerMount = document.querySelector('[data-site-header]');
const footerMount = document.querySelector('[data-site-footer]');

if (headerMount) {
  headerMount.outerHTML = `
    <div class="utility-bar">
      <div class="shell utility-inner">
        <p>Automotive, electronic, waterborne and anticorrosive coating technology</p>
        <div class="utility-links">
          <a href="tel:"></a>
          <span aria-hidden="true"></span>
          <a href="/contact.html">EN / 中文</a>
        </div>
      </div>
    </div>
    <header class="site-header" data-header>
      <div class="shell nav-wrap">
        <a class="brand" href="/" aria-label="TeiKyo home">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M5 30C13 8 27 7 43 15c-8 1-13 5-15 12-3 10-11 14-23 3Z" />
            <path d="M11 34c7-8 15-13 27-17" />
          </svg>
          <span><strong>TeiKyo</strong><small>COATING TECHNOLOGY</small></span>
        </a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav">
          <span></span><span></span><span></span><span class="sr-only">Toggle navigation</span>
        </button>
        <nav id="main-nav" class="main-nav" aria-label="Primary navigation">
          ${navigationItems
            .map(
              ([key, label, href]) =>
                `<a href="${href}"${pageName === key ? ' class="active" aria-current="page"' : ''}>${label}</a>`,
            )
            .join('')}
          <a class="nav-cta${pageName === 'contact' ? ' active' : ''}" href="/contact.html">联系我们 <span>↗</span></a>
        </nav>
      </div>
    </header>
  `;
}

if (footerMount) {
  footerMount.outerHTML = `
    <footer class="site-footer">
      <div class="shell">
        <div class="footer-top">
          <a class="brand footer-brand" href="/" aria-label="TeiKyo home">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path d="M5 30C13 8 27 7 43 15c-8 1-13 5-15 12-3 10-11 14-23 3Z" />
              <path d="M11 34c7-8 15-13 27-17" />
            </svg>
            <span><strong>TeiKyo</strong><small>COATING TECHNOLOGY</small></span>
          </a>
          <p>High-performance coatings and industrial new materials since 2000.</p>
        </div>
        <div class="footer-grid">
          <div><h3>Explore</h3><a href="/products.html">Products</a><a href="/solutions.html">Solutions</a><a href="/capabilities.html">Capabilities</a></div>
          <div><h3>Company</h3><a href="/about.html">About us</a><a href="/insights.html">Insights</a><a href="/contact.html">联系我们</a></div>
          <div><h3>Headquarters</h3><p></p></div>
          <div class="footer-social"><h3>Follow</h3><a href="/">LinkedIn ↗</a><a href="/">WeChat ↗</a></div>
        </div>
        <div class="footer-bottom"><span>© 2026 Hunan Dijing Chemical New Material Co., Ltd. All rights reserved.</span><div><a href="/privacy.html">Privacy</a><a href="/legal.html">Legal</a><a href="#top">Back to top ↑</a></div></div>
      </div>
    </footer>
  `;
}
