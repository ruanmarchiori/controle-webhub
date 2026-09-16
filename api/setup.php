<?php
/* Instalador / atualizador do banco. Abra no navegador:
     https://SEU-SITE/api/setup.php?token=FRASE_DO_CONFIG
   O que ele faz (pode rodar quantas vezes quiser, nunca apaga nada):
   1. Aplica os arquivos de sql/ que ainda não foram aplicados (controlado pela tabela `migrations`).
   2. Cria a conta de acesso (admin_email / admin_initial_password do config.php) se ainda não existir nenhuma.
   Rode de novo depois de cada atualização do sistema que trouxer um sql/ novo. */
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');

$configFile = __DIR__ . '/config.php';
$out = [];
$ok = true;

function line(string $msg, bool $good = true): void {
  global $out, $ok;
  if (!$good) $ok = false;
  $out[] = ['msg' => $msg, 'good' => $good];
}

if (!is_file($configFile)) {
  line('api/config.php não encontrado. Copie api/config.example.php para api/config.php e preencha.', false);
} else {
  $CONFIG = require $configFile;
  $token = (string)($_GET['token'] ?? '');
  $expected = (string)($CONFIG['setup_token'] ?? '');
  if ($expected === '' || $expected === 'troque-por-uma-frase-longa-e-aleatoria') {
    line('Defina uma frase própria em setup_token no api/config.php antes de rodar o setup.', false);
  } elseif (!hash_equals($expected, $token)) {
    http_response_code(403);
    line('Token incorreto. Use ?token=  com a frase definida em setup_token no api/config.php.', false);
  } else {
    try {
      $c = $CONFIG['db'];
      $pdo = new PDO("mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4", $c['user'], $c['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      ]);
      line('Conectado no banco "' . htmlspecialchars($c['name']) . '".');

      $pdo->exec('CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(120) NOT NULL, applied_at DATETIME NOT NULL, PRIMARY KEY (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

      $applied = $pdo->query('SELECT name FROM migrations')->fetchAll(PDO::FETCH_COLUMN);
      $files = glob(dirname(__DIR__) . '/sql/*.sql') ?: [];
      sort($files);
      $ran = 0;
      foreach ($files as $file) {
        $name = basename($file);
        if (in_array($name, $applied, true)) continue;
        $sql = file_get_contents($file);
        /* Remove comentários de linha e executa cada comando (separados por ;) */
        $sql = preg_replace('/^\s*--.*$/m', '', $sql);
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
          $pdo->exec($statement);
        }
        $pdo->prepare('INSERT INTO migrations (name, applied_at) VALUES (?, NOW())')->execute([$name]);
        line("Aplicado: {$name}");
        $ran++;
      }
      if ($ran === 0) line('Banco já estava atualizado (nenhum sql/ novo para aplicar).');

      $users = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
      if ($users === 0) {
        $email = strtolower(trim((string)($CONFIG['admin_email'] ?? '')));
        $password = (string)($CONFIG['admin_initial_password'] ?? '');
        if ($email === '' || strlen($password) < 6) {
          line('admin_email / admin_initial_password inválidos no config.php (senha com pelo menos 6 caracteres).', false);
        } else {
          $pdo->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
              ->execute([$email, password_hash($password, PASSWORD_DEFAULT)]);
          line('Conta criada: ' . htmlspecialchars($email) . ' — troque a senha no menu Configurações do painel.');
        }
      } else {
        line('Conta de acesso já existe (nada a fazer).');
      }

      /* Limpeza de sessões expiradas — aproveita a visita. */
      $pdo->exec('DELETE FROM sessions WHERE expires_at < NOW()');
    } catch (PDOException $e) {
      line('Erro no banco: ' . htmlspecialchars($e->getMessage()), false);
    }
  }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Setup | Controle WebHub</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f2;color:#1b1b1b;margin:0;padding:32px 16px;}
  .card{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.06);}
  h1{font-size:1.2rem;margin:0 0 18px;}
  ul{list-style:none;padding:0;margin:0 0 20px;}
  li{padding:10px 12px;border-radius:10px;margin-bottom:8px;font-size:.9rem;background:#eef8f0;color:#1e6b3a;}
  li.bad{background:#fdecec;color:#b3261e;}
  a{display:inline-block;background:#1b1b1b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:.9rem;}
  p{font-size:.82rem;color:#666;}
</style>
</head>
<body>
<div class="card">
  <h1><?= $ok ? '✅ Banco pronto' : '⚠️ Algo precisa de atenção' ?></h1>
  <ul>
    <?php foreach ($out as $item): ?>
      <li class="<?= $item['good'] ? '' : 'bad' ?>"><?= $item['msg'] ?></li>
    <?php endforeach; ?>
  </ul>
  <?php if ($ok): ?><a href="../login.html">Ir para o login →</a><?php endif; ?>
  <p>Você pode rodar esta página de novo a qualquer momento (por exemplo, depois de uma atualização do sistema). Ela nunca apaga dados.</p>
</div>
</body>
</html>
