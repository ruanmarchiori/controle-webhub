# Controle WebHub

Painel pessoal para controle dos clientes fechados pela agência: valores, tipo de projeto, origem do cliente, dev responsável, status, parcelas e a divisão financeira entre agência, você e o dev.

## Como funciona

- **Front-end estático** (HTML, CSS e JavaScript puro) + **API em PHP com banco MySQL** (pasta `api/`). Os dados ficam no servidor, então o painel mostra os mesmos clientes em qualquer aparelho — computador, celular, outro navegador.
- Hospedado na Hostinger (plano compartilhado com PHP + MySQL). Passo a passo de instalação e atualização em **[DEPLOY.md](DEPLOY.md)**.
- O que fica só no navegador (preferência do aparelho): tema claro/escuro e menu recolhido.
- **Layout responsivo:** o painel se adapta a celular e tablet (menu lateral vira uma coluna de ícones, cards e formulários empilham em uma coluna, tabelas ficam roláveis na horizontal).

### Estrutura

```
*.html            telas do painel
css/style.css     estilo
js/store.js       camada de dados — fala com a API e guarda tudo em memória durante a página
js/auth.js        login/logout/troca de senha (sessão no servidor)
js/*.js           lógica de cada tela
api/              back-end PHP (auth.php, clients.php, settings.php, setup.php)
api/config.php    dados do banco — existe SÓ no servidor (não vai pro Git)
sql/              estrutura do banco, aplicada pelo api/setup.php
importar.html     traz dados de um backup ou da versão antiga (localStorage)
```

- Cada cliente é guardado inteiro como JSON na tabela `clients` — adicionar um campo novo no cadastro não exige mexer no banco.
- `settings` guarda as listas personalizadas, a % do salário e as notificações já vistas.
- As telas usam `STORE.onReady(() => { ... })` (em vez de `DOMContentLoaded`) para esperar os dados chegarem do servidor.

## Páginas

- `login.html` — tela de entrada (veja "Login e acesso" abaixo).
- `index.html` — Dashboard: total de projetos fechados (clicável, abre a lista), gráfico de fechamentos por mês e status dos projetos (em desenvolvimento x concluído). Os números financeiros (recebido, repasses, lucro) ficam na aba Financeiro.
- `clientes.html` — lista de todos os clientes cadastrados, com busca.
- `cliente.html` — cadastro/edição de um cliente (a "aba" de cada cliente), incluindo origem do cliente, a divisão percentual (agência/eu/dev, editável por cliente, com o valor de cada parte já calculado na tela), a situação financeira real e as parcelas de pagamento.
- `financeiro.html` — visão financeira da empresa como um todo: valor total em caixa (recebido), repassado para devs, repassado para a agência e valor líquido — cada card clicável abre o detalhamento por cliente. Também tem a divisão do valor total (gráfico de rosca), o fechamento do mês (período escolhível) e a divisão "meu salário x caixa da empresa". Veja "Financeiro da empresa" abaixo.
- `relatorio.html` — escolha um mês e baixe um PDF com o resumo financeiro do período (vendido, repassado, saldo, clientes fechados) e a lista de clientes daquele mês.
- `configuracoes.html` — trocar sua senha, ativar o modo escuro, gerenciar as listas personalizadas e baixar/importar backup.
- `importar.html` — importa clientes de um arquivo de backup ou os que ficaram no navegador na versão antiga do painel.

## Login e acesso

- **Sistema fechado, uma conta só:** a conta é criada pelo `api/setup.php` a partir do `admin_email` / `admin_initial_password` do `api/config.php`. Não existe cadastro nem pedido de acesso.
- A senha fica no banco (hash bcrypt) e a sessão é um cookie HttpOnly ligado a um token no servidor. Sem sessão válida, a API não devolve nenhum dado — não dá pra contornar pelo F12.
- **Troque a senha inicial** pelo menu **Configurações** assim que entrar. Vale em todos os aparelhos e derruba as outras sessões abertas.
- A sessão dura até você clicar em "Sair" (ou 90 dias sem usar). 10 senhas erradas seguidas bloqueiam o IP por 15 minutos.
- Esqueceu a senha? Veja "Problemas comuns" em [DEPLOY.md](DEPLOY.md).

## Divisão do valor

