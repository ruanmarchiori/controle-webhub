<?php
/* Configurações do painel que precisam valer em qualquer aparelho: listas personalizadas
   (options), % do salário (salaryPct) e cobranças já vistas no sino (seenCharges).
   Tema e menu recolhido continuam no navegador, porque são preferência do aparelho.
   GET settings.php          → { settings: { chave: valor, ... } }
   PUT settings.php          → body {key, value} — grava uma chave */
require __DIR__ . '/bootstrap.php';

requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $rows = db()->query('SELECT `key`, `value` FROM settings')->fetchAll();
  $settings = [];
  foreach ($rows as $row) $settings[$row['key']] = json_decode($row['value'], true);
  respond(['ok' => true, 'settings' => $settings]);
}

if ($method === 'PUT') {
  requireSameOrigin();
  $body = jsonBody();
  $key = $body['key'] ?? '';
  if (!is_string($key) || preg_match('/^[A-Za-z0-9_]{1,64}$/', $key) !== 1) fail('Chave inválida.');
  if (!array_key_exists('value', $body)) fail('Valor ausente.');
  $json = json_encode($body['value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($json === false || strlen($json) > 500000) fail('Valor inválido ou grande demais.');
  db()->prepare('INSERT INTO settings (`key`, `value`, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()')
      ->execute([$key, $json]);
  respond(['ok' => true]);
}

fail('Método não suportado.', 405);
