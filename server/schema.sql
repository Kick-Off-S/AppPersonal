-- Gestión Personal: base de datos del servidor (Cloudflare D1).
-- El servidor NO guarda datos personales legibles:
--   subs:    a qué dirección avisar y a qué horas (sin texto ni datos de salud o finanzas).
--   backups: respaldos cifrados en el teléfono con la contraseña del usuario (el servidor no puede leerlos).
CREATE TABLE IF NOT EXISTS subs (
  id TEXT PRIMARY KEY,          -- identificador aleatorio del teléfono
  endpoint TEXT NOT NULL,       -- dirección de push (Apple/Google/Mozilla)
  tz TEXT NOT NULL,             -- zona horaria del teléfono (ej: America/Santiago)
  slots TEXT NOT NULL,          -- JSON: [{ t: 'HH:MM', d: [0..6] | null, date: 'YYYY-MM-DD' | null }]
  updated INTEGER NOT NULL,
  last_sent TEXT                -- último minuto avisado (evita duplicados)
);
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,          -- código de recuperación (aleatorio)
  token_hash TEXT NOT NULL,     -- SHA-256 del permiso de escritura
  data TEXT NOT NULL,           -- respaldo cifrado (AES-GCM, clave derivada de la contraseña)
  size INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
-- Estadísticas anónimas: cuántas veces se abrió la app por día, versión y tipo de teléfono
-- (cada teléfono avisa como máximo una vez al día; no hay identificador).
CREATE TABLE IF NOT EXISTS stats (
  day TEXT NOT NULL,            -- YYYY-MM-DD (UTC)
  version TEXT NOT NULL,        -- versión de la app (ej: 4.20)
  platform TEXT NOT NULL,       -- ios-app, ios-web, android-app, android-web, desktop, otro
  n INTEGER NOT NULL,
  PRIMARY KEY (day, version, platform)
);
-- Reportes de fallas: errores automáticos (sin datos personales) y problemas que escribe el usuario.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,           -- error | user
  version TEXT, platform TEXT, view TEXT,
  message TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS reports_at ON reports (at);
