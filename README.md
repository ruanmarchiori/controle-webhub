# Controle WebHub

Painel pessoal para controle dos clientes fechados pela agência: valores, tipo de projeto, origem do cliente, dev responsável, status, parcelas e a divisão financeira entre agência, você e o dev.

## Como funciona

O painel é **HTML, CSS e JavaScript puro** e tem dois modos, escolhidos em `js/config.js`:

| Modo | Onde ficam os dados | Hospedagem | Quando usar |
|---|---|---|---|
| `local` (atual) | No navegador (localStorage) | **GitHub Pages, grátis** | Sem custo. Cada navegador/aparelho tem os próprios dados — celular e computador **não** compartilham. Use Configurações → Backup para transferir. |
| `server` | Banco MySQL via API PHP (`api/`) | Hospedagem com PHP (ex: Hostinger) | Mesmos clientes em qualquer aparelho, login de verdade. Veja [DEPLOY.md](DEPLOY.md). |

Para trocar de modo: edite `mode` em `js/config.js`, faça commit e publique. As telas são as mesmas; só a camada de dados (`js/store.js`) e o login (`js/auth.js`) mudam de comportamento.

- O que fica sempre no navegador (preferência do aparelho): tema claro/escuro e menu recolhido.
- **Layout responsivo:** o painel se adapta a celular e tablet (menu vira gaveta, cards e formulários empilham, tabelas ficam roláveis).

### Estrutura

