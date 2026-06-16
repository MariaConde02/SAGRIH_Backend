-- SAGRIH - Datos de Siembra

-- TM_ROLES
INSERT INTO TM_ROLES (ROLES_NM, ROLES_DS) VALUES
    ('Administrador', 'Acceso total al sistema'),
    ('Ingeniero', 'Gestión técnica y configuración'),
    ('Operario', 'Operación diaria del invernadero'),
    ('Supervisor', 'Supervisión y reportes'),
    ('Invitado', 'Acceso de solo lectura')
ON CONFLICT (ROLES_NM) DO NOTHING;

-- TM_PERMI
INSERT INTO TM_PERMI (PERMI_NM, PERMI_DS) VALUES
    ('riego.control', 'Control manual de válvulas'),
    ('riego.programar', 'Crear/editar/eliminar programas de riego'),
    ('infraestructura.gestion', 'Gestionar invernaderos, canteros, dispositivos'),
    ('usuarios.gestion', 'Gestionar usuarios del sistema'),
    ('parametros.configurar', 'Configurar parámetros del sistema'),
    ('alertas.gestion', 'Gestionar alertas'),
    ('historial.ver', 'Ver historial de riegos y mantenimiento'),
    ('bitacora.ver', 'Ver bitácora de eventos')
ON CONFLICT (PERMI_NM) DO NOTHING;

-- TT_ROLPE: Admin tiene todos los permisos
INSERT INTO TT_ROLPE (ROLES_ID, PERMI_ID)
SELECT r.ROLES_ID, p.PERMI_ID
FROM TM_ROLES r, TM_PERMI p
WHERE r.ROLES_NM = 'Administrador'
ON CONFLICT DO NOTHING;

-- TT_ROLPE: Ingeniero
INSERT INTO TT_ROLPE (ROLES_ID, PERMI_ID)
SELECT r.ROLES_ID, p.PERMI_ID
FROM TM_ROLES r, TM_PERMI p
WHERE r.ROLES_NM = 'Ingeniero'
  AND p.PERMI_NM IN ('riego.control', 'riego.programar', 'infraestructura.gestion', 'parametros.configurar', 'historial.ver', 'bitacora.ver')
ON CONFLICT DO NOTHING;

-- TT_ROLPE: Operario
INSERT INTO TT_ROLPE (ROLES_ID, PERMI_ID)
SELECT r.ROLES_ID, p.PERMI_ID
FROM TM_ROLES r, TM_PERMI p
WHERE r.ROLES_NM = 'Operario'
  AND p.PERMI_NM IN ('riego.control', 'historial.ver')
ON CONFLICT DO NOTHING;

-- TM_UNIDM
INSERT INTO TM_UNIDM (UNIDM_NM, UNIDM_AB) VALUES
    ('Porcentaje', '%'),
    ('Grados Celsius', '°C'),
    ('Litros por minuto', 'L/min'),
    ('Litros', 'L'),
    ('Metros', 'm'),
    ('Metros cuadrados', 'm²'),
    ('Metros cúbicos', 'm³'),
    ('Minutos', 'min'),
    ('Horas', 'h'),
    ('Unidades', 'uds'),
    ('PPM', 'ppm')
ON CONFLICT (UNIDM_NM) DO NOTHING;

-- TM_TIPOD
INSERT INTO TM_TIPOD (TIPOD_NM) VALUES
    ('Controlador'),
    ('Sensor Humedad'),
    ('Sensor Ambiente'),
    ('Válvula'),
    ('Sensor CO2'),
    ('Sensor pH'),
    ('Bomba'),
    ('Actuador')
ON CONFLICT (TIPOD_NM) DO NOTHING;

-- TM_CULTI
INSERT INTO TM_CULTI (CULTI_NM, CULTI_MI, CULTI_MA) VALUES
    ('Tomate cherry', 55, 85),
    ('Lechuga crespa', 50, 80),
    ('Pimentón', 55, 85),
    ('Cilantro', 45, 75),
    ('Albahaca', 55, 85),
    ('Fresa', 60, 85),
    ('Pepino', 60, 90),
    ('Zanahoria', 50, 80)
ON CONFLICT (CULTI_NM) DO NOTHING;

-- TM_TIPAL
INSERT INTO TM_TIPAL (TIPAL_NM, TIPAL_DS) VALUES
    ('crítica', 'Requiere acción inmediata'),
    ('media', 'Requiere atención programada'),
    ('info', 'Notificación informativa')
ON CONFLICT (TIPAL_NM) DO NOTHING;

-- TM_INVER
INSERT INTO TM_INVER (INVER_ID, INVER_NM, INVER_UB, INVER_EST, INVER_MA) VALUES
    ('INV-MAESTRO', 'Invernadero Principal (Norte)', 'Sector A · Bloque 1', 'activo', TRUE),
    ('INV-01', 'Invernadero Norte', 'Sector A · Bloque 1', 'activo', FALSE),
    ('INV-02', 'Invernadero Sur', 'Sector A · Bloque 3', 'activo', FALSE),
    ('INV-03', 'Vivero Experimental', 'Sector B · Bloque 1', 'mantenimiento', FALSE)
ON CONFLICT (INVER_ID) DO NOTHING;

