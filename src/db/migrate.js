import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2]; // 'reset' opcional

async function migrate() {
  console.log('Iniciando migracion SAGRIH...');
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(schema);
    console.log('1. Esquema creado exitosamente');

    const seedPath = path.join(__dirname, 'seed.sql');
    const seed = fs.readFileSync(seedPath, 'utf-8');
    await pool.query(seed);
    console.log('2. Datos de siembra insertados');

    const extraPath = path.join(__dirname, 'seed-extra.sql');
    const extra = fs.readFileSync(extraPath, 'utf-8');
    await pool.query(extra);
    console.log('3. Datos extra insertados (sensores, históricos)');

    console.log('Migracion completada exitosamente');
  } catch (error) {
    console.error('Error en migracion:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function reset() {
  console.log('Restaurando Estado Cero SAGRIH...');
  try {
    const resetPath = path.join(__dirname, 'reset.sql');
    const resetSql = fs.readFileSync(resetPath, 'utf-8');
    await pool.query(resetSql);
    console.log('Tablas transaccionales limpiadas');
    console.log('Parámetros reiniciados a valores por defecto');
    console.log('Datos maestros preservados (roles, unidades, tipos)');
    console.log('Estado Cero completado');
  } catch (error) {
    console.error('Error en reset:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (cmd === 'reset') {
  reset();
} else {
  migrate();
}
