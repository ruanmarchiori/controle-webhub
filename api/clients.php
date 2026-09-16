<?php
/* Clientes. O cliente inteiro (com parcelas, divisão etc.) é guardado como JSON na coluna
   `data` — o front continua trabalhando com o mesmo objeto de sempre, e adicionar um campo
   novo no cadastro não exige mexer no banco. Algumas colunas são copiadas pra facilitar
   consultas/ordenação (empresa, created_at).
   GET    clients.php              → lista completa
   POST   clients.php              → cria/atualiza um cliente (body = objeto do cliente)
   POST   clients.php?bulk=1       → cria/atualiza vários (body = array de clientes) — usado pela importação
   DELETE clients.php?id=...       → remove */
require __DIR__ . '/bootstrap.php';

$session = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];
const MAX_CLIENT_JSON = 300000; // 300 KB por cliente — muito acima de qualquer cadastro real

function validClientId($id): bool {
  return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,40}$/', $id) === 1;
}

function saveClient(array $client): void {
  if (!validClientId($client['id'] ?? null)) throw new InvalidArgumentException('Cliente sem id válido.');
  $json = json_encode($client, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($json === false || strlen($json) > MAX_CLIENT_JSON) throw new InvalidArgumentException('Dados do cliente inválidos ou grandes demais.');
  $createdAt = $client['createdAt'] ?? null;
  $ts = is_string($createdAt) ? strtotime($createdAt) : false;
  $createdAt = $ts !== false ? date('Y-m-d H:i:s', $ts) : date('Y-m-d H:i:s');
  db()->prepare('INSERT INTO clients (id, empresa, data, created_at, updated_at) VALUES (?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE empresa = VALUES(empresa), data = VALUES(data), updated_at = NOW()')
      ->execute([$client['id'], mb_substr((string)($client['empresa'] ?? ''), 0, 190), $json, $createdAt]);
}

if ($method === 'GET') {
  $rows = db()->query('SELECT data FROM clients ORDER BY created_at DESC, id ASC')->fetchAll();
  $clients = [];
  foreach ($rows as $row) {
    $decoded = json_decode($row['data'], true);
    if (is_array($decoded)) $clients[] = $decoded;
  }
  respond(['ok' => true, 'clients' => $clients]);
}

if ($method === 'POST') {
  requireSameOrigin();
  $body = jsonBody();
  $bulk = ($_GET['bulk'] ?? '') === '1';
  $list = $bulk ? $body : [$body];
  if ($bulk && array_values($list) !== $list) fail('A importação em lote espera uma lista de clientes.');

  $pdo = db();
  try {
    $pdo->beginTransaction();
    foreach ($list as $client) {
      if (!is_array($client)) throw new InvalidArgumentException('Item inválido na lista.');
      saveClient($client);
    }
    $pdo->commit();
  } catch (InvalidArgumentException $e) {
    $pdo->rollBack();
    fail($e->getMessage());
  } catch (Throwable $e) {
    $pdo->rollBack();
    fail('Erro ao salvar no banco de dados.', 500);
  }
  respond(['ok' => true, 'saved' => count($list)]);
}

if ($method === 'DELETE') {
  requireSameOrigin();
  $id = $_GET['id'] ?? '';
  if (!validClientId($id)) fail('Id inválido.');
  db()->prepare('DELETE FROM clients WHERE id = ?')->execute([$id]);
  respond(['ok' => true]);
}

fail('Método não suportado.', 405);
