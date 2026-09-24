(() => {
  'use strict';

  if (window.__PETER_ADDRESS_FORMS__) return;
  window.__PETER_ADDRESS_FORMS__ = true;

  const API_HOST = 'https://api.petertecnet.com.br/api/v1/apps';
  const hostname = window.location.hostname.toLowerCase();
  const rootHost = hostname === 'petertecnet.com.br' || hostname === 'www.petertecnet.com.br';
  const appSlug = rootHost ? 'petertecnet' : (hostname.endsWith('.petertecnet.com.br') ? hostname.split('.')[0] : null);
  if (!appSlug) return;

  const locationApi = `${API_HOST}/${encodeURIComponent(appSlug)}/locations`;
  const boundCities = new WeakSet();
  const boundCeps = new WeakSet();
  const cityState = new WeakMap();
  let menu = null;
  let activeInput = null;

  const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const digits = (value) => String(value || '').replace(/\D/g, '').slice(0, 8);
  const formatCep = (value) => {
    const clean = digits(value);
    return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
  };

  const fieldLabel = (field) => {
    const id = field.id && String(field.id).replace(/(["\\])/g, '\\$1');
    const external = id ? document.querySelector(`label[for="${id}"]`) : null;
    const wrapping = field.closest('label');
    const local = field.parentElement?.querySelector(':scope > label, :scope > span, :scope > .form-label');
    return normalize(external?.textContent || wrapping?.textContent || local?.textContent || '');
  };

  const roleOf = (field) => {
    if (!field || !['INPUT', 'SELECT', 'TEXTAREA'].includes(field.tagName)) return null;
    const name = normalize(field.name);
    const id = normalize(field.id);
    const label = fieldLabel(field);
    const key = name || id;

    if (['cep', 'postal_code', 'postalcode', 'zipcode', 'zip_code'].includes(key) || /^cep\b/.test(label)) return 'cep';
    if (['city', 'cidade', 'merchant_city'].includes(key) || /^cidade\b/.test(label)) return 'city';
    if (['uf', 'state'].includes(key) || label === 'uf' || /^uf\b/.test(label) || /^estado\s*\(uf\)/.test(label)) return 'uf';
    if (['address_number', 'number', 'numero'].includes(key) || /^numero\b/.test(label)) return 'number';
    if (['neighborhood', 'bairro'].includes(key) || /^bairro\b/.test(label)) return 'neighborhood';
    if (['address_complement', 'complement', 'complemento'].includes(key) || /^complemento\b/.test(label)) return 'complement';
    if (['address_reference', 'reference', 'referencia'].includes(key) || /^referencia\b/.test(label)) return 'reference';
    if (['street', 'logradouro'].includes(key) || /^logradouro\b/.test(label) || /^rua\b/.test(label)) return 'street';
    if (key === 'address' || /^endereco(?!\s+de\s+e-mail)\b/.test(label)) return 'address';
    if (key === 'city_id') return 'city_id';
    return null;
  };

  const controls = (scope) => Array.from((scope || document).querySelectorAll('input, select, textarea'));
  const findField = (scope, roles) => {
    const wanted = Array.isArray(roles) ? roles : [roles];
    return controls(scope).find((field) => wanted.includes(roleOf(field))) || null;
  };

  const scopeFor = (field) => field.form || field.closest('form') || field.closest('[role="dialog"], .modal, .offcanvas, section, article') || document;

  const nativeSet = (field, value) => {
    if (!field || value === undefined || value === null) return;
    const next = String(value);
    if (field.value === next) return;

    field.dataset.ptProgrammatic = '1';
    try {
      const proto = field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : field instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor?.set) descriptor.set.call(field, next);
      else field.value = next;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      delete field.dataset.ptProgrammatic;
    }
  };

  const setOfficialCity = (cityInput, city) => {
    if (!cityInput || !city?.name || !city?.uf) return;
    const scope = scopeFor(cityInput);
    nativeSet(cityInput, city.name);
    cityInput.dataset.ptCityValidated = '1';
    cityInput.dataset.ptCityId = String(city.ibge_code || '');
    cityInput.setCustomValidity('');

    const uf = findField(scope, 'uf');
    if (uf) nativeSet(uf, city.uf);

    const cityId = findField(scope, 'city_id');
    if (cityId && city.ibge_code) nativeSet(cityId, city.ibge_code);

    scope.dispatchEvent(new CustomEvent('peter:city-selected', {
      bubbles: true,
      detail: { city: city.name, uf: city.uf, city_id: city.ibge_code || null },
    }));
  };

  const ensureStyles = () => {
    if (document.getElementById('pt-address-autocomplete-styles')) return;
    const style = document.createElement('style');
    style.id = 'pt-address-autocomplete-styles';
    style.textContent = `
      .pt-city-autocomplete{position:fixed;z-index:2147483646;display:none;max-height:min(320px,42vh);overflow:auto;background:#fff;color:#111827;border:1px solid rgba(15,23,42,.16);border-radius:12px;box-shadow:0 18px 46px rgba(15,23,42,.22);padding:6px;box-sizing:border-box;font:500 14px/1.25 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .pt-city-autocomplete.is-open{display:block}
      .pt-city-autocomplete button{width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:10px 12px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;font:inherit}
      .pt-city-autocomplete button:hover,.pt-city-autocomplete button.is-active{background:#eef4ff}
      .pt-city-autocomplete button strong{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pt-city-autocomplete button span{font-size:12px;font-weight:800;color:#475569;white-space:nowrap}
      .pt-city-autocomplete__empty{padding:11px 12px;color:#64748b;font-size:13px}
      .pt-location-loading{cursor:progress}
    `;
    document.head.appendChild(style);
  };

  const ensureMenu = () => {
    ensureStyles();
    if (menu) return menu;
    menu = document.createElement('div');
    menu.className = 'pt-city-autocomplete';
    menu.setAttribute('role', 'listbox');
    document.body.appendChild(menu);
    return menu;
  };

  const positionMenu = (input) => {
    if (!menu || !input) return;
    const rect = input.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const width = Math.min(Math.max(rect.width, 260), Math.max(260, viewportWidth - 16));
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(320, Math.max(120, menu.scrollHeight || 240));
    const top = spaceBelow >= Math.min(220, estimatedHeight)
      ? rect.bottom + 6
      : Math.max(8, rect.top - estimatedHeight - 6);
    Object.assign(menu.style, { width: `${width}px`, left: `${left}px`, top: `${top}px` });
  };

  const hideMenu = () => {
    if (!menu) return;
    menu.classList.remove('is-open');
    menu.innerHTML = '';
    if (activeInput) activeInput.setAttribute('aria-expanded', 'false');
    activeInput = null;
  };

  const renderCities = (input, items) => {
    const state = cityState.get(input);
    if (!state) return;
    const dropdown = ensureMenu();
    activeInput = input;
    dropdown.innerHTML = '';
    state.items = items;
    state.index = items.length ? 0 : -1;

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'pt-city-autocomplete__empty';
      empty.textContent = 'Nenhuma cidade brasileira encontrada.';
      dropdown.appendChild(empty);
    } else {
      items.forEach((city, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.dataset.index = String(index);
        if (index === state.index) button.classList.add('is-active');
        const name = document.createElement('strong');
        name.textContent = city.name;
        const uf = document.createElement('span');
        uf.textContent = `- ${city.uf}`;
        button.append(name, uf);
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', () => {
          setOfficialCity(input, city);
          hideMenu();
          input.focus();
        });
        dropdown.appendChild(button);
      });
    }

    input.setAttribute('aria-expanded', 'true');
    dropdown.classList.add('is-open');
    positionMenu(input);
  };

  const searchCities = async (input) => {
    const state = cityState.get(input);
    const query = input.value.trim();
    if (!state || query.length < 2) {
      if (activeInput === input) hideMenu();
      return;
    }

    state.controller?.abort();
    state.controller = new AbortController();
    const requestId = ++state.requestId;

    try {
      const response = await fetch(`${locationApi}/cities?q=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' },
        signal: state.controller.signal,
        credentials: 'omit',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (requestId !== state.requestId || document.activeElement !== input) return;
      renderCities(input, Array.isArray(payload?.cities) ? payload.cities : []);
    } catch (error) {
      if (error?.name !== 'AbortError' && activeInput === input) hideMenu();
    }
  };

  const bindCity = (input) => {
    if (boundCities.has(input) || input.readOnly || input.disabled) return;
    boundCities.add(input);
    input.dataset.ptCityValidated = input.value.trim() ? 'legacy' : '';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    if (!input.placeholder) input.placeholder = 'Digite a cidade e selecione Cidade - UF';

    cityState.set(input, { timer: null, controller: null, requestId: 0, items: [], index: -1 });

    input.addEventListener('input', () => {
      if (input.dataset.ptProgrammatic === '1') return;
      const state = cityState.get(input);
      input.dataset.ptCityValidated = input.value.trim() ? '0' : '';
      input.dataset.ptCityId = '';
      input.setCustomValidity('');
      const scope = scopeFor(input);
      const cityId = findField(scope, 'city_id');
      if (cityId) nativeSet(cityId, '');
      clearTimeout(state.timer);
      if (input.value.trim().length < 2) {
        if (activeInput === input) hideMenu();
        return;
      }
      state.timer = window.setTimeout(() => searchCities(input), 260);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2 && input.dataset.ptCityValidated !== '1') searchCities(input);
    });

    input.addEventListener('keydown', (event) => {
      const state = cityState.get(input);
      if (!menu?.classList.contains('is-open') || activeInput !== input || !state.items.length) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        hideMenu();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        state.index = (state.index + direction + state.items.length) % state.items.length;
        menu.querySelectorAll('button').forEach((button, index) => button.classList.toggle('is-active', index === state.index));
        menu.querySelector(`button[data-index="${state.index}"]`)?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const city = state.items[state.index];
        if (city) {
          setOfficialCity(input, city);
          hideMenu();
        }
      }
    });
  };

  const fillFromCep = async (cepInput) => {
    const clean = digits(cepInput.value);
    if (clean.length !== 8 || cepInput.dataset.ptCepLoading === clean) return;

    cepInput.dataset.ptCepLoading = clean;
    cepInput.classList.add('pt-location-loading');
    cepInput.setCustomValidity('');
    nativeSet(cepInput, formatCep(clean));

    try {
      const response = await fetch(`${locationApi}/cep/${clean}`, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const address = payload?.address;
      if (!address) throw new Error('Endereço ausente');

      const scope = scopeFor(cepInput);
      const street = findField(scope, ['street', 'address']);
      const neighborhood = findField(scope, 'neighborhood');
      const complement = findField(scope, 'complement');
      const city = findField(scope, 'city');
      const uf = findField(scope, 'uf');
      const cityId = findField(scope, 'city_id');

      if (street && address.street) nativeSet(street, address.street);
      if (neighborhood && address.neighborhood) nativeSet(neighborhood, address.neighborhood);
      if (complement && !complement.value.trim() && address.complement) nativeSet(complement, address.complement);
      if (uf && address.uf) nativeSet(uf, address.uf);
      if (cityId && address.city_id) nativeSet(cityId, address.city_id);
      if (city && address.city && address.uf) {
        setOfficialCity(city, { name: address.city, uf: address.uf, ibge_code: address.city_id });
      }

      scope.dispatchEvent(new CustomEvent('peter:address-filled', {
        bubbles: true,
        detail: address,
      }));
    } catch {
      cepInput.setCustomValidity('Não foi possível localizar este CEP agora. Confira o CEP ou preencha o endereço e selecione a cidade pela lista.');
    } finally {
      delete cepInput.dataset.ptCepLoading;
      cepInput.classList.remove('pt-location-loading');
    }
  };

  const bindCep = (input) => {
    if (boundCeps.has(input) || input.readOnly || input.disabled) return;
    boundCeps.add(input);
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'postal-code');
    if (!input.placeholder) input.placeholder = '00000-000';

    let timer = null;
    input.addEventListener('input', () => {
      if (input.dataset.ptProgrammatic === '1') return;
      input.setCustomValidity('');
      const masked = formatCep(input.value);
      if (input.value !== masked) nativeSet(input, masked);
      clearTimeout(timer);
      if (digits(masked).length === 8) timer = window.setTimeout(() => fillFromCep(input), 220);
    });
    input.addEventListener('blur', () => fillFromCep(input));
  };

  const bindAll = (root = document) => {
    controls(root).forEach((field) => {
      const role = roleOf(field);
      if (role === 'city') bindCity(field);
      if (role === 'cep') bindCep(field);
    });
  };

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const city = controls(form).find((field) => roleOf(field) === 'city' && !field.disabled && field.offsetParent !== null);
    if (city && city.value.trim() && city.dataset.ptCityValidated === '0') {
      event.preventDefault();
      event.stopImmediatePropagation();
      city.setCustomValidity('Selecione uma cidade válida na lista (Cidade - UF).');
      city.reportValidity();
      city.focus();
      return;
    }

    const cep = controls(form).find((field) => roleOf(field) === 'cep' && !field.disabled && field.offsetParent !== null);
    if (cep && cep.value.trim() && digits(cep.value).length !== 8) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cep.setCustomValidity('Informe um CEP brasileiro válido com 8 números.');
      cep.reportValidity();
      cep.focus();
    }
  }, true);

  document.addEventListener('mousedown', (event) => {
    if (menu?.classList.contains('is-open') && !menu.contains(event.target) && event.target !== activeInput) hideMenu();
  });
  window.addEventListener('resize', () => activeInput && positionMenu(activeInput), { passive: true });
  window.addEventListener('scroll', () => activeInput && positionMenu(activeInput), true);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) {
        const role = roleOf(node);
        if (role === 'city') bindCity(node);
        if (role === 'cep') bindCep(node);
      }
      bindAll(node);
    }));
  });

  const start = () => {
    bindAll(document);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
