(() => {
  'use strict';

  if (window.__PETERTECNET_APP_STORE_INSTALL_STATE__) return;
  window.__PETERTECNET_APP_STORE_INSTALL_STATE__ = true;

  const COOKIE_NAME = 'pt_pwa_installed_apps';
  const STORE_ID = 'peter-app-store';
  let scheduled = false;

  const safeText = value => String(value || '').trim();
  const normalizeSlug = value => safeText(value)
    .toLowerCase()
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

  const installedRegistry = () => {
    const prefix = `${COOKIE_NAME}=`;
    const raw = document.cookie
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(prefix));

    if (!raw) return new Set();

    try {
      return new Set(
        decodeURIComponent(raw.slice(prefix.length))
          .split(',')
          .map(normalizeSlug)
          .filter(Boolean),
      );
    } catch (_) {
      return new Set();
    }
  };

  const slugFromCard = card => {
    const details = card?.querySelector('.pt-store-details');
    const href = details?.getAttribute('href');
    if (!href) return '';

    try {
      const url = new URL(href, window.location.origin);
      const match = url.pathname.match(/^\/plataformas\/([^/]+)\/?$/i);
      return normalizeSlug(match ? decodeURIComponent(match[1]) : '');
    } catch (_) {
      return '';
    }
  };

  const directAppUrl = value => {
    const raw = safeText(value);
    if (!raw) return '';

    try {
      const url = new URL(raw, window.location.href);
      url.searchParams.delete('install');
      url.searchParams.delete('source');
      return url.toString();
    } catch (_) {
      return raw;
    }
  };

  const setButtonText = (button, text) => {
    if (safeText(button.textContent) !== text) button.textContent = text;
  };

  const apply = () => {
    scheduled = false;

    const store = document.getElementById(STORE_ID);
    if (!store) return;

    const installed = installedRegistry();
    const mobile = isMobile();

    store.querySelectorAll('.pt-store-card').forEach(card => {
      const button = card.querySelector('.pt-store-install');
      if (!button) return;

      if (!button.dataset.installIntentUrl) {
        button.dataset.installIntentUrl = safeText(button.dataset.installUrl);
      }

      const slug = slugFromCard(card);
      const isInstalled = Boolean(slug && installed.has(slug));
      const installIntentUrl = safeText(button.dataset.installIntentUrl);
      const openUrl = directAppUrl(installIntentUrl);

      if (isInstalled) {
        setButtonText(button, 'Abrir');
        button.dataset.installState = 'installed';
        button.dataset.installUrl = openUrl;
        button.setAttribute('aria-label', `Abrir ${slug || 'aplicativo'}`);
        return;
      }

      const label = mobile ? 'Instalar' : 'Abrir aplicativo';
      button.dataset.installState = 'not-installed';
      setButtonText(button, label);
      button.dataset.installUrl = mobile ? installIntentUrl : openUrl;
      button.setAttribute('aria-label', mobile ? `Instalar ${slug || 'aplicativo'}` : `Abrir ${slug || 'aplicativo'}`);
    });
  };

  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(apply);
  };

  const observer = new MutationObserver(scheduleApply);
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleApply();
  };

  window.addEventListener('pageshow', scheduleApply);
  window.addEventListener('focus', scheduleApply);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleApply(); });
  window.addEventListener('petertecnet:pwa-install-state', scheduleApply);

  if ('cookieStore' in window && typeof window.cookieStore?.addEventListener === 'function') {
    window.cookieStore.addEventListener('change', event => {
      const changed = [...(event.changed || []), ...(event.deleted || [])];
      if (changed.some(cookie => cookie?.name === COOKIE_NAME)) scheduleApply();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
