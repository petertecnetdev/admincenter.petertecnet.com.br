# Peter Tecnet Frontend Core

Runtime compartilhado e framework-agnostic para os aplicativos `*.petertecnet.com.br`.

## Objetivo

Centralizar infraestrutura de frontend sem transformar o ecossistema em um único frontend acoplado. Cada produto continua responsável pelas próprias rotas, regras de negócio e telas específicas.

## Runtime

Arquivo público versionado:

```text
https://petertecnet.com.br/ecosystem/peter-frontend-core-v1.js?v=1.0.0
```

O runtime expõe `window.PeterTecnetFrontendCore` e não monta interface automaticamente.

## Configuração mínima

```js
window.PeterTecnetFrontendCore.configure({
  appSlug: 'nexus',
  apiBaseUrl: 'https://api.petertecnet.com.br/api',
  features: {
    api: true,
    auth: true,
    notifications: true,
    pwa: true,
    telemetry: true,
  },
  auth: {
    tokenKey: 'token',
    userKey: 'user',
  },
})
```

## Módulos v1

- `features.isEnabled(name)` — feature flags locais por app.
- `auth` — leitura/escrita explícita de sessão, sem substituir o estado React atual.
- `api.request(path, options)` — HTTP padronizado com timeout, `X-Peter-App`, versão do core e bearer token quando habilitado.
- `pwa` — estado de instalação e prompt explícito.
- `notifications` — consulta e solicitação explícita de permissão.
- `telemetry` — ponte para `PeterTecnetTelemetry` quando já carregado.
- `events` — barramento local + eventos globais `peter:frontend-core:*`.

## Web Components

### `<peter-install-button>`

Botão opcional de instalação PWA. Só aparece em dispositivo móvel/coarse pointer quando existe `beforeinstallprompt` disponível e o app ainda não está instalado.

```html
<peter-install-button label="Instalar Nexus"></peter-install-button>
```

O componente nunca é montado automaticamente.

## Regras de compatibilidade

1. O app deve continuar funcionando se o runtime remoto falhar.
2. A integração inicial deve ser um gateway que retorna `null`/não altera layout.
3. Não remover implementação local até existir teste de equivalência funcional.
4. Não compartilhar regras de domínio (eventos, swipes, sinais cripto, propostas etc.).
5. APIs externas são bloqueadas pelo core; produção aceita apenas HTTPS em `petertecnet.com.br` e subdomínios. Localhost é permitido para desenvolvimento.
6. Mudanças incompatíveis exigem nova versão de arquivo/runtime.

## Estratégia de migração

1. Fundação + Nexus piloto.
2. Admin Center.
3. Cutinapp.
4. Rasoio, Plat e Inkap.
5. PayFlow, Laora e Locaio.
6. Só depois extrair primitives visuais, formulários, navegação e Notification Center.
