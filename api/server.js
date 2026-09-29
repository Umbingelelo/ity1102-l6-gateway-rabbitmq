const http = require('node:http');
const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');
const { createClient } = require('redis');

const redis = createClient({ url: process.env.REDIS_URL });
const suscriptor = redis.duplicate();
const oyentes = new Map();
let canal;

function json(res, codigo, cuerpo) {
  res.writeHead(codigo, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
}

async function leer(req) {
  let cuerpo = '';
  for await (const trozo of req) {
    cuerpo += trozo;
    if (cuerpo.length > 16384) throw new Error('demasiado_grande');
  }
  return JSON.parse(cuerpo);
}

async function atender(req, res) {
  const ruta = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && ruta.pathname === '/predict') {
    let entrada;
    try {
      entrada = await leer(req);
    } catch (error) {
      return json(res, error.message === 'demasiado_grande' ? 413 : 400, { error: 'Se espera JSON válido de hasta 16 KB' });
    }
    if (typeof entrada.data !== 'string' || !entrada.data.trim()) {
      return json(res, 400, { error: 'data debe ser texto no vacío' });
    }
    const jobId = randomUUID();
    try {
      await redis.hSet(`job:${jobId}`, { status: 'Pending', created_at: new Date().toISOString() });
      canal.sendToQueue('inference_queue', Buffer.from(JSON.stringify({ jobId, data: entrada.data })), { persistent: true });
      await canal.waitForConfirms();
      return json(res, 202, { jobId, status: 'Pending' });
    } catch (error) {
      console.error('No se pudo encolar:', error);
      await redis.hSet(`job:${jobId}`, { status: 'Error' }).catch(() => {});
      return json(res, 503, { error: 'No se pudo aceptar el pedido' });
    }
  }
  const match = ruta.pathname.match(/^\/(job|events)\/([\w-]+)$/);
  if (!match || req.method !== 'GET') return json(res, 404, { error: 'Ruta no encontrada' });
  const [, tipo, jobId] = match;
  const key = `job:${jobId}`;
  if (tipo === 'job') {
    const estado = await redis.hGetAll(key);
    if (!Object.keys(estado).length) return json(res, 404, { error: 'Pedido no encontrado' });
    if (estado.result) estado.result = JSON.parse(estado.result);
    return json(res, 200, estado);
  }
  if (!(await redis.exists(key))) return json(res, 404, { error: 'Pedido no encontrado' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': escuchando\n\n');
  if (!oyentes.has(jobId)) oyentes.set(jobId, new Set());
  oyentes.get(jobId).add(res);
  req.on('close', () => {
    oyentes.get(jobId)?.delete(res);
    if (!oyentes.get(jobId)?.size) oyentes.delete(jobId);
  });
  // Primero registramos el oyente; luego miramos el estado para no perder el aviso al suscribirse.
  const estado = await redis.hGetAll(key);
  if (estado.status === 'Completed' && !res.writableEnded) {
    res.end(`data: ${JSON.stringify({ jobId, result: JSON.parse(estado.result) })}\n\n`);
  }
}

async function iniciar() {
  await redis.connect();
  await suscriptor.connect();
  await suscriptor.subscribe('job_notifications', mensaje => {
    const aviso = JSON.parse(mensaje);
    const conexiones = oyentes.get(aviso.jobId);
    if (!conexiones) return;
    for (const res of conexiones) if (!res.writableEnded) res.end(`data: ${mensaje}\n\n`);
  });
  const conexion = await amqp.connect(process.env.RABBITMQ_URL);
  canal = await conexion.createConfirmChannel();
  await canal.assertQueue('inference_queue', { durable: true });
  http.createServer((req, res) => {
    atender(req, res).catch(error => {
      console.error('Error API:', error);
      if (!res.headersSent) json(res, 503, { error: 'Servicio temporalmente no disponible' });
      else res.destroy();
    });
  }).listen(3000, '0.0.0.0', () => console.log('API lista en 3000'));
}
iniciar().catch(error => { console.error('Arranque fallido:', error); process.exit(1); });