```
*.html            telas do painel
css/style.css     estilo
js/config.js      modo (local/server) e conta do modo local
js/store.js       camada de dados — localStorage (local) ou API (server); tudo em memória durante a página
js/auth.js        login/logout/troca de senha (nos dois modos)
js/*.js           lógica de cada tela
api/              back-end PHP — usado só no modo server
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
- `cliente.html` — cadastro/edição de um cliente (inclui telefone/WhatsApp, que aparece clicável no card da lista) (a "aba" de cada cliente), incluindo origem do cliente, a divisão percentual (agência/eu/dev, editável por cliente, com o valor de cada parte já calculado na tela), a situação financeira real e as parcelas de pagamento.
- `financeiro.html` — visão financeira da empresa como um todo: valor total em caixa (recebido), repassado para devs, repassado para a agência e valor líquido — cada card clicável abre o detalhamento por cliente. Também tem a divisão do valor total (gráfico de rosca), o fechamento do mês (período escolhível) e a divisão "meu salário x caixa da empresa". Veja "Financeiro da empresa" abaixo.
- `relatorio.html` — escolha um mês e baixe um PDF com o resumo financeiro do período (vendido, repassado, saldo, clientes fechados) e a lista de clientes daquele mês.
- `configuracoes.html` — trocar sua senha, ativar o modo escuro, gerenciar as listas personalizadas e baixar/importar backup.
- `importar.html` — importa clientes de um arquivo de backup ou os que ficaram no navegador na versão antiga do painel.

## Login e acesso

**Sistema fechado, uma conta só.** Não existe cadastro nem pedido de acesso.

- **Modo local:** a conta está em `js/config.js` (`localAuth`), senha inicial `trocar123`. Como não há servidor, isso **não é proteção criptográfica** — quem sabe mexer em código (F12) consegue contornar. Serve só pra impedir uso casual por quem tem o link. Troque a senha pelo menu Configurações (vale só no navegador em que foi trocada) ou gere um hash novo com `await hashPassword("senha")` no console de `login.html` e cole no `config.js`.
- **Modo server:** a conta é criada pelo `api/setup.php`; senha com bcrypt no banco, sessão em cookie HttpOnly, bloqueio após 10 tentativas erradas. Trocar a senha vale em todos os aparelhos.

## Divisão do valor

**Dois modos, escolhidos no cadastro ("Dividir por"):** por **porcentagem** (padrão, precisa somar 100%) ou por **valor em R$** — para quando o dev passa o preço dele e você soma a sua margem em cima, sem virar uma % redonda. No modo valor a soma precisa bater com o valor do projeto, e há um atalho para usar a soma digitada como valor do projeto. As porcentagens equivalentes continuam sendo calculadas, porque é assim que cada parcela é repartida mês a mês.

Por padrão, cada cliente novo vem com **20% agência / 40% eu / 40% dev**, mas as três porcentagens são editáveis por cliente (só é preciso que a soma dê 100%). Essa divisão é só o **combinado** — quanto cada parte deveria receber se o valor todo fosse recebido e repassado. O gráfico de rosca "Divisão do valor total" no dashboard mostra esse combinado, não considera se alguém já pagou algo.

**Lista de devs:** o campo "Dev responsável" em `cliente.html` é uma lista (igual "Tipo de projeto"/"Origem do cliente"), gerenciada em **Configurações → Listas personalizadas**. Se o dev escolhido for **"Ruan"** (você mesmo), a divisão daquele projeto vira só **agência + você** — o campo/checkbox/card de dev some da tela e qualquer % que estivesse em "Dev" é somado em "Eu" automaticamente, já que não faz sentido repassar pra um dev separado quando você mesmo faz o projeto.

**Listas 100% editáveis:** em Configurações, toda opção de "Tipo de projeto", "Origem do cliente" e "Dev responsável" pode ser removida (inclusive as de fábrica) — a única exceção é **"Ruan"**, que fica sempre disponível na lista de devs por causa da regra acima. Se um cliente antigo referenciar uma opção que depois foi removida, ela continua aparecendo normalmente só na tela daquele cliente (nada se perde), mas não fica mais disponível pra escolher em clientes novos.

## Situação financeira real (dinheiro que já entrou/saiu de verdade)

Separado da divisão combinada, cada cliente registra o dinheiro que realmente entrou e saiu, em duas partes:

**1. Pagamento do cliente** — marcação com a data em que o cliente pagou (ao marcar, a data de hoje entra sozinha e pode ser trocada). No projeto **parcelado** fica em cada parcela; no **à vista**, uma marcação única do projeto.

**2. Repasses ao dev e à agência** — uma seção própria onde você lança **cada pagamento com valor e data**, em vez de um "pago sim/não". É assim porque o repasse não acompanha as parcelas do cliente: o dev costuma ser pago adiantado (no começo do projeto) ou depois do fim, e a agência no fechamento do mês — e os dois podem ser parciais.

Cada destinatário tem um bloco mostrando **quanto já recebeu do total que tem a receber**, com barra de progresso e o quanto **ainda falta pagar**. O botão "Registrar pagamento" já vem preenchido com a data de hoje e o valor que falta — na maioria das vezes é só salvar.

- O total a receber sai da divisão do projeto (a % ou o valor em R$ definido no cadastro).
- No **Financeiro**, o repasse conta no mês em que o pagamento foi feito — é quando o dinheiro saiu do caixa.
- **Você só deve ao dev/agência a parte do que o cliente já pagou.** Por isso, no card do Financeiro o número de cima é o que saiu do caixa no período e o de baixo ("a repassar") é a cota deles sobre o **recebido**, menos o que já foi repassado — a cota do que o cliente ainda não pagou só vira dívida quando ele pagar. No cadastro, a barra mostra o total do projeto e a linha abaixo dela diz quanto já venceu.
**Comprovante:** cada pagamento (do cliente, ao dev e à agência) tem um campo para o **link do comprovante** — você guarda a foto/PDF no Google Drive, OneDrive ou Dropbox e cola o link aqui; quando o link é válido aparece um botão "Abrir" do lado. É link em vez de anexo porque o painel é estático (sem servidor para receber upload) e o localStorage tem 5–10 MB no total — dois ou três comprovantes já o estourariam. No modo server dá para trocar por upload de verdade.

- Clientes cadastrados nas versões anteriores continuam valendo: as marcações antigas de "pago" viram lançamentos com a cota proporcional e a data que estava salva, sem perder nada.

## Financeiro da empresa

A aba **Financeiro** (`financeiro.html`) junta os números financeiros de toda a empresa, separados do dashboard:

- **Visão geral**: valor total em caixa (recebido), repassado para devs, repassado para a agência e valor líquido — cada um clicável pra ver o detalhamento por cliente. Um alternador no topo escolhe entre **"Todos os meses"** (desde o início, padrão) e **"Mensal"** (escolhe um período e os 4 números passam a valer só daquele mês). O gráfico de rosca da divisão combinada, logo abaixo, sempre mostra o total desde o início, independente do alternador.
- **Fechamento do mês**: escolha um período (mês/ano) e veja o que foi fechado, recebido e repassado à agência *só naquele mês*, além do saldo líquido do mês.

**Projeto parcelado que cai em vários meses:** um projeto fechado em setembro com parcelas previstas pra outubro e novembro aparece em **cada um desses meses** (não só em setembro) — cada parcela conta no mês do próprio vencimento, com a % de cada um (agência/eu/dev) aplicada em cima do valor daquela parcela específica. Cliente à vista continua contando no mês em que foi fechado, já que não tem parcela com data própria. Isso vale tanto na aba Financeiro (visão geral no modo "Mensal" e "Fechamento do mês") quanto no relatório em PDF — os três batem entre si.
- **Meu salário x caixa da empresa**: do saldo líquido do mês, um percentual (editável, guardado pra próxima vez) vira seu salário e o resto fica no caixa da empresa como reserva/reinvestimento. O padrão é **60% salário / 40% caixa** — uma recomendação geral pra uma empresa pequena de serviço que quer crescer com segurança (manter uma reserva de 30–40% em vez de retirar tudo), mas é só um ponto de partida: ajuste pro que fizer sentido pra sua realidade.

## Publicar e atualizar

Veja **[DEPLOY.md](DEPLOY.md)**: GitHub Pages (modo local, grátis) ou Hostinger (modo server). Nos dois casos, atualizar é `git push`.

## Backup

**Configurações → Baixar backup (.json)** salva clientes + configurações. Para restaurar, **Configurações → Importar dados**. A Hostinger também faz backup automático do banco.
