-- Datos adicionales para sensores y dashboard
-- Ejecutar despues de la migracion inicial:
--   node src/db/migrate.js
--   psql -d sagrih -f src/db/seed-extra.sql
-- O usando: type src/db/seed-extra.sql | psql -d sagrih

-- 1. Tipo de dispositivo para sensor de nivel de agua
INSERT INTO TM_TIPOD (TIPOD_NM) VALUES ('Sensor Nivel Agua')
ON CONFLICT (TIPOD_NM) DO NOTHING;

-- 2. Dispositivo sensor de nivel de tanque
INSERT INTO TT_DISPO (DISPO_ID, DISPO_TG, TIPOD_ID, CANTE_ID, INVER_ID, DISPO_ET, DISPO_SM)
SELECT 'DEV-006', 'Sensor Nivel Tanque', TIPOD_ID, NULL, 'INV-MAESTRO', 'Operativo', FALSE
FROM TM_TIPOD WHERE TIPOD_NM = 'Sensor Nivel Agua'
ON CONFLICT (DISPO_ID) DO NOTHING;

-- 3. Lecturas de temperatura y humedad para el sensor ambiente (DEV-003)
INSERT INTO TT_LECTU (DISPO_ID, LECTU_VL, UNIDM_ID, LECTU_FH)
SELECT 'DEV-003', 28.5, UNIDM_ID, '2026-06-15 10:30:00'
FROM TM_UNIDM WHERE UNIDM_AB = '°C'
ON CONFLICT DO NOTHING;

INSERT INTO TT_LECTU (DISPO_ID, LECTU_VL, UNIDM_ID, LECTU_FH)
SELECT 'DEV-003', 65.0, UNIDM_ID, '2026-06-15 10:30:00'
FROM TM_UNIDM WHERE UNIDM_AB = '%'
ON CONFLICT DO NOTHING;

-- 4. Lectura de nivel de tanque
INSERT INTO TT_LECTU (DISPO_ID, LECTU_VL, UNIDM_ID, LECTU_FH)
SELECT 'DEV-006', 7500, UNIDM_ID, '2026-06-15 10:30:00'
FROM TM_UNIDM WHERE UNIDM_AB = 'L'
ON CONFLICT DO NOTHING;

-- 5. Historial de riegos para tendencias del dashboard (meses anteriores)
-- Automaticos: USUAR_ID = NULL
INSERT INTO TH_RIHRI (CANTE_ID, RIHRI_TA, RIHRI_FI, RIHRI_VL, USUAR_ID) VALUES
    ('C-01', 'Automático', '2026-01-05 06:00:00', 85, NULL),
    ('C-02', 'Automático', '2026-01-05 06:15:00', 60, NULL),
    ('C-01', 'Automático', '2026-01-12 06:00:00', 80, NULL),
    ('C-02', 'Automático', '2026-01-12 06:15:00', 65, NULL),
    ('C-01', 'Automático', '2026-02-02 06:00:00', 90, NULL),
    ('C-02', 'Automático', '2026-02-02 06:15:00', 70, NULL),
    ('C-03', 'Automático', '2026-02-09 18:00:00', 75, NULL),
    ('C-01', 'Automático', '2026-03-01 06:00:00', 95, NULL),
    ('C-02', 'Automático', '2026-03-01 06:15:00', 80, NULL),
    ('C-03', 'Automático', '2026-03-01 18:00:00', 70, NULL),
    ('C-01', 'Automático', '2026-04-05 06:00:00', 100, NULL),
    ('C-02', 'Automático', '2026-04-05 06:15:00', 85, NULL),
    ('C-03', 'Automático', '2026-04-05 18:00:00', 80, NULL),
    ('C-01', 'Automático', '2026-05-03 06:00:00', 85, NULL),
    ('C-02', 'Automático', '2026-05-03 06:15:00', 75, NULL),
    ('C-03', 'Automático', '2026-05-03 18:00:00', 70, NULL);

-- Manuales: resolver USUAR_ID por email para evitar FK breaks por SERIAL out-of-sync
INSERT INTO TH_RIHRI (CANTE_ID, RIHRI_TA, RIHRI_FI, RIHRI_VL, USUAR_ID)
SELECT 'C-04', 'Manual', '2026-03-08 14:00:00'::TIMESTAMP, 55, USUAR_ID FROM TM_USUAR WHERE USUAR_EM = 'ingenierosagrih@gmail.com'
UNION ALL
SELECT 'C-05', 'Manual', '2026-04-12 11:30:00'::TIMESTAMP, 50, USUAR_ID FROM TM_USUAR WHERE USUAR_EM = 'operariosagrih@gmail.com'
UNION ALL
SELECT 'C-04', 'Manual', '2026-05-10 14:00:00'::TIMESTAMP, 60, USUAR_ID FROM TM_USUAR WHERE USUAR_EM = 'operariosagrih@gmail.com'
UNION ALL
SELECT 'C-05', 'Manual', '2026-05-17 11:30:00'::TIMESTAMP, 45, USUAR_ID FROM TM_USUAR WHERE USUAR_EM = 'ingenierosagrih@gmail.com';

-- 6. Evento de conectividad para DEV-006
INSERT INTO TT_LOGCO (DISPO_ID, LOGCO_EV)
SELECT 'DEV-006', 'online'
ON CONFLICT DO NOTHING;
