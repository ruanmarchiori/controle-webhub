<?php
/* Login / logout / sessão atual / troca de senha.
   POST auth.php?action=login            {email, password}
   POST auth.php?action=logout
   GET  auth.php?action=me
   POST auth.php?action=change-password  {currentPassword, newPassword} */
require __DIR__ . '/bootstrap.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'me' && $method === 'GET') {
  $session = currentSession();
  if (!$session) respond(['ok' => false, 'loggedIn' => false], 401);
  respond(['ok' => true, 'loggedIn' => true, 'user' => ['email' => $session['email']]]);
}

if ($action === 'login' && $method === 'POST') {
  requireSameOrigin();
  $body = jsonBody();
  $email = strtolower(trim((string)($body['email'] ?? '')));
  $password = (string)($body['password'] ?? '');
  if ($email === '' || $password === '') fail('Informe e-mail e senha.');

  /* Bloqueio por tentativas erradas (por IP), pra dificultar chute de senha. */
  /* A comparação de tempo é feita no próprio MySQL pra não depender de o fuso horário do PHP
     ser o mesmo do banco (na hospedagem compartilhada costuma não ser). */
  $ip = clientIp();
  $lockMinutes = LOGIN_LOCK_MINUTES;
  $stmt = db()->prepare("SELECT fails, (last_fail_at > NOW() - INTERVAL {$lockMinutes} MINUTE) AS recent FROM login_attempts WHERE ip = ?");
  $stmt->execute([$ip]);
  $attempt = $stmt->fetch();
  if ($attempt && (int)$attempt['fails'] >= LOGIN_MAX_FAILS && (int)$attempt['recent'] === 1) {
    fail('Muitas tentativas erradas. Aguarde ' . LOGIN_LOCK_MINUTES . ' minutos e tente de novo.', 429);
  }

  $stmt = db()->prepare('SELECT id, email, password_hash FROM users WHERE email = ?');
  $stmt->execute([$email]);
  $user = $stmt->fetch();

  if (!$user || !password_verify($password, $user['password_hash'])) {
    $lockMinutes = LOGIN_LOCK_MINUTES;
    db()->prepare("INSERT INTO login_attempts (ip, fails, last_fail_at) VALUES (?, 1, NOW())
                   ON DUPLICATE KEY UPDATE fails = IF(last_fail_at < NOW() - INTERVAL {$lockMinutes} MINUTE, 1, fails + 1), last_fail_at = NOW()")
        ->execute([$ip]);
    usleep(400000); // 0,4s: deixa ataques de força bruta lentos sem incomodar quem só errou a senha
    fail('E-mail ou senha incorretos.', 401);
  }

  db()->prepare('DELETE FROM login_attempts WHERE ip = ?')->execute([$ip]);
  if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
  }
  createSession((int)$user['id']);
  respond(['ok' => true, 'user' => ['email' => $user['email']]]);
}

if ($action === 'logout' && $method === 'POST') {
  requireSameOrigin();
  destroyCurrentSession();
  respond(['ok' => true]);
}

if ($action === 'change-password' && $method === 'POST') {
  requireSameOrigin();
  $session = requireAuth();
  $body = jsonBody();
  $current = (string)($body['currentPassword'] ?? '');
  $new = (string)($body['newPassword'] ?? '');
  if (strlen($new) < 6) fail('A nova senha precisa ter pelo menos 6 caracteres.');

  $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
  $stmt->execute([$session['user_id']]);
  $row = $stmt->fetch();
  if (!$row || !password_verify($current, $row['password_hash'])) fail('Senha atual incorreta.', 403);

  db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $session['user_id']]);
  /* Derruba as sessões de outros aparelhos — se a senha foi trocada, é pra valer em todo lugar. */
  db()->prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')->execute([$session['user_id'], $session['token_hash']]);
  respond(['ok' => true]);
}

fail('Ação desconhecida.', 404);
