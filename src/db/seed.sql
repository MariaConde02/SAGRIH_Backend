-- SAGRIH - Datos Maestros Iniciales
-- Solo datos de referencia + usuario admin.
-- El admin creará invernaderos, canteros, dispositivos y usuarios desde la UI.

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

-- TM_USUAR: solo administrador
INSERT INTO TM_USUAR (USUAR_NM, USUAR_AP, USUAR_EM, USUAR_PW, USUAR_MN, ROLES_ID, USUAR_EST) VALUES
    ('Administrador', 'SAGRIH', 'administradorsagrih@gmail.com', '$2a$10$PS9oMNYGBUlnlRjC1uRbGuf.UQAWGo3aEBEZ7EO1Pfa.fABj3ENyG', 'email', 1, 'activo')
ON CONFLICT (USUAR_EM) DO NOTHING;

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
