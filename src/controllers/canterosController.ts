import { Request, Response } from 'express';
import { CanterosService } from '../services/canterosService.js';

export class CanterosController {
  static async getCanteros(req: Request, res: Response) {
    try {
      const payload = await CanterosService.getCanteros();
      res.json(payload);
    } catch (error) {
      console.error('Error al obtener canteros:', error);
      res.status(500).json({ error: 'Error al obtener canteros' });
    }
  }

  static async getCultivos(req: Request, res: Response) {
    try {
      const payload = await CanterosService.getCultivos();
      res.json(payload);
    } catch (error: any) {
      console.error('Error al listar cultivos:', error.message);
      res.json([]);
    }
  }

  static async createCantero(req: Request, res: Response) {
    try {
      if (!req.body.id || !req.body.nombre) return res.status(400).json({ error: 'ID y nombre requeridos' });
      // invernaderoId es OBLIGATORIO: todo cantero debe pertenecer a un invernadero
      if (!req.body.invernaderoId) return res.status(400).json({ error: 'invernaderoId es requerido' });
      const result = await CanterosService.upsertCantero(req.body, req.user?.id || null);
      res.status(201).json({ id: req.body.id, nombre: req.body.nombre });
    } catch (error) {
      console.error('Error al crear cantero:', error);
      res.status(500).json({ error: 'Error al crear cantero' });
    }
  }

  static async updateCantero(req: Request, res: Response) {
    try {
      await CanterosService.updateCantero(req.params.id, req.body, req.user?.id || null);
      res.json({ message: 'Cantero actualizado' });
    } catch (error: any) {
      console.error('Error al actualizar cantero:', error.message);
      res.status(500).json({ error: 'Error al actualizar cantero' });
    }
  }

  static async deleteCantero(req: Request, res: Response) {
    try {
      await CanterosService.deleteCantero(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      if (error.code === 'P2025') {
         return res.json({ success: true }); 
      }
      if (error.message.includes('Operación denegada')) {
        return res.status(403).json({ error: error.message });
      }
      console.error('Error al eliminar cantero:', error.message);
      res.status(500).json({ error: 'Error al eliminar cantero' });
    }
  }
}
