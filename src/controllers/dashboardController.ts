import * as dashboardService from '../services/dashboardService.js';

export async function obtenerTendenciaAnual(req, res) {
  try {
    const result = await dashboardService.obtenerTendenciaAnual();
    res.json(result);
  } catch (error) {
    console.error('Error al obtener tendencia anual:', error);
    res.status(500).json({ error: 'Error al obtener tendencia anual' });
  }
}

export async function obtenerTendenciaMensual(req, res) {
  try {
    const result = await dashboardService.obtenerTendenciaMensual();
    res.json(result);
  } catch (error) {
    console.error('Error al obtener tendencia mensual:', error);
    res.status(500).json({ error: 'Error al obtener tendencia mensual' });
  }
}

export async function obtenerEficiencia(req, res) {
  try {
    const result = await dashboardService.obtenerEficiencia();
    res.json(result);
  } catch (error) {
    console.error('Error al obtener eficiencia:', error);
    res.status(500).json({ error: 'Error al obtener eficiencia' });
  }
}