-- TM_USUAR
INSERT INTO TM_USUAR (USUAR_NM, USUAR_AP, USUAR_EM, USUAR_PW, USUAR_MN, ROLES_ID, USUAR_EST) VALUES
    ('Administrador', 'SAGRIH', 'administradorsagrih@gmail.com', '$2a$10$PS9oMNYGBUlnlRjC1uRbGuf.UQAWGo3aEBEZ7EO1Pfa.fABj3ENyG', 'email', 1, 'activo'),
    ('Ingeniero', 'SAGRIH', 'ingenierosagrih@gmail.com', '$2a$10$PS9oMNYGBUlnlRjC1uRbGuf.UQAWGo3aEBEZ7EO1Pfa.fABj3ENyG', 'email', 2, 'activo'),
    ('Operario', 'SAGRIH', 'operariosagrih@gmail.com', '$2a$10$PS9oMNYGBUlnlRjC1uRbGuf.UQAWGo3aEBEZ7EO1Pfa.fABj3ENyG', 'email', 3, 'activo'),
    ('Supervisor', 'SAGRIH', 'supervisorsagrih@gmail.com', '$2a$10$PS9oMNYGBUlnlRjC1uRbGuf.UQAWGo3aEBEZ7EO1Pfa.fABj3ENyG', 'email', 4, 'activo')
ON CONFLICT (USUAR_EM) DO NOTHING;

-- TM_CANTE
INSERT INTO TM_CANTE (CANTE_ID, CANTE_NM, INVER_ID, CULTI_ID) VALUES
    ('C-01', 'Cantero 1', 'INV-MAESTRO', 1),
    ('C-02', 'Cantero 2', 'INV-MAESTRO', 2),
    ('C-03', 'Cantero 3', 'INV-MAESTRO', 3),
    ('C-04', 'Cantero 4', 'INV-MAESTRO', 4),
    ('C-05', 'Cantero 5', 'INV-MAESTRO', 5)
ON CONFLICT (CANTE_ID) DO NOTHING;

-- TT_DISPO
INSERT INTO TT_DISPO (DISPO_ID, DISPO_TG, TIPOD_ID, CANTE_ID, INVER_ID, DISPO_ET, DISPO_SM) VALUES
    ('DEV-001', 'ESP32 Central', 1, NULL, 'INV-MAESTRO', 'Operativo', FALSE),
    ('DEV-002', 'Humedad C1', 2, 'C-01', 'INV-MAESTRO', 'Operativo', FALSE),
    ('DEV-003', 'DHT22 Ambiente', 3, NULL, 'INV-MAESTRO', 'Falla', FALSE),
    ('DEV-004', 'Válvula C1', 4, 'C-01', 'INV-MAESTRO', 'Mantenimiento', FALSE),
    ('DEV-005', 'Humedad C2', 2, 'C-02', 'INV-MAESTRO', 'Operativo', FALSE)
ON CONFLICT (DISPO_ID) DO NOTHING;

-- TT_PROGR
INSERT INTO TT_PROGR (CANTE_ID, PROGR_HI, PROGR_DR, PROGR_AT) VALUES
    ('C-01', '06:00', 15, TRUE),
    ('C-01', '18:00', 15, TRUE),
    ('C-02', '12:00', 10, TRUE);

-- TT_PROGD
INSERT INTO TT_PROGD (PROGR_ID, PROGD_DA)
SELECT p.PROGR_ID, d.val
FROM TT_PROGR p
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(val)
WHERE p.CANTE_ID = 'C-01' AND p.PROGR_HI = '06:00'
ON CONFLICT DO NOTHING;

INSERT INTO TT_PROGD (PROGR_ID, PROGD_DA)
SELECT p.PROGR_ID, d.val
FROM TT_PROGR p
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(val)
WHERE p.CANTE_ID = 'C-01' AND p.PROGR_HI = '18:00'
ON CONFLICT DO NOTHING;

INSERT INTO TT_PROGD (PROGR_ID, PROGD_DA)
SELECT p.PROGR_ID, d.val
FROM TT_PROGR p
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7)) AS d(val)
WHERE p.CANTE_ID = 'C-02' AND p.PROGR_HI = '12:00'
ON CONFLICT DO NOTHING;

-- TP_PARAM
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
    ('COMUNICACION_REINTENTOS', '3', 'Número de reintentos de conexión')
ON CONFLICT (PARAM_CL) DO NOTHING;

-- TH_RIHRI
INSERT INTO TH_RIHRI (CANTE_ID, RIHRI_TA, RIHRI_FI, RIHRI_VL, USUAR_ID) VALUES
    ('C-01', 'Automático', '2026-05-30 06:00:00', 80, NULL),
    ('C-02', 'Automático', '2026-05-30 06:15:00', 60, NULL),
    ('C-05', 'Manual', '2026-05-30 11:30:00', 45, 3),
    ('C-03', 'Automático', '2026-05-29 18:00:00', 70, NULL),
    ('C-04', 'Manual', '2026-05-29 14:22:00', 55, 2)
ON CONFLICT DO NOTHING;

-- TH_MANTE
INSERT INTO TH_MANTE (DISPO_ID, MANTE_TA, MANTE_FE, MANTE_OB, USUAR_ID, MANTE_RE) VALUES
    ('DEV-004', 'Limpieza de filtros', '2026-06-02 10:00:00', 'Filtros de válvula C-1 con obstrucción parcial', 3, FALSE),
    ('DEV-003', 'Calibración de sensores DHT22', '2026-06-04 09:00:00', 'Reemplazar sensor si persiste desviación', 2, FALSE),
    ('DEV-001', 'Revisión de bomba principal', '2026-05-29 15:30:00', 'Bomba operando dentro de parámetros normales', 4, TRUE)
ON CONFLICT DO NOTHING;

-- TT_LOGCO
INSERT INTO TT_LOGCO (DISPO_ID, LOGCO_EV) VALUES
    ('DEV-001', 'online'),
    ('DEV-002', 'online'),
    ('DEV-003', 'offline'),
    ('DEV-004', 'online'),
    ('DEV-005', 'online')
ON CONFLICT DO NOTHING;
