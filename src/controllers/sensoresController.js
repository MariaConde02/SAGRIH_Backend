import * as sensoresService from '../services/sensoresService.js';

export async function obtenerNivel(req, res) {
  try {
    const result = await sensoresService.obtenerNivelTanque();
    res.json(result);
  } catch (error) {
    console.error('Error al obtener datos del tanque:', error);
    res.status(500).json({ error: 'Error al obtener datos del tanque' });
  }
}

export async function obtenerAmbiente(req, res) {
  try {
    const result = await sensoresService.obtenerAmbiente();
    res.json(result);
  } catch (error) {
    console.error('Error al obtener datos ambientales:', error);
    res.status(500).json({ error: 'Error al obtener datos ambientales' });
  }
}

export async function insertarLecturas(req, res) {
  try {
    let lecturas = req.body.lecturas || req.body;
    if (!Array.isArray(lecturas)) lecturas = [lecturas];

    const result = await sensoresService.insertarLecturas(lecturas);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error al insertar lecturas:', error);
    res.status(500).json({ error: 'Error al insertar lecturas de sensores' });
  }
}

export async function obtenerRed(req, res) {
  try {
    const result = await sensoresService.obtenerRed();
    res.json(result);
  } catch (error) {
    console.error('Error al obtener estado de red:', error);
    res.status(500).json({ error: 'Error al obtener estado de red' });
  }
}
