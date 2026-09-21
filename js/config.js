/* Modo de funcionamento do Controle WebHub — troque aqui e publique.

   'local'  → os dados ficam no navegador (localStorage). Não precisa de servidor: roda de
              graça no GitHub Pages. Limitação: cada navegador/aparelho tem os próprios
              dados (celular ≠ computador); use Configurações → Backup para transferir.

   'server' → os dados ficam num banco MySQL via a API em api/ (hospedagem com PHP, ex:
              Hostinger). Mesmos clientes em qualquer aparelho e login de verdade.
              Veja DEPLOY.md. */
window.APP_CONFIG = {
  mode: 'local',

  /* Conta do modo local. Só serve pra impedir uso casual por quem tem o link — como o
     site é estático, quem sabe mexer em código consegue contornar (não guarde nada
     sigiloso). Senha inicial: "trocar123" — troque pelo menu Configurações (a troca vale
     só no navegador em que foi feita). Pra mudar a senha aqui no código: abra login.html,
     aperte F12 e rode  await hashPassword("nova-senha")  — cole o resultado abaixo. */
  localAuth: {
    email: 'ruancardozo97@hotmail.com',
    passwordHash: 'b0857a7c7d3178e44ca0d8836786ae18ee806f7625e589b98c5bad307813eaf6'
  }
};
