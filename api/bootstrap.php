<?php
/* Base comum de toda a API: carrega o config, conecta no MySQL, cuida da sessão (cookie +
   tabela `sessions`) e expõe helpers de resposta JSON. Cada endpoint (auth.php, clients.php,
   settings.php) faz `require __DIR__ . '/bootstrap.php';` no topo. */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const SESSION_COOKIE = 'sp_token';
const SESSION_DAYS = 90;           // sessão dura 90 dias sem uso, ou até clicar em "Sair"
const LOGIN_MAX_FAILS = 10;        // tentativas erradas por IP antes de bloquear...
const LOGIN_LOCK_MINUTES = 15;     // ...por esse tempo

function respond(array $data, int $status = 200): void {
  http_response_code($status);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function fail(string $message, int $status = 400): void {
  respond(['ok' => false, 'error' => $message], $status);
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
  fail('Arquivo api/config.php não encontrado no servidor. Copie api/config.example.php para api/config.php e preencha os dados do banco (veja DEPLOY.md).', 500);
}
$CONFIG = require $configFile;

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  global $CONFIG;
  $c = $CONFIG['db'];
  $dsn = "mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4";
  try {
    $pdo = new PDO($dsn, $c['user'], $c['pass'], [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]);
  } catch (PDOException $e) {
    fail('Não foi possível conectar no banco de dados. Confira host/nome/usuário/senha em api/config.php.', 500);
  }
  return $pdo;
}

function isHttps(): bool {
  return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ($_SERVER['SERVER_PORT'] ?? '') === '443'
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function jsonBody(): array {
  $raw = file_get_contents('php://input');
  if ($raw === '' || $raw === false) return [];
  $data = json_decode($raw, true);
  if (!is_array($data)) fail('Corpo da requisição não é um JSON válido.');
  return $data;
}

/* Proteção contra requisições vindas de outros sites (CSRF): além do cookie SameSite=Lax,
   toda chamada que altera dados precisa vir do fetch() do próprio painel, que manda esse
   header. Um formulário/site externo não consegue mandá-lo sem passar pelo CORS. */
function requireSameOrigin(): void {
  if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') {
    fail('Requisição inválida.', 403);
  }
}

function clientIp(): string {
  return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

/* ===== Sessão: token aleatório no cookie, só o hash fica no banco ===== */

function setSessionCookie(string $token, int $expiresAt): void {
  setcookie(SESSION_COOKIE, $token, [
    'expires' => $expiresAt,
    'path' => '/',
    'secure' => isHttps(),
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
}

function createSession(int $userId): void {
  $token = bin2hex(random_bytes(32));
  $expiresAt = time() + SESSION_DAYS * 86400;
  db()->prepare('INSERT INTO sessions (token_hash, user_id, user_agent, created_at, expires_at) VALUES (?, ?, ?, NOW(), FROM_UNIXTIME(?))')
      ->execute([hash('sha256', $token), $userId, substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255), $expiresAt]);
  setSessionCookie($token, $expiresAt);
}

function currentSession(): ?array {
  $token = $_COOKIE[SESSION_COOKIE] ?? '';
  if (!is_string($token) || strlen($token) !== 64) return null;
  $stmt = db()->prepare('SELECT s.token_hash, s.user_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > NOW()');
  $stmt->execute([hash('sha256', $token)]);
  $row = $stmt->fetch();
  if (!$row) return null;
  /* Renova a validade a cada uso, pra sessão só cair mesmo por inatividade longa ou "Sair". */
  $expiresAt = time() + SESSION_DAYS * 86400;
  db()->prepare('UPDATE sessions SET expires_at = FROM_UNIXTIME(?) WHERE token_hash = ?')->execute([$expiresAt, $row['token_hash']]);
  setSessionCookie($token, $expiresAt);
  return $row;
}

function destroyCurrentSession(): void {
  $token = $_COOKIE[SESSION_COOKIE] ?? '';
  if (is_string($token) && strlen($token) === 64) {
    db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
  }
  setcookie(SESSION_COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'secure' => isHttps(), 'httponly' => true, 'samesite' => 'Lax']);
}

/* Todo endpoint de dados chama isso: sem sessão válida, responde 401 e o front manda pro login. */
function requireAuth(): array {
  $session = currentSession();
  if (!$session) fail('Sessão expirada ou inválida. Faça login novamente.', 401);
  return $session;
}
