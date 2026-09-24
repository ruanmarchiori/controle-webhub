/* Carimba uma versão nos arquivos js/css referenciados pelos HTML (cache-busting).
   O GitHub Pages manda o navegador guardar os arquivos por 10 min; sem isso, uma
   atualização pode demorar a aparecer. Uso: node versao.js [versao] */
const fs = require('fs');
const path = require('path');
const raiz = 'c:/Users/ruanc/OneDrive/Desktop/Agência/Sistema Pessoal/';

const agora = new Date();
const versao = process.argv[2] || [
  agora.getFullYear(),
  String(agora.getMonth() + 1).padStart(2, '0'),
  String(agora.getDate()).padStart(2, '0'),
  String(agora.getHours()).padStart(2, '0') + String(agora.getMinutes()).padStart(2, '0')
].join('');

const htmls = fs.readdirSync(raiz).filter(f => f.endsWith('.html'));
let total = 0;
htmls.forEach((arquivo) => {
  const p = path.join(raiz, arquivo);
  let s = fs.readFileSync(p, 'utf8');
  const antes = s;
  /* src="js/x.js" ou href="css/x.css", com ou sem ?v= anterior */
  s = s.replace(/(\b(?:src|href)=")((?:js|css)\/[\w./-]+\.(?:js|css))(?:\?v=[\w.-]+)?(")/g,
    (_, pre, file, pos) => `${pre}${file}?v=${versao}${pos}`);
  if (s !== antes) {
    fs.writeFileSync(p, s);
    total++;
  }
});
console.log(`versão ${versao} aplicada em ${total} arquivo(s)`);