Por padrão, cada cliente novo vem com **20% agência / 40% eu / 40% dev**, mas as três porcentagens são editáveis por cliente (só é preciso que a soma dê 100%). Essa divisão é só o **combinado** — quanto cada parte deveria receber se o valor todo fosse recebido e repassado. O gráfico de rosca "Divisão do valor total" no dashboard mostra esse combinado, não considera se alguém já pagou algo.

**Lista de devs:** o campo "Dev responsável" em `cliente.html` é uma lista (igual "Tipo de projeto"/"Origem do cliente"), gerenciada em **Configurações → Listas personalizadas**. Se o dev escolhido for **"Ruan"** (você mesmo), a divisão daquele projeto vira só **agência + você** — o campo/checkbox/card de dev some da tela e qualquer % que estivesse em "Dev" é somado em "Eu" automaticamente, já que não faz sentido repassar pra um dev separado quando você mesmo faz o projeto.

**Listas 100% editáveis:** em Configurações, toda opção de "Tipo de projeto", "Origem do cliente" e "Dev responsável" pode ser removida (inclusive as de fábrica) — a única exceção é **"Ruan"**, que fica sempre disponível na lista de devs por causa da regra acima. Se um cliente antigo referenciar uma opção que depois foi removida, ela continua aparecendo normalmente só na tela daquele cliente (nada se perde), mas não fica mais disponível pra escolher em clientes novos.

## Situação financeira real (dinheiro que já entrou/saiu de verdade)

Separado da divisão combinada, cada cliente tem 3 marcações de pagamento em `cliente.html`:
- **Cliente já pagou** (só aparece pra pagamento à vista — pra parcelado, o "recebido" é calculado automaticamente somando as parcelas marcadas como pagas).
- **Dev já foi pago**.
- **Agência já foi paga**.

Com base nessas marcações, cada cliente mostra um painel "Situação financeira real" (recebido do cliente, repassado ao dev, repassado à agência, saldo que sobra de fato). A aba **Financeiro** soma isso de todos os clientes — veja a seção abaixo. O relatório mensal (`relatorio.html`) usa os mesmos números reais, pra não contradizer o resto do sistema.

## Financeiro da empresa

A aba **Financeiro** (`financeiro.html`) junta os números financeiros de toda a empresa, separados do dashboard:

- **Visão geral**: valor total em caixa (recebido), repassado para devs, repassado para a agência e valor líquido — cada um clicável pra ver o detalhamento por cliente. Um alternador no topo escolhe entre **"Todos os meses"** (desde o início, padrão) e **"Mensal"** (escolhe um período e os 4 números passam a valer só daquele mês). O gráfico de rosca da divisão combinada, logo abaixo, sempre mostra o total desde o início, independente do alternador.
- **Fechamento do mês**: escolha um período (mês/ano) e veja o que foi fechado, recebido e repassado à agência *só naquele mês*, além do saldo líquido do mês.

**Projeto parcelado que cai em vários meses:** um projeto fechado em setembro com parcelas previstas pra outubro e novembro aparece em **cada um desses meses** (não só em setembro) — cada parcela conta no mês do próprio vencimento, com a % de cada um (agência/eu/dev) aplicada em cima do valor daquela parcela específica. Cliente à vista continua contando no mês em que foi fechado, já que não tem parcela com data própria. Isso vale tanto na aba Financeiro (visão geral no modo "Mensal" e "Fechamento do mês") quanto no relatório em PDF — os três batem entre si.
- **Meu salário x caixa da empresa**: do saldo líquido do mês, um percentual (editável, guardado pra próxima vez) vira seu salário e o resto fica no caixa da empresa como reserva/reinvestimento. O padrão é **60% salário / 40% caixa** — uma recomendação geral pra uma empresa pequena de serviço que quer crescer com segurança (manter uma reserva de 30–40% em vez de retirar tudo), mas é só um ponto de partida: ajuste pro que fizer sentido pra sua realidade.

## Publicar e atualizar

Veja **[DEPLOY.md](DEPLOY.md)** — instalação na Hostinger (domínio, SSL, banco, Git) e o fluxo de atualização (`git push`). Resumo: código nos arquivos, clientes no banco; subir código novo nunca apaga clientes.

## Backup

**Configurações → Baixar backup (.json)** salva clientes + configurações. Para restaurar, **Configurações → Importar dados**. A Hostinger também faz backup automático do banco.
