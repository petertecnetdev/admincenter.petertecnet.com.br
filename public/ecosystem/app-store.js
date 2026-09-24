(() => {
  if (window.__PETERTECNET_APP_STORE__) return;
  window.__PETERTECNET_APP_STORE__ = true;

  const API_URL = 'https://api.petertecnet.com.br/api/applications';
  const FALLBACK_LOGO = '/petertecnet-brand.svg';
  const STORE_ID = 'peter-app-store';
  const NETWORK_TIMEOUT_MS = 5000;

  let cachedApplications = null;
  let loadingFallback = false;
  let scheduled = false;

  const safeText = value => String(value || '').trim();
  const normalize = value => safeText(value).toLocaleLowerCase('pt-BR');
  const slugOf = application => normalize(application?.slug || application?.name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const isMobile = () => {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile;
    }
    return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 900px)').matches);
  };

  const resolveLogo = logo => {
    const value = safeText(logo);
    if (!value) return FALLBACK_LOGO;
    if (/^(data:|https?:\/\/)/i.test(value)) return value;
    return `https://api.petertecnet.com.br/${value.replace(/^\/+/, '')}`;
  };

  const safeApplicationUrl = application => {
    const value = safeText(application?.url);
    if (!value) return null;
    try {
      const url = new URL(value, window.location.origin);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:') return null;
      if (host !== 'petertecnet.com.br' && !host.endsWith('.petertecnet.com.br')) return null;
      return url;
    } catch {
      return null;
    }
  };

  const installIntentUrl = application => {
    const url = safeApplicationUrl(application);
    if (!url) return null;
    url.searchParams.set('install', '1');
    url.searchParams.set('source', 'peter-app-store');
    return url.toString();
  };

  const detailUrl = application => `/plataformas/${encodeURIComponent(slugOf(application))}`;

  const escapeHtml = value => safeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const captureApplications = payload => {
    const applications = Array.isArray(payload) ? payload : (Array.isArray(payload?.applications) ? payload.applications : []);
    if (!applications.length) return;
    cachedApplications = applications;
    scheduleLoad();
  };

  const installStyles = () => {
    if (document.getElementById('pt-app-store-styles')) return;
    const style = document.createElement('style');
    style.id = 'pt-app-store-styles';
    style.textContent = `
      #plataformas.pt-store-enhanced .mkt-platform-grid{display:none!important}
      .pt-app-store{margin-top:34px;border:1px solid rgba(118,229,255,.16);border-radius:30px;padding:clamp(20px,4vw,36px);background:linear-gradient(145deg,rgba(7,22,31,.96),rgba(3,12,18,.98));box-shadow:0 24px 80px rgba(0,0,0,.28);overflow:hidden;position:relative}
      .pt-app-store:before{content:"";position:absolute;inset:-35% auto auto 60%;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(49,213,255,.14),transparent 68%);pointer-events:none}
      .pt-store-head{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:24px;position:relative;z-index:1}
      .pt-store-head small{display:block;margin-bottom:8px;color:#72e5ff;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}
      .pt-store-head h3{margin:0;color:#f3fdff;font-size:clamp(25px,4vw,42px);line-height:1.03;letter-spacing:-.035em}
      .pt-store-head p{max-width:560px;margin:10px 0 0;color:#9ab7c0;line-height:1.6}
      .pt-store-count{flex:none;display:grid;place-items:center;min-width:88px;min-height:70px;padding:10px 14px;border:1px solid rgba(118,229,255,.16);border-radius:18px;background:rgba(118,229,255,.055);color:#c9f8ff;text-align:center}
      .pt-store-count strong{font-size:22px}.pt-store-count span{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#7998a2}
      .pt-store-search{display:flex;align-items:center;gap:10px;margin-bottom:22px;padding:0 15px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.035);position:relative;z-index:1}
      .pt-store-search span{color:#64e5ff;font-size:18px}.pt-store-search input{width:100%;height:50px;border:0;outline:0;background:transparent;color:#ecfbff;font:inherit}.pt-store-search input::placeholder{color:#6f8c95}
      .pt-store-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;position:relative;z-index:1}
      .pt-store-card{min-width:0;display:flex;flex-direction:column;padding:18px;border:1px solid rgba(255,255,255,.075);border-radius:22px;background:linear-gradient(150deg,rgba(255,255,255,.045),rgba(255,255,255,.018));transition:transform .2s ease,border-color .2s ease,background .2s ease}
      .pt-store-card:hover{transform:translateY(-3px);border-color:rgba(105,229,255,.22);background:linear-gradient(150deg,rgba(87,221,255,.07),rgba(255,255,255,.02))}
      .pt-store-card-top{display:flex;align-items:center;gap:13px;margin-bottom:15px}.pt-store-logo{width:58px;height:58px;flex:none;border-radius:18px;overflow:hidden;display:grid;place-items:center;background:#091820;border:1px solid rgba(255,255,255,.08)}.pt-store-logo img{width:100%;height:100%;object-fit:contain;padding:6px;box-sizing:border-box}
      .pt-store-meta{min-width:0}.pt-store-meta small{display:block;color:#6bdcf4;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.pt-store-meta h4{margin:4px 0 0;color:#effcff;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pt-store-description{min-height:66px;margin:0 0 18px;color:#8eaab4;font-size:13px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .pt-store-actions{display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:auto}.pt-store-install,.pt-store-details{min-height:43px;border-radius:13px;font:inherit;font-size:12px;font-weight:900;text-decoration:none;display:flex;align-items:center;justify-content:center;cursor:pointer}.pt-store-install{border:0;background:#ddfaff;color:#06141a;padding:0 15px}.pt-store-install:hover{filter:brightness(1.05)}.pt-store-details{border:1px solid rgba(255,255,255,.1);background:transparent;color:#b9d5dd;padding:0 13px}.pt-store-install[disabled]{opacity:.48;cursor:not-allowed}
      .pt-store-empty{grid-column:1/-1;padding:28px;border:1px dashed rgba(255,255,255,.12);border-radius:18px;color:#87a3ad;text-align:center}
      .pt-store-note{margin:16px 0 0;color:#68858f;font-size:11px;line-height:1.5;position:relative;z-index:1}.pt-store-note strong{color:#9ec4ce}
      @media(max-width:980px){.pt-store-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){.pt-app-store{border-radius:24px;padding:18px}.pt-store-head{align-items:flex-start}.pt-store-count{min-width:70px;min-height:60px}.pt-store-grid{grid-template-columns:1fr}.pt-store-description{min-height:auto}.pt-store-actions{grid-template-columns:1fr auto}}
    `;
    document.head.appendChild(style);
  };

  const cardTemplate = application => {
    const appUrl = safeApplicationUrl(application);
    const mobile = isMobile();
    const actionLabel = mobile ? 'Instalar' : 'Abrir aplicativo';
    const installUrl = mobile ? installIntentUrl(application) : appUrl?.toString();
    const disabled = !installUrl;
    const description = application?.description || 'Aplicativo desenvolvido e operado no ecossistema Peter Tecnet.';
    return `<article class="pt-store-card" data-name="${escapeHtml(normalize(`${application?.name} ${application?.description} ${application?.slug}`))}">
      <div class="pt-store-card-top">
        <span class="pt-store-logo"><img src="${escapeHtml(resolveLogo(application?.logo))}" alt="Logo ${escapeHtml(application?.name || 'Peter Tecnet')}" loading="lazy" onerror="this.src='${FALLBACK_LOGO}'"></span>
        <div class="pt-store-meta"><small>Aplicativo Peter Tecnet</small><h4>${escapeHtml(application?.name || 'Aplicativo')}</h4></div>
      </div>
      <p class="pt-store-description">${escapeHtml(description)}</p>
      <div class="pt-store-actions">
        <button class="pt-store-install" type="button" data-install-url="${escapeHtml(installUrl || '')}" ${disabled ? 'disabled' : ''}>${actionLabel}</button>
        <a class="pt-store-details" href="${escapeHtml(detailUrl(application))}" aria-label="Conhecer ${escapeHtml(application?.name || 'aplicativo')}">Detalhes</a>
      </div>
    </article>`;
  };

  const render = applications => {
    const section = document.getElementById('plataformas');
    const container = section?.querySelector('.mkt-container');
    if (!section || !container || !Array.isArray(applications) || !applications.length) return false;

    installStyles();
    section.classList.add('pt-store-enhanced');

    let store = document.getElementById(STORE_ID);
    if (!store) {
      store = document.createElement('div');
      store.id = STORE_ID;
      store.className = 'pt-app-store';
      container.appendChild(store);
    }

    const usableApps = applications.filter(application => safeText(application?.name));
    store.innerHTML = `<div class="pt-store-head">
      <div><small>Peter Tecnet App Store</small><h3>Instale nossos aplicativos.</h3><p>Escolha um produto do ecossistema e abra a experiência de instalação no seu celular.</p></div>
      <div class="pt-store-count"><strong>${usableApps.length}</strong><span>apps</span></div>
    </div>
    <label class="pt-store-search"><span aria-hidden="true">⌕</span><input type="search" autocomplete="off" placeholder="Buscar aplicativo..." aria-label="Buscar aplicativo Peter Tecnet"></label>
    <div class="pt-store-grid">${usableApps.map(cardTemplate).join('')}</div>
    <p class="pt-store-note"><strong>No celular:</strong> o botão envia você diretamente ao aplicativo com intenção de instalação. O prompt final é controlado pelo Chrome/Safari e pelo próprio PWA por segurança do navegador.</p>`;

    const input = store.querySelector('.pt-store-search input');
    const grid = store.querySelector('.pt-store-grid');
    const cards = [...store.querySelectorAll('.pt-store-card')];

    input?.addEventListener('input', event => {
      const term = normalize(event.target.value);
      let visible = 0;
      cards.forEach(card => {
        const show = !term || safeText(card.dataset.name).includes(term);
        card.hidden = !show;
        if (show) visible += 1;
      });
      const previous = grid?.querySelector('.pt-store-empty');
      if (!visible && !previous) grid?.insertAdjacentHTML('beforeend', '<div class="pt-store-empty">Nenhum aplicativo encontrado.</div>');
      if (visible && previous) previous.remove();
    });

    store.querySelectorAll('.pt-store-install').forEach(button => {
      button.addEventListener('click', () => {
        const target = safeText(button.dataset.installUrl);
        if (!target) return;
        if (isMobile()) window.location.assign(target);
        else window.open(target, '_blank', 'noopener,noreferrer');
      });
    });

    return true;
  };

  const load = async (allowNetworkFallback = false) => {
    const section = document.getElementById('plataformas');
    if (!section) return;

    if (!cachedApplications && Array.isArray(window.__PETERTECNET_APPLICATIONS__)) {
      captureApplications(window.__PETERTECNET_APPLICATIONS__);
    }

    if (cachedApplications) {
      render(cachedApplications);
      return;
    }

    if (!allowNetworkFallback || loadingFallback) return;

    loadingFallback = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    try {
      const response = await fetch(API_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`applications:${response.status}`);
      const payload = await response.json();
      captureApplications(payload);
    } catch {
      // Progressive enhancement: if data is unavailable, keep the original grid.
    } finally {
      window.clearTimeout(timeout);
      loadingFallback = false;
    }
  };

  function scheduleLoad() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      if (!document.getElementById(STORE_ID)) load(false);
    });
  }

  const start = () => {
    load(false);
    const observer = new MutationObserver(scheduleLoad);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pageshow', scheduleLoad);
    window.addEventListener('popstate', scheduleLoad);
    window.addEventListener('petertecnet:applications', event => {
      captureApplications(event.detail?.applications || []);
    });

    // Give React the first chance to publish the applications payload. Only use
    // a bounded network fallback if that shared payload never arrives.
    window.setTimeout(() => {
      if (!cachedApplications) load(true);
    }, 1800);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
