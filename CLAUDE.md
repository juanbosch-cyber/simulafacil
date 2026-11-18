# SIMULA FÁCIL IA — instruções para o Claude

Site estático publicado pelo GitHub Pages a partir do branch `main`
(https://juanbosch-cyber.github.io/simulafacil/).

## Como publicar (pedido do autor, Prof. Juan, em 14/11/2026)

- Sempre que o autor pedir uma alteração, publique até o fim, sem perguntar de novo:
  faça o commit, envie ao GitHub, abra o pull request e mescle no `main`,
  para o site principal atualizar.
- Não entregue as alterações em zip: faça tudo direto no GitHub.
- Depois de mesclar, diga ao autor o que mudou e confirme que o `main` foi atualizado.

## Onde está o código

- `index.html` — página de apresentação.
- `simulador.html` — o simulador completo.
- Os dois são arquivos únicos, com o CSS e o JavaScript embutidos (os blocos trazem
  comentários como `/* css/app.css */` e `/* js/app.js */`). **Edite sempre estes dois
  arquivos.** Não há `.js` soltos na raiz (as cópias antigas foram removidas). `plotly-2.35.2.min.js` é a biblioteca de gráficos, hospedada no próprio site (com o CDN como reserva).
- `site.webmanifest`, `icon-192.png`, `icon-512.png` — instalação na tela de início do celular.
- `LEIA-ME.txt` — notas de cada versão; acrescente a nova versão no topo.

## Ao alterar

- Texto e comentários em português do Brasil.
- Teste no navegador em 390 px e 320 px (celular, temas claro e escuro) e em 1440 px,
  sem erros de JavaScript e sem rolagem horizontal.
- No celular, todo controle tem pelo menos 44 px de altura (`--tap`) e os campos usam
  fonte de 16 px.
- Não altere as linhas longas de dados embutidos (imagens em base64, bancos de compostos).
- A cada versão nova, atualize o selo e os títulos, o `softwareVersion` dos dados
  estruturados, o `lastmod` do `sitemap.xml` e o `LEIA-ME.txt`.

## Skills do Claude Code (pedido do autor em 14/11/2026)

- **ponytail** (plugin em `.claude/settings.json`): deixe ativo em todo pedido, no nível
  `full`. Não desligue com "stop ponytail" ou "normal mode", a menos que o autor peça.
- **design-taste-frontend** (taste-skill, em `.claude/skills/`): use só em pedidos que
  envolvam design ou frontend (visual, layout, CSS, componentes de tela, páginas). Não use em
  pedidos de conteúdo, dados, química, configuração ou publicação.
- Quando a taste-skill entrar em conflito com as regras deste arquivo (arquivos únicos com CSS
  e JS embutidos, 44 px de toque, 16 px nos campos, temas claro e escuro), valem as regras
  deste arquivo.
