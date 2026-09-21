# Colocar o Controle WebHub no ar

Há duas opções. O código é o mesmo — muda só o `mode` em `js/config.js`.

| | Opção A — GitHub Pages | Opção B — Hostinger |
|---|---|---|
| Custo | **Grátis** | Plano com PHP + MySQL |
| `js/config.js` | `mode: 'local'` | `mode: 'server'` |
| Dados | No navegador (cada aparelho tem os seus) | No banco (iguais em todo aparelho) |
| Login | Barreira simples | Login de verdade |

---

# Opção A — GitHub Pages (grátis)

## A1. Publicar (uma vez)

O repositório já existe: **github.com/ruanmarchiori/controle-webhub**. No plano gratuito do GitHub, o Pages só funciona em repositório **público**. O código não tem senha nenhuma (só o hash da senha inicial e o seu e-mail em `js/config.js`), então pode ser público.

1. No GitHub, abra o repositório → **Settings** (aba no topo).
2. Role até o fim → **Danger Zone → Change repository visibility → Make public** → confirme digitando o nome do repositório.
3. Ainda em Settings, menu lateral → **Pages**.
4. Em *Build and deployment → Source*: **Deploy from a branch**. *Branch*: `main`, pasta `/ (root)`. **Save**.
5. Espere 1–2 minutos e recarregue a página: aparece o endereço, que será

   **https://ruanmarchiori.github.io/controle-webhub/**

6. Abra o endereço, entre com o e-mail de `js/config.js` e a senha `trocar123`, e troque a senha em **Configurações**.

## A2. Atualizar o sistema

```
git add .
git commit -m "descrição da mudança"
git push
```

O GitHub Pages republica sozinho em cerca de 1 minuto. Os clientes cadastrados ficam no navegador e não são afetados.

## A3. Levar os dados de um aparelho para outro

No aparelho de origem: **Configurações → Baixar backup (.json)**. No de destino: **Configurações → Importar dados → Arquivo de backup**. Faça isso também de vez em quando por segurança: limpar o cache do navegador apaga os cadastros.

## A4. Migrar para a Opção B no futuro

Quando tiver hospedagem: baixe um backup, siga a Opção B abaixo com `mode: 'server'`, e importe o backup em **Configurações → Importar dados**.

---

# Opção B — Hostinger (modo server)

Guia passo a passo. A primeira vez leva uns 20–30 minutos; depois, atualizar o sistema é um `git push`.

**Como funciona:** o código (HTML/JS/PHP) fica nos arquivos do site; os clientes ficam no banco MySQL. Subir uma versão nova do código nunca apaga clientes.

**Antes de tudo:** em `js/config.js` troque `mode: 'local'` por `mode: 'server'`, faça commit e push.

## Parte 1 — Só na primeira vez (Hostinger)

### 1. GitHub

O repositório já existe (github.com/ruanmarchiori/controle-webhub) e o código já está lá. Se estiver público por causa do GitHub Pages, pode voltar a privado em Settings → Danger Zone, se preferir.

### 2. Hostinger — site, domínio e SSL

1. **hPanel → Sites → Adicionar site → Site vazio** (não escolha WordPress). Aponte para o domínio que veio com o plano.
2. **Domínios → Subdomínios → Criar**: `sistema` (vai virar `sistema.seudominio.com`). Anote a pasta que a Hostinger cria para ele (algo como `public_html/sistema` ou `domains/sistema.seudominio.com/public_html`).
3. **Segurança → SSL**: instale o certificado gratuito no subdomínio e ligue **Forçar HTTPS**. Obrigatório — sem HTTPS o cookie de login não funciona.
4. **Avançado → Configuração PHP**: escolha PHP **8.1** ou mais novo.

### 3. Hostinger — banco de dados

1. **Bancos de dados → Gerenciamento → Criar novo banco de dados MySQL.**
2. Preencha nome do banco, usuário e senha (invente uma senha forte e **guarde**).
3. Anote os três + o **host** que aparece na lista (normalmente `localhost`).

### 4. Hostinger — Git (deploy automático)

