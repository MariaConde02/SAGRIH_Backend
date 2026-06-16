-- SAGRIH - Reset de Estado Cero
-- Vacía tablas transaccionales, preserva estructura y datos maestros
-- Uso: psql -d sagrih -f reset.sql  |  node src/db/migrate.js reset

BEGIN;

-- 1. Limpiar tablas transaccionales (orden inverso a FK)
DELETE FROM TT_LECTU;
DELETE FROM TT_LOGCO;
DELETE FROM TT_ALERT;
DELETE FROM TH_RIHRI;
DELETE FROM TH_MANTE;
DELETE FROM TT_PROGD;
DELETE FROM TT_PROGR;
DELETE FROM TT_DISPO;
DELETE FROM TT_ROLPE;
DELETE FROM TM_CANTE;
DELETE FROM TM_INVER;

-- 2. Resetear secuencias SERIAL
ALTER SEQUENCE IF EXISTS tt_lectu_lectu_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS tt_logco_logco_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS tt_alert_alert_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS th_rihri_rihri_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS th_mante_mante_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS tt_progd_progd_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS tt_progr_progr_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS tt_rolpe_rolpe_id_seq RESTART WITH 1;

-- 3. TP_PARAM se reinicia a valores por defecto (opcional)
TRUNCATE TP_PARAM;
INSERT INTO TP_PARAM (PARAM_CL, PARAM_VL, PARAM_DS) VALUES
    ('HUMEDAD_MIN_CRITICO', '35', 'Humedad mínima crítica para alerta'),
    ('HUMEDAD_OPTIMO_INFERIOR', '55', 'Límite inferior de humedad óptima'),
    ('HUMEDAD_OPTIMO_SUPERIOR', '85', 'Límite superior de humedad óptima'),
    ('RIEGO_DURACION_DEFECTO', '10', 'Duración de riego por defecto (min)'),
    ('RIEGO_CAUDAL_NOMINAL', '1.2', 'Caudal nominal del sistema (L/min)'),
    ('RIEGO_TIEMPO_ENTRE', '6', 'Tiempo mínimo entre riegos (h)'),
    ('TANQUE_CAPACIDAD', '10000', 'Capacidad total del tanque (L)'),
    ('TANQUE_ALERTA_BAJA', '20', 'Porcentaje para alerta de nivel bajo'),
    ('TANQUE_ALERTA_CRITICA', '10', 'Porcentaje para alerta de nivel crítico'),
    ('COMUNICACION_INTERVALO', '5', 'Intervalo de lectura de sensores (min)'),
    ('COMUNICACION_TIMEOUT', '30', 'Timeout de sensor (s)'),
    ('COMUNICACION_REINTENTOS', '3', 'Número de reintentos de conexión');

COMMIT;
