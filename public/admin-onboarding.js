(() => {
  const API = 'https://api.petertecnet.com.br/api';
  const TOKEN_KEY = 'token';

  const css = `
    .pto-overlay{position:fixed;inset:0;z-index:99999;background:rgba(1,7,11,.82);backdrop-filter:blur(12px);display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif;color:#edfaff}
    .pto-modal{width:min(980px,100%);max-height:92vh;overflow:auto;background:linear-gradient(160deg,#07151d,#0b202b);border:1px solid rgba(79,211,255,.28);border-radius:24px;box-shadow:0 30px 100px rgba(0,0,0,.55);padding:28px}
    .pto-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:22px}.pto-head h2{margin:4px 0 8px;font-size:28px}.pto-head p{margin:0;color:#9db5c1}.pto-kicker{font-size:12px;text-transform:uppercase;letter-spacing:.15em;color:#4fd3ff}.pto-close{border:0;background:#102c38;color:#dff8ff;width:40px;height:40px;border-radius:12px;cursor:pointer;font-size:20px}
    .pto-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pto-wide{grid-column:1/-1}.pto-field{display:grid;gap:7px}.pto-field span{font-size:13px;color:#b8ced8}.pto-field input,.pto-field select,.pto-field textarea{width:100%;box-sizing:border-box;background:#061219;border:1px solid #173a49;border-radius:12px;color:#effcff;padding:12px 14px;outline:none}.pto-field textarea{min-height:92px;resize:vertical}.pto-field input:focus,.pto-field select:focus,.pto-field textarea:focus{border-color:#4fd3ff}
    .pto-section{margin-top:22px;padding-top:20px;border-top:1px solid rgba(255,255,255,.08)}.pto-section-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.pto-section-title h3{margin:0;font-size:18px}.pto-check{display:flex;align-items:center;gap:9px;color:#c5dbe4}.pto-check input{accent-color:#4fd3ff}
    .pto-item{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;margin-bottom:10px}.pto-remove{border:1px solid #5f2a2a;background:#271313;color:#ffc5c5;border-radius:10px;padding:0 12px;cursor:pointer}.pto-add{border:1px dashed #2c687d;background:#09202a;color:#8ee6ff;border-radius:12px;padding:10px 14px;cursor:pointer}.pto-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px}.pto-primary{border:0;border-radius:13px;background:linear-gradient(135deg,#4fd3ff,#5a8cff);color:#041019;font-weight:800;padding:13px 20px;cursor:pointer}.pto-primary:disabled{opacity:.55;cursor:wait}.pto-secondary{border:1px solid #244b5b;border-radius:13px;background:#0a202a;color:#dff7ff;padding:13px 18px;cursor:pointer}.pto-message{margin-top:14px;padding:12px 14px;border-radius:12px;background:#0b2934;color:#aeeeff}.pto-message.error{background:#32171a;color:#ffc4c8}.pto-sidebar-button{position:relative}.pto-sidebar-button::after{content:'NOVO';font-size:9px;padding:2px 5px;border-radius:5px;background:#4fd3ff;color:#041019;margin-left:7px;font-weight:800}
    .pto-activation{min-height:100vh;background:radial-gradient(circle at top,#12394b 0,#061118 38%,#01070b 100%);display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif;color:#edfaff}.pto-card{width:min(540px,100%);background:rgba(8,25,34,.94);border:1px solid rgba(79,211,255,.25);border-radius:24px;padding:30px;box-shadow:0 30px 90px rgba(0,0,0,.5)}.pto-brand{display:flex;align-items:center;gap:12px;margin-bottom:26px}.pto-brand img{width:46px;height:46px;object-fit:contain}.pto-card h1{font-size:28px;margin:0 0 10px}.pto-card p{color:#a9c0ca;line-height:1.6}.pto-card form{display:grid;gap:14px;margin-top:20px}.pto-card button{width:100%}.pto-password-hint{font-size:12px;color:#819ba6!important}.pto-code{font-size:18px!important;letter-spacing:.18em;text-transform:uppercase;font-weight:800}.pto-success{text-align:center}.pto-success a{display:inline-block;margin-top:16px;text-decoration:none}
    @media(max-width:760px){.pto-grid{grid-template-columns:1fr}.pto-wide{grid-column:auto}.pto-item{grid-template-columns:1fr}.pto-modal{padding:20px}.pto-actions{flex-direction:column-reverse}.pto-actions button{width:100%}}
  `;

  function injectStyles(){if(document.getElementById('pto-style'))return;const style=document.createElement('style');style.id='pto-style';style.textContent=css;document.head.appendChild(style);}
  function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function validationMessage(data){const first=Object.values(data?.errors||{}).flat().filter(Boolean)[0];return first||data?.error||data?.message||'Não foi possível concluir a operação.';}
  async function api(path,options={}){const token=localStorage.getItem(TOKEN_KEY);const res=await fetch(`${API}${path}`,{...options,headers:{Accept:'application/json','Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(validationMessage(data));return data;}
  function safeAppUrl(raw){try{const url=new URL(raw);const host=url.hostname.toLowerCase();if(url.protocol!=='https:')return'https://petertecnet.com.br';if(host==='petertecnet.com.br'||host.endsWith('.petertecnet.com.br'))return url.origin+url.pathname.replace(/\/$/,'');}catch{}return'https://petertecnet.com.br';}

  function activationPage(){
    if(window.location.pathname.replace(/\/+$/,'')!=='/invite-complete')return false;
    injectStyles();
    const params=new URLSearchParams(location.search);
    const email=params.get('email')||'';
    const appId=Number(params.get('app_id')||0);
    const appName=params.get('app_name')||'aplicativo Peter Tecnet';

    const render=()=>{
      document.body.innerHTML=`<main class="pto-activation"><section class="pto-card"><div class="pto-brand"><img src="/petertecnetlogo.png" alt=""><div><strong>Peter Tecnet</strong><div class="pto-kicker">Validação e criação de senha</div></div></div><h1>Ative seu acesso</h1><p>Seu acesso ao <strong>${escapeHtml(appName)}</strong> foi preparado. Digite o código recebido no e-mail para validar seu endereço e crie sua senha.</p><form id="pto-activate-form"><label class="pto-field"><span>E-mail</span><input value="${escapeHtml(email)}" readonly></label><label class="pto-field"><span>Código de verificação</span><input id="pto-code" class="pto-code" type="text" autocomplete="one-time-code" maxlength="12" required placeholder="Digite o código do e-mail"></label><label class="pto-field"><span>Nova senha</span><input id="pto-password" type="password" autocomplete="new-password" required minlength="8"></label><label class="pto-field"><span>Confirmar nova senha</span><input id="pto-confirm" type="password" autocomplete="new-password" required minlength="8"></label><p class="pto-password-hint">A senha deve ter pelo menos 8 caracteres, com letra maiúscula, minúscula, número e símbolo.</p><div id="pto-activate-message"></div><button class="pto-primary" type="submit">Validar e criar minha senha</button></form></section></main>`;

      document.getElementById('pto-activate-form').addEventListener('submit',async e=>{
        e.preventDefault();
        const code=document.getElementById('pto-code').value.trim().toUpperCase();
        const pass=document.getElementById('pto-password').value;
        const confirm=document.getElementById('pto-confirm').value;
        const msg=document.getElementById('pto-activate-message');
        if(!appId){msg.className='pto-message error';msg.textContent='Este convite não identifica o aplicativo. Solicite um novo convite.';return;}
        if(!code){msg.className='pto-message error';msg.textContent='Digite o código de verificação enviado por e-mail.';return;}
        if(pass!==confirm){msg.className='pto-message error';msg.textContent='As senhas não coincidem.';return;}
        const button=e.currentTarget.querySelector('button');button.disabled=true;button.textContent='Validando...';
        try{
          const result=await api('/auth/invite-complete',{method:'POST',body:JSON.stringify({email,verification_code:code,password:pass,app_id:appId})});
          const application=result?.application||{};
          const resolvedName=application.name||appName;
          const resolvedUrl=safeAppUrl(application.url||'');
          document.querySelector('.pto-card').innerHTML=`<div class="pto-success"><div class="pto-brand"><img src="/petertecnetlogo.png" alt=""><div><strong>Peter Tecnet</strong></div></div><h1>E-mail validado e acesso ativado</h1><p>Sua senha foi criada com sucesso. O endereço abaixo foi obtido diretamente do cadastro atual do aplicativo.</p><a class="pto-primary" href="${escapeHtml(resolvedUrl)}">Acessar ${escapeHtml(resolvedName)}</a></div>`;
        }catch(err){msg.className='pto-message error';msg.textContent=err.message;button.disabled=false;button.textContent='Validar e criar minha senha';}
      });
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(render,50));else setTimeout(render,50);
    return true;
  }

  function itemRow(){return `<div class="pto-item" data-item-row><input data-k="name" placeholder="Nome do item/serviço" required><select data-k="type"><option value="service">Serviço</option><option value="product">Produto</option><option value="item">Item</option><option value="ticket">Ingresso</option></select><input data-k="price" type="number" min="0" step="0.01" placeholder="Preço" value="0" required><button type="button" class="pto-remove" title="Remover">×</button></div>`;}

  async function openOnboarding(){
    injectStyles();
    let apps=[];try{const payload=await api('/admin/applications');apps=payload?.applications||payload?.data||[];}catch(err){alert(err.message);return;}
    const overlay=document.createElement('div');overlay.className='pto-overlay';overlay.innerHTML=`<section class="pto-modal" role="dialog" aria-modal="true"><div class="pto-head"><div><div class="pto-kicker">Onboarding administrado</div><h2>Preparar novo cliente</h2><p>Informe o e-mail, escolha o aplicativo e, se quiser, entregue empresa e catálogo já preparados.</p></div><button class="pto-close" type="button">×</button></div><form id="pto-form"><div class="pto-grid"><label class="pto-field"><span>E-mail do cliente *</span><input name="email" type="email" autocomplete="off" required placeholder="cliente@empresa.com"></label><label class="pto-field"><span>Aplicativo *</span><select name="app_id" required><option value="">Selecione</option>${apps.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></label></div><div class="pto-section"><div class="pto-section-title"><h3>Empresa do cliente</h3><label class="pto-check"><input id="pto-company-toggle" type="checkbox"> Criar establishment agora</label></div><div id="pto-company" class="pto-grid" style="display:none"><label class="pto-field"><span>Nome/Razão social *</span><input name="company_name"></label><label class="pto-field"><span>Nome fantasia</span><input name="fantasy"></label><label class="pto-field"><span>CNPJ</span><input name="cnpj"></label><label class="pto-field"><span>Telefone</span><input name="phone"></label><label class="pto-field"><span>Categoria</span><input name="category"></label><label class="pto-field"><span>Cidade</span><input name="city"></label><label class="pto-field"><span>UF</span><input name="uf" maxlength="2"></label><label class="pto-field"><span>CEP</span><input name="cep"></label><label class="pto-field pto-wide"><span>Endereço</span><input name="address"></label><label class="pto-field pto-wide"><span>Descrição</span><textarea name="description"></textarea></label><label class="pto-check"><input name="approved" type="checkbox" checked> Aprovar automaticamente</label><label class="pto-check"><input name="published" type="checkbox" checked> Publicar automaticamente</label></div></div><div class="pto-section" id="pto-items-section" style="display:none"><div class="pto-section-title"><h3>Itens iniciais</h3><button class="pto-add" id="pto-add-item" type="button">+ Adicionar item</button></div><div id="pto-items"></div></div><div id="pto-message"></div><div class="pto-actions"><button type="button" class="pto-secondary pto-cancel">Cancelar</button><button type="submit" class="pto-primary">Criar cadastro e enviar convite</button></div></form></section>`;
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();overlay.querySelector('.pto-close').onclick=close;overlay.querySelector('.pto-cancel').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
    const toggle=overlay.querySelector('#pto-company-toggle');const company=overlay.querySelector('#pto-company');const itemsSection=overlay.querySelector('#pto-items-section');toggle.onchange=()=>{company.style.display=toggle.checked?'grid':'none';itemsSection.style.display=toggle.checked?'block':'none';company.querySelector('[name=company_name]').required=toggle.checked;};
    const items=overlay.querySelector('#pto-items');overlay.querySelector('#pto-add-item').onclick=()=>items.insertAdjacentHTML('beforeend',itemRow());items.addEventListener('click',e=>{if(e.target.classList.contains('pto-remove'))e.target.closest('[data-item-row]').remove();});
    overlay.querySelector('#pto-form').addEventListener('submit',async e=>{
      e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);const payload={email:String(fd.get('email')||'').trim(),app_id:Number(fd.get('app_id'))};
      if(toggle.checked){payload.establishment={name:String(fd.get('company_name')||'').trim(),fantasy:String(fd.get('fantasy')||'').trim()||null,cnpj:String(fd.get('cnpj')||'').trim()||null,phone:String(fd.get('phone')||'').trim()||null,category:String(fd.get('category')||'').trim()||null,city:String(fd.get('city')||'').trim()||null,uf:String(fd.get('uf')||'').trim().toUpperCase()||null,cep:String(fd.get('cep')||'').trim()||null,address:String(fd.get('address')||'').trim()||null,description:String(fd.get('description')||'').trim()||null,is_approved:fd.get('approved')==='on',is_published:fd.get('published')==='on'};payload.items=[...items.querySelectorAll('[data-item-row]')].map(row=>({name:row.querySelector('[data-k=name]').value.trim(),type:row.querySelector('[data-k=type]').value,price:Number(row.querySelector('[data-k=price]').value||0)})).filter(i=>i.name);}
      const msg=overlay.querySelector('#pto-message');const button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Preparando cliente...';msg.className='pto-message';msg.textContent='Preparando usuário, acesso, empresa e itens...';
      try{const result=await api('/admin/ecosystem/onboarding',{method:'POST',body:JSON.stringify(payload)});msg.className='pto-message';msg.textContent=`${result.message} ${result.establishment?`Empresa #${result.establishment.id} criada. `:''}${result.items_count?`${result.items_count} item(ns) cadastrado(s).`:''}`;button.textContent='Convite enviado';setTimeout(close,3600);}catch(err){msg.className='pto-message error';msg.textContent=err.message;button.disabled=false;button.textContent='Criar cadastro e enviar convite';}
    });
  }

  function installAdminButton(){
    if(!window.location.pathname.startsWith('/admin'))return;
    injectStyles();
    const tryInstall=()=>{const nav=document.querySelector('.ecosystem-sidebar nav');if(!nav||nav.querySelector('[data-pto-onboarding]'))return;const button=document.createElement('button');button.type='button';button.dataset.ptoOnboarding='1';button.className='pto-sidebar-button';button.textContent='Onboarding de cliente';button.addEventListener('click',openOnboarding);const users=[...nav.querySelectorAll('button')].find(b=>b.textContent.trim()==='Usuários');if(users?.nextSibling)nav.insertBefore(button,users.nextSibling);else nav.appendChild(button);};
    const observer=new MutationObserver(tryInstall);observer.observe(document.documentElement,{childList:true,subtree:true});tryInstall();
  }

  if(!activationPage())installAdminButton();
})();
