# Integração do portal Peter Tecnet

O portal inicializa o `PeterAccountGateway` no ponto de entrada da aplicação. Sessões do Admin Center são espelhadas para a chave de sessão do ecossistema durante o bootstrap para manter compatibilidade com o login administrativo existente.

O gateway consulta o catálogo autorizado da Conta Peter Tecnet, recebe handoffs de uso único e permite abrir produtos autorizados sem transportar JWT em URL.
