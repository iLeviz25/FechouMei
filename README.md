# FechouMEI

MVP base de um SaaS financeiro para MEIs, com autenticação real via Supabase, onboarding, dashboard inicial e movimentações reais.

## Estrutura criada

- `app/login`: login com e-mail e senha
- `app/cadastro`: criação de conta com e-mail e senha
- `app/onboarding`: formulário inicial do perfil do usuário
- `app/app/dashboard`: dashboard autenticado
- `app/app/movimentacoes`: CRUD real de entradas e despesas
- `app/app/*`: áreas autenticadas do app
- `components/auth`: telas e formulários de autenticação
- `components/onboarding`: formulário de onboarding
- `components/app`: shell, sidebar e navegação do app
- `components/dashboard`: dashboard base
- `components/movimentacoes`: interface real de movimentações
- `components/ui`: componentes shadcn/ui locais
- `lib/supabase`: clients Supabase para browser/server
- `supabase/migrations`: SQL de `profiles`, `movimentacoes`, RLS e triggers

## Como rodar localmente

1. Crie um projeto no Supabase.
2. Rode as migrations em `supabase/migrations` no SQL Editor ou via Supabase CLI.
3. Copie `.env.example` para `.env.local`.
4. Preencha:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Instale as dependências:
   ```bash
   npm.cmd install
   ```
6. Rode o app:
   ```bash
   npm.cmd run dev
   ```
7. Abra [http://localhost:3000](http://localhost:3000).

## Fluxo implementado

- Usuário cria conta com e-mail e senha.
- Usuário faz login com e-mail e senha.
- Usuário sem sessão é redirecionado para `/login` ao tentar acessar páginas autenticadas.
- Usuário logado não precisa voltar para `/login` ou `/cadastro`.
- Usuário logado sem onboarding completo vai para `/onboarding`.
- Ao finalizar o onboarding, os dados são salvos em `profiles` e o usuário vai para `/app/dashboard`.
- Usuário autenticado pode criar, listar, editar e excluir movimentações.

## Banco de dados

As migrations criam:

- `profiles`: perfil básico, onboarding e dados iniciais do usuário
- `movimentacoes`: entradas e despesas do usuário autenticado

As tabelas usam RLS para cada usuário acessar apenas os próprios dados.

## Padrão de texto

- Textos visíveis na interface devem usar português correto, com acentos e cedilha.
- Nomes internos de arquivos, rotas, variáveis, funções e banco continuam sem acento.
- Antes de finalizar mudanças de UI, revise títulos, botões, labels, placeholders e mensagens exibidas ao usuário.

## Ainda mockado nesta etapa

- Valores financeiros do dashboard.
- Cálculo real do limite do MEI.
- Páginas de fechamento mensal, obrigações e configurações.
