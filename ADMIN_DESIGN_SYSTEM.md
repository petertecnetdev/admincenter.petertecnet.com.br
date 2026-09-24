# Peter Tecnet Admin Center — Design System

## Regra de arquitetura
`src/AdminDesignSystem.css` é a fonte canônica de tokens. Novos módulos devem consumir `--pt-*`; não devem criar paletas, escalas de espaçamento, z-index ou alturas de controles próprias. Compatibility aliases `--admin-*` existem apenas durante a migração.

## Camadas
1. `AdminDesignSystem.css`: tokens e primitives globais.
2. CSS estrutural existente: layout/compatibilidade durante migração.
3. `AdminUiKit.css`: componentes reutilizáveis.
4. CSS de módulo: somente composição e necessidades específicas.
5. Overrides: exceção documentada, nunca estratégia padrão.

## Tokens
Cores: `--pt-bg`, `--pt-surface*`, `--pt-text*`, `--pt-accent*`, `--pt-success`, `--pt-warning`, `--pt-danger`, `--pt-info`.
Espaçamento: `--pt-space-1..12`. Tipografia: `--pt-font-*` e `--pt-leading-*`. Radius: `--pt-radius-*`. Sombras: `--pt-shadow-*`. Controles: `--pt-control-*`. Shell: `--pt-sidebar-width`, `--pt-sidebar-drawer`, `--pt-topbar-height`, `--pt-content-max`. Z-index: `--pt-z-*`.

## Identidade por módulo
A shell define `--pt-module`/`--pt-module-rgb` para dashboard, operations, agents, financial, applications, users, establishments, items, notifications e activity. Componentes devem usar essa variável para contexto sem inventar uma identidade isolada.

## Primitives
`pt-stack`, `pt-grid`, `pt-surface` e `pt-status` são primitives de baixa especificidade. Controles têm foco visível e alvo mínimo de 44px. `prefers-reduced-motion` e `prefers-contrast` são respeitados.

## Checklist 1–100 — evidência desta rodada
- **Concluído com fundação canônica:** 1–15, 21–25, 28–29, 32, 36–39, 47, 50, 57, 61–64, 79–80, 91, 94–95.
- **Já existente no App/shell e preservado:** 51–56, 65–73, 75–78, 81–90, 96–100. Revalidar comportamento em browser antes de encerrar o plano.
- **Parcial / migração necessária:** 16–20 (cores/tamanhos/`!important`/CSS legado), 26–27 (inline e exceções), 30 (referência visual interativa), 31, 33–35, 40–46, 48–49, 58–60, 74.

Nenhum item parcial deve ser marcado concluído só pela existência dos tokens. A conclusão exige migração dos consumidores e validação visual/runtime.