1. **Avançado → Git → Criar novo repositório.**
2. Repositório: a URL SSH do GitHub, ex: `git@github.com:SEU-USUARIO/controle-webhub.git`. Branch: `main`. Diretório: a pasta do subdomínio (passo 2.2).
3. A Hostinger mostra uma **chave SSH pública**. Copie.
4. No GitHub: **repositório → Settings → Deploy keys → Add deploy key**. Cole a chave, dê um nome ("Hostinger"), salve (não precisa marcar "write access").
5. De volta no hPanel, clique em **Deploy**. Os arquivos aparecem na pasta do subdomínio.
6. *(Opcional, recomendado)* Ainda em Git no hPanel, copie a **URL do webhook**. No GitHub: **Settings → Webhooks → Add webhook**, cole em "Payload URL", Content type `application/json`, salve. A partir daí todo `git push` já publica sozinho.

### 5. Criar o `config.php` no servidor

Esse é o único arquivo que vive só no servidor (tem a senha do banco; está no `.gitignore`, então nenhum deploy mexe nele).

1. **hPanel → Arquivos → Gerenciador de arquivos** → entre na pasta do subdomínio → pasta `api/`.
2. Clique com o botão direito em `config.example.php` → **Copiar** → nome `config.php`.
3. Abra `config.php` para editar e preencha:
   - `host`, `name`, `user`, `pass` com os dados do passo 3;
   - `admin_email` (seu e-mail de login) e `admin_initial_password` (senha inicial — você troca depois pelo painel);
   - `setup_token`: invente uma frase longa qualquer (ex: `banana-azul-2026-xyz`).
4. Salve.

### 6. Criar as tabelas

Abra no navegador:

```
https://sistema.seudominio.com/api/setup.php?token=A-FRASE-DO-SETUP_TOKEN
```

Deve aparecer "✅ Banco pronto" com a lista do que foi feito. Se aparecer erro, a mensagem diz o que corrigir (normalmente dados do banco no `config.php`).

### 7. Entrar e trazer os dados antigos

1. Abra `https://sistema.seudominio.com/login.html` e entre com o e-mail e a senha do `config.php`.
2. **Configurações → Trocar minha senha** — troque a senha inicial.
3. Se você já tinha clientes cadastrados na versão antiga (que ficava no navegador): **no mesmo navegador/computador onde eles estavam**, abra **Configurações → Importar dados**. A página detecta os cadastros e tem um botão "Enviar para o servidor". Pronto — eles passam a aparecer em qualquer aparelho.

> ⚠️ Não limpe o cache/dados do navegador antigo antes de importar, senão os cadastros somem.

---

## Parte 2 — Atualizar o sistema (sempre que mudar algo)

```
git add .
git commit -m "descrição da mudança"
git push
```

- Com o webhook configurado: o site atualiza sozinho em segundos.
- Sem webhook: **hPanel → Avançado → Git → Deploy**.

Os clientes cadastrados **não são afetados** — só os arquivos de código mudam.

### Se a atualização trouxer um arquivo novo em `sql/`

Abra de novo `https://sistema.seudominio.com/api/setup.php?token=...`. Ele aplica só o que ainda não foi aplicado e nunca apaga dados. (Você vai saber que precisa porque eu aviso quando entregar a alteração.)

---

## Backup

- **Automático:** o plano Premium faz backup semanal (hPanel → Arquivos → Backups). Inclui o banco.
- **Manual:** **Configurações → Baixar backup (.json)**. Guarde o arquivo. Para restaurar, use **Configurações → Importar dados → Arquivo de backup**.

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Tela do painel esmaecida com aviso "Não foi possível carregar os dados" | `config.php` faltando ou dados do banco errados | A mensagem do aviso diz qual. Confira o `config.php`. |
| Login diz "Não foi possível falar com o servidor" | PHP não está rodando / pasta errada / `api/` não subiu | Abra `https://sistema.seudominio.com/api/auth.php?action=me` — deve responder um JSON (mesmo que `loggedIn: false`). |
| Entra, mas ao navegar volta para o login | Site aberto por `http://` (sem s) | Ligue "Forçar HTTPS" no hPanel e abra com `https://`. |
| "Muitas tentativas erradas" | 10 senhas erradas seguidas | Espere 15 minutos. |
| Esqueci a senha | — | No phpMyAdmin, apague a linha da tabela `users`; rode o `setup.php` de novo — ele recria a conta com a senha do `config.php`. |
| Apaguei a pasta do site inteira | O `config.php` foi junto | Faça Deploy no Git de novo e refaça o passo 5. Os clientes continuam no banco. |
