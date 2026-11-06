# SIMULA FÁCIL IA – como publicar no GitHub Pages (≈ 10 minutos)

Autor: Prof. Juan Canellas Bosch Neto – Curso de Engenharia Química – UFSJ · PPGEQ-DEQUI-CAP-UFSJ & CLAUDE

O resultado é um endereço fixo, gratuito e encontrável no Google, por exemplo:
**https://jboschbr.github.io/simulafacil/**

- `index.html` – página de apresentação (seu nome, UFSJ, livro, recursos, QR code para a turma, como citar).
- `simulador.html` – o simulador completo. Funciona sem login; o agente de IA abre na versão do Claude pelo botão “Agente IA no Claude”.

---

## 1. Crie a conta e o repositório

1. Entre em https://github.com/signup e crie uma conta. O nome de usuário aparece no endereço: com `jboschbr`, o site fica `jboschbr.github.io/simulafacil`.
2. Clique em **New repository** (botão verde **New**).
3. Em *Repository name* escreva `simulafacil`, marque **Public** e clique em **Create repository**.

## 2. Envie os arquivos

1. Na página do repositório, clique em **uploading an existing file** (ou *Add file → Upload files*).
2. Abra a pasta extraída deste .zip, selecione **todo o conteúdo** (index.html, simulador.html e as pastas css, js e img) e arraste para a página.
3. Clique em **Commit changes**.

> O arquivo oculto `.nojekyll` é opcional; se não for enviado, o site funciona igual.

## 3. Ligue o GitHub Pages

1. No repositório: **Settings → Pages**.
2. Em *Build and deployment*, *Source*: **Deploy from a branch**; *Branch*: **main** e **/(root)** → **Save**.
3. Aguarde 1 a 2 minutos e recarregue: aparece “Your site is live at https://SEU-USUARIO.github.io/simulafacil/”.

## 4. Ajuste três arquivos (no próprio GitHub, ícone de lápis ✏️)

Troque `SEU-USUARIO` pelo seu usuário do GitHub em:

- `js/site-config.js` → `siteUrl`
- `robots.txt`
- `sitemap.xml`

Em `js/site-config.js`, ajuste também `claudeUrl` com o **link público** da versão com agente:
abra o simulador no Claude, clique em **Compartilhar** (ou **Publicar**), torne público e cole aqui o link.

## 5. Faça o Google encontrar o site e associá-lo ao seu nome

1. Entre em https://search.google.com/search-console e clique em **Adicionar propriedade → Prefixo do URL**; cole o endereço do site.
2. Escolha a verificação por **Tag HTML**, copie a linha `<meta name="google-site-verification" ...>` e cole no `index.html` logo abaixo de `<meta charset="utf-8">` (edite pelo lápis no GitHub). Volte e clique em **Verificar**.
3. No menu **Sitemaps**, envie `sitemap.xml`.
4. Em **Inspeção de URL**, cole o endereço da página inicial e clique em **Solicitar indexação**; repita para `simulador.html`.

O Google costuma mostrar o site em alguns dias. Para que buscas pelo seu nome tragam o simulador, ponha o link em páginas que já aparecem quando alguém procura por você:

- **Currículo Lattes**: *Produção técnica → Programas de computador sem registro* → “SIMULA FÁCIL IA – Simulador de processos químicos”, com o endereço do site. É a associação mais forte entre o seu nome e o programa nas buscas acadêmicas.
- Página do **PPGEQ** e do **DEQUI** na UFSJ (peça à coordenação um link em “Software” ou “Recursos didáticos”).
- Seu site (jboschbr.wix.com/juan), **ResearchGate**, **LinkedIn**, Google Acadêmico (no perfil, em “Página inicial”).
- Descrição dos seus **vídeos no YouTube** e da página do livro na **Appris**.
- Um artigo curto apresentando a ferramenta (COBEQ, revistas de ensino de engenharia) gera citações e muitos acessos.

## 6. Para os alunos

- Passe o endereço do site ou projete o **QR code** da seção “Para a turma” (botão **Baixar QR code**).
- O simulador funciona no celular, tablet e computador, sem instalação.
- Para conversar com o agente de IA, o aluno usa o botão **Agente IA no Claude** e entra com a própria conta do Claude (há plano gratuito).

## 7. Atualizações

Quando houver uma versão nova, envie de novo os arquivos alterados (*Add file → Upload files*) e confirme com **Commit changes**. O endereço continua o mesmo.

---

Referência: BOSCH NETO, J. C. *et al.* Modelagem e simulação de processos dinâmicos aplicada às engenharias química, de bioprocessos, elétrica, mecânica, de controle, aeroespacial e fluidodinâmica computacional. Curitiba: Appris, 2019.
