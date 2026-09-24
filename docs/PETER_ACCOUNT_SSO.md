# Conta Peter Tecnet — SSO entre produtos

O portal Peter Tecnet e os aplicativos do ecossistema usam a API central para trocar de produto sem compartilhar o JWT principal pela URL.

## Fluxo

1. O aplicativo autenticado consulta `GET /api/account/ecosystem`.
2. O launcher exibe os produtos ativos e o estado de acesso da conta.
3. Ao abrir outro produto, o frontend solicita `POST /api/account/sso/handoff`.
4. Somente o código temporário `peter_sso` é enviado ao subdomínio de destino.
5. Antes de inicializar o aplicativo, o `PeterAccountGateway` troca esse código em `POST /api/account/sso/exchange`.
6. O destino recebe um JWT próprio, remove o código da URL e inicializa sua autenticação normal.

O launcher aceita redirecionamentos apenas para HTTPS no domínio `petertecnet.com.br` ou seus subdomínios.
