import * as authService from '../services/authService.js';

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    const message = status === 500 ? 'Error interno del servidor' : error.message;
    if (status === 500) console.error('Error en login:', error);
    res.status(status).json({ error: message });
  }
}

export async function register(req, res) {
  try {
    const { nombre, apellido, email, password, rolId } = req.body;
    const result = await authService.registerUser(nombre, apellido, email, password, rolId);
    res.status(201).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    const message = status === 500 ? 'Error interno del servidor' : error.message;
    if (status === 500) console.error('Error en registro:', error);
    res.status(status).json({ error: message });
  }
}

export async function me(req, res) {
  try {
    const result = await authService.getCurrentUser(req.headers.authorization);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    const message = status === 500 ? 'Error interno del servidor' : error.message;
    if (status === 500) console.error('Error en /me:', error);
    res.status(status).json({ error: message });
  }
}

export async function changePassword(req, res) {
  try {
    const { newPassword } = req.body;
    const userId = req.user.id;
    const result = await authService.changePassword(userId, undefined, newPassword);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    const message = status === 500 ? 'Error interno del servidor' : error.message;
    if (status === 500) console.error('Error en changePassword:', error);
    res.status(status).json({ error: message });
  }
}

export async function recoverPassword(req, res) {
  try {
    const { email } = req.body;
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));
    const result = await authService.recoverPassword(email);
    res.json(result);
  } catch (error) {
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));
    const status = error.statusCode || 500;
    const message = status === 500 ? 'Error interno del servidor' : error.message;
    if (status === 500) console.error('Error en recoverPassword:', error);
    res.status(status).json({ error: message });
  }
}
