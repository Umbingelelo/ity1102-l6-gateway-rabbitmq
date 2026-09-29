const http = require('node:http');

const destinos = [
  [/^\/products(?:\/|$)/, 'catalogo'],
  [/^\/sales(?:\/|$)/, 'ventas'],
  [/^\/(?:predict|job\/|events\/)/, 'api'],
];

http.createServer((cliente, respuesta) => {
  if (cliente.url === '/health' && cliente.method === 'GET') {
    respuesta.writeHead(200, { 'Content-Type': 'application/json' });
    respuesta.end(JSON.stringify({ gateway: 'ok' }));
    return;
  }
  const destino = destinos.find(([ruta]) => ruta.test(cliente.url));
  if (!destino) {
    respuesta.writeHead(404, { 'Content-Type': 'application/json' });
    respuesta.end(JSON.stringify({ error: 'Ruta no encontrada' }));
    return;
  }
  const servicio = destino[1];
  const solicitud = http.request({
    hostname: servicio,
    port: servicio === 'ventas' ? 5000 : 3000,
    path: cliente.url,
    method: cliente.method,
    headers: cliente.headers,
    timeout: 35000,
  }, interna => {
    respuesta.writeHead(interna.statusCode, interna.headers);
    interna.pipe(respuesta);
  });
  solicitud.on('timeout', () => solicitud.destroy(new Error('timeout')));
  solicitud.on('error', () => {
    if (respuesta.headersSent) return respuesta.destroy();
    respuesta.writeHead(502, { 'Content-Type': 'application/json' });
    respuesta.end(JSON.stringify({ error: `${servicio} no responde` }));
  });
  cliente.pipe(solicitud);
}).listen(8080, '0.0.0.0', () => console.log('Gateway Node listo en 8080'));
