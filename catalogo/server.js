const http = require('node:http');
const products = [
  { id: 1, name: 'Laptop', price: 999 },
  { id: 2, name: 'Mouse', price: 25 },
  { id: 3, name: 'Teclado', price: 45 },
];
http.createServer((req, res) => {
  const existe = req.url === '/products';
  const codigo = !existe ? 404 : req.method === 'GET' ? 200 : 405;
  res.writeHead(codigo, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(codigo === 200 ? { products } : { error: 'Ruta o método no disponible' }));
}).listen(3000, '0.0.0.0', () => console.log('Catálogo listo en 3000'));
