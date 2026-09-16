<?php
/* Configuração do servidor — COPIE este arquivo para api/config.php e preencha.
   O config.php fica só no servidor (está no .gitignore) e nunca é sobrescrito por um deploy.

   Onde pegar os dados do banco na Hostinger: hPanel → Bancos de dados → Gerenciamento.
   O host costuma ser "localhost"; se não funcionar, use o que aparece lá (ex: sqlXXX.hostinger.com). */
return [
  'db' => [
    'host' => 'localhost',
    'name' => 'u000000000_sistema',   // nome do banco
    'user' => 'u000000000_ruan',      // usuário do banco
    'pass' => 'SENHA_DO_BANCO',
  ],

  /* Conta que acessa o painel. O e-mail e a senha abaixo são usados SÓ na primeira vez
     (quando o setup.php cria a tabela de usuários). Depois, troque a senha pelo menu
     Configurações dentro do painel — o valor daqui deixa de valer. */
  'admin_email' => 'ruancardozo97@hotmail.com',
  'admin_initial_password' => 'trocar123',

  /* Frase secreta exigida para rodar o api/setup.php (cria as tabelas / aplica atualizações
     do banco). Invente qualquer frase longa. Uso: https://seusite.com/api/setup.php?token=FRASE */
  'setup_token' => 'troque-por-uma-frase-longa-e-aleatoria',
];
