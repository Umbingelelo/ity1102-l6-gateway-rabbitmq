# L6 · Gateway Node y RabbitMQ en AWS

Repositorio público de ITY1102 para el laboratorio 6. Contiene el código editable de cinco servicios (`gateway`, `catalogo`, `ventas`, `api`, `worker`) y `compose.yaml`; RabbitMQ y Redis usan imágenes oficiales. La guía completa, con pasos de la consola AWS, salidas esperadas y resolución de fallos, está en [LABORATORIO.md](LABORATORIO.md).

## Descargar en tu EC2

Primero entra a **AWS Academy Learner Lab**, inicia una EC2 Ubuntu 24.04 `t3.medium` con 20 GiB de disco, y habilita SSH `22` y HTTP `8080` **solo desde My IP**. Sigue [la guía](LABORATORIO.md) hasta instalar Docker y Compose (tramo 1). Después, conectado por SSH como `ubuntu` o por EC2 Instance Connect, ejecuta **en la terminal de EC2**:

```bash
git clone https://github.com/Umbingelelo/ity1102-l6-gateway-rabbitmq.git ~/l6
cd ~/l6
docker compose config --services
```

Verás siete nombres: `gateway`, `catalogo`, `ventas`, `api`, `worker`, `rabbitmq`, `redis`. Si `git` falta, instala el paquete con `sudo apt-get update` y `sudo apt-get install -y git`. No necesitas iniciar sesión en GitHub, hacer un fork ni descargar un ZIP.

Continúa **en orden** con [el laboratorio completo](LABORATORIO.md): construye los primeros tres servicios, inicia el resto, observa el `202` y el resultado, prueba la recuperación de RabbitMQ y detén la EC2 al terminar. No expongas RabbitMQ ni Redis a internet.

El worker clasifica palabras tras una espera de 12 segundos: **simula inferencia**, no usa un modelo entrenado. Este despliegue HTTP sin TLS ni autenticación es solo para clase.
