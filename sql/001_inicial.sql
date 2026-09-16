-- Estrutura inicial do banco do Controle WebHub.
-- Aplicado automaticamente pelo api/setup.php (recomendado) ou manualmente no phpMyAdmin.
-- Cada alteração futura no banco vira um novo arquivo numerado nesta pasta (002_..., 003_...);
-- o setup.php aplica só os que ainda não rodaram e nunca apaga dados.

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (token_hash),
  KEY ix_sessions_user (user_id),
  KEY ix_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  ip VARCHAR(45) NOT NULL,
  fails INT UNSIGNED NOT NULL DEFAULT 0,
  last_fail_at DATETIME NOT NULL,
  PRIMARY KEY (ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- O cliente completo fica em `data` (JSON). `empresa` e `created_at` são cópias para ordenar/buscar.
CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(40) NOT NULL,
  empresa VARCHAR(190) NOT NULL DEFAULT '',
  data LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_clients_created (created_at),
  KEY ix_clients_empresa (empresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chave/valor (JSON) para listas personalizadas, % do salário e notificações vistas.
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(64) NOT NULL,
  `value` LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
