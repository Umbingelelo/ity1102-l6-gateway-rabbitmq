---
codigo: L6
titulo: Gateway Node y RabbitMQ en AWS
descripcion: Levantas en EC2 siete servicios con Docker Compose; ves cómo un gateway Node reparte las solicitudes y cómo una cola recupera un trabajo de inferencia si se cae el worker.
minutos: 105
puntos: 100
orden: 60
---

## Qué vas a lograr

Vas a construir **en una instancia EC2 de AWS Academy** esta arquitectura. Solo **un puerto**, el `8080`, será visible desde tu computador:

```text
Tu computador -> EC2:8080 -> gateway Node -> catalogo Node (interno:3000)
                                     |----> ventas Flask (interno:5000)
                                     `----> API Node (interno:3000) -> RabbitMQ -> worker Python
                                                  ^                              |
                                                  `------- Redis <--- resultado -'
```

**Qué hace cada pieza:**

| Pieza | Responsabilidad | Quién la construye |
|---|---|---|
| `gateway` | Recibe, decide la ruta y transmite la respuesta, incluidos los avisos en vivo | Tú: código Node y Dockerfile del repositorio |
| `catalogo` | Devuelve una lista de tres productos | Tú: código Node y Dockerfile |
| `ventas` | Registra una venta de ejemplo | Tú: código Flask y Dockerfile |
| `api` | Acepta un pedido, entrega un número, consulta su estado y avisa cuando termina | Tú: código Node y Dockerfile |
| `worker` | Procesa el texto, guarda el resultado y **solo entonces** confirma el mensaje | Tú: código Python y Dockerfile |
| `rabbitmq` | Conserva los pedidos mientras el worker trabaja o está caído | Imagen oficial, no tienes que programar un broker |
| `redis` | Conserva el estado por número de pedido y anuncia que está listo | Imagen oficial, no tienes que programar una base de datos |

**La inferencia de hoy es simulada:** el worker espera 12 segundos y clasifica el texto como positivo, negativo o neutro buscando palabras. No se entrena ni se descarga un modelo de IA. Eso permite observar el recorrido, la cola y la recuperación sin consumir la memoria de EC2 con PyTorch. No presentes esa clasificación como un modelo entrenado en tu informe.

**Lo que entregas a Pulso:** la URL de tu gateway mientras esté encendido; las salidas de `/health`, `/products`, `POST /sales`, `POST /predict` con `202` y `jobId`, y `/job/<jobId>` terminado; las tres observaciones del experimento de caída (mensaje sin confirmar, mensaje listo para reintento, resultado tras reiniciar el worker). **Después apagas la instancia; la URL deja de funcionar.** Conserva capturas o copia de las salidas para la entrega.

### Tiempo y mapa de la sesión

| Tramo | Min | Qué haces |
|---|---|---|
| **1** | 20 | Enciendes AWS Academy, creas o reutilizas EC2, dejas abiertos solo SSH y el gateway |
| **2** | 25 | Clonas las fuentes, construyes gateway, catálogo y ventas; compruebas las rutas desde tu computador |
| **3** | 40 | Levantas API, RabbitMQ, Redis y worker; pides un trabajo y ves cómo termina |
| **4** | 20 | Cortas al worker durante un pedido, compruebas la recuperación, guardas evidencia y apagas |

### El repositorio público de la clase

Todo el código **completo y editable** está en [github.com/Umbingelelo/ity1102-l6-gateway-rabbitmq](https://github.com/Umbingelelo/ity1102-l6-gateway-rabbitmq): los cinco servicios, sus Dockerfiles, `compose.yaml` y esta guía. Puedes abrirlo sin cuenta de GitHub. En el tramo 2 lo descargas directamente a EC2 con `git clone`; no necesitas adjuntos, un repositorio privado ni copiar los archivos uno por uno.

**Dónde escribes:** «EN LA CONSOLA DE AWS» es el navegador de AWS; «EN TU COMPUTADOR» es PowerShell o Terminal; «EN EC2» es la terminal cuyo prompt empieza por `ubuntu@ip-…`. No copies comandos de Linux en PowerShell ni pongas `LA-IP` literalmente: se reemplaza con la IPv4 pública que muestre EC2.

:::alerta
No uses tu cuenta personal de AWS: entra por **AWS Academy Learner Lab**. La instancia consume crédito mientras está encendida. Trabaja **en parejas, una instancia por pareja**, y al terminar **Stop instance**; no confundas *Stop* con *Terminate*. Las imágenes se descargan durante la clase: si el laboratorio de AWS no tiene salida a internet, Docker no podrá construirlas.
:::

---

## Tramo 1 · Tu servidor en AWS

### 1.1 Iniciar Learner Lab y decidir la instancia

**EN LA CONSOLA DE AWS.** AWS Academy → curso → **Learner Lab** → **Start Lab**. Espera a que el círculo junto a **AWS** se ponga verde; haz click en **AWS** para abrir la consola. A la derecha, en el selector de región, elige **N. Virginia (`us-east-1`)**. Escribe `EC2` en el buscador y entra a **Instances**.

Si conservas la EC2 Ubuntu `t3.medium` de L3/L4, con Docker instalado y al menos 16 GiB de disco, úsala: **Instance state → Start instance**. En su security group agrega solo la regla TCP `8080` desde **My IP**. Conserva SSH `22` desde **My IP**. Asegúrate de que hay al menos 5 GiB libres (`df -h` en el servidor). Si no cumple, sigue los pasos para crear una nueva. No elimines la instancia de L3: contiene trabajo de tu equipo.
**Para editar las reglas de una instancia existente:** marca la instancia → pestaña **Security** del panel inferior → click en el enlace bajo **Security groups** → pestaña **Inbound rules** → **Edit inbound rules** → **Add rule**. En *Type* elige **Custom TCP**, en *Port range* escribe `8080`, en *Source* elige **My IP** y pulsa **Save rules**. En la tabla deben quedar SSH `22` y Custom TCP `8080`, ambos desde tu IP actual; si ves un `3000` o `5000` de L3, elimínalo **solo si tu equipo ya no lo necesita** para la defensa. Si cambiaste de red desde L3, edita también la fuente del `22` a tu IP de hoy.

Si necesitas crearla: **Launch instances** y llena así el formulario, de arriba abajo:

| Lo que ves en AWS | Selección | Qué comprobar antes de lanzar |
|---|---|---|
| **Name and tags** | `l6-tus-apellidos` | Que distingas tu instancia de las demás del curso |
| **Application and OS Images** | Ubuntu Server **24.04 LTS**, **64-bit (x86)** | No ARM: las imágenes se construirán para x86 |
| **Instance type** | `t3.medium` (2 vCPU, 4 GiB RAM) | `t3.micro` tiene 1 GiB: no alcanza para siete servicios |
| **Key pair (login)** | `vockey` | Si falta, verifica el punto verde de Learner Lab y la región |
| **Network settings → Edit** | Auto-assign public IP: **Enable** | Necesitas IPv4 pública para SSH y probar la API |
| **Inbound security group rules** | SSH `22` → **My IP**; Custom TCP `8080` → **My IP** | **No abras** `3000`, `5000`, `5672`, `6379` ni `15672` |
| **Configure storage** | `20` GiB, `gp3` | Docker descarga y construye cinco imágenes; 8 GiB es insuficiente |

Click **Launch instance → View all instances**. Espera a que **Instance state** diga `Running` y **Status check** diga `2/2 checks passed`. Marca tu instancia y copia **Public IPv4 address** del panel de detalles. Es la `LA-IP` de esta guía. Si detienes y vuelves a iniciar sin IP elástica, cambia: vuelve a copiarla.

:::caja{1.1 corta}
Anota el nombre de la instancia, tipo, región y las **dos** reglas de entrada. ¿Por qué RabbitMQ y Redis no tienen un puerto abierto al exterior?
:::

### 1.2 Descargar la clave y comprobar la conexión

**EN LA PESTAÑA DEL LEARNER LAB** (no la consola EC2): **AWS Details → Download PEM**. Debe bajar `labsuser.pem` a Descargas. El código lo descargarás desde el repositorio público cuando entres a EC2.

**EN TU COMPUTADOR — PowerShell (Windows):**

```powershell
cd $HOME\Downloads
dir labsuser.pem
icacls.exe labsuser.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i labsuser.pem ubuntu@LA-IP
```

**Qué hace cada comando:** `cd` entra a Descargas; `dir` confirma que existe la clave; `icacls` evita que otros usuarios la lean; `ssh` entra en tu EC2. Cambia `LA-IP` por la IPv4 pública. Si PowerShell abre el diálogo de huella, escribe `yes` una vez. **Lo visible cuando funciona:** el prompt cambia de `PS C:\Users\…>` a `ubuntu@ip-172-31-…:~$`.

**EN TU COMPUTADOR — Terminal (macOS/Linux), alternativa al bloque anterior:**

```bash
cd ~/Downloads
ls -l labsuser.pem
chmod 400 labsuser.pem
ssh -i labsuser.pem ubuntu@LA-IP
```

**Qué hace cada comando:** `cd` ubica la carpeta, `ls` confirma el archivo, `chmod` deja la clave solo para tu usuario y `ssh` abre la sesión cifrada. **Lo visible:** el mismo prompt `ubuntu@ip-172-31-…:~$`.

:::pista
`Permission denied (publickey)`: comprueba `vockey`, usuario `ubuntu` y la clave recién bajada. `Connection timed out`: revisa la regla SSH `22` desde tu IP actual y los `2/2 checks passed`. En Windows usa **PowerShell**, no `cmd`. Si tu red bloquea SSH, usa **EC2 → Instances → Connect → EC2 Instance Connect**. Esa conexión sale desde AWS, no desde `My IP`; pide ayuda para autorizar el prefijo gestionado de EC2 Instance Connect en el puerto 22. **No abras SSH a todo internet** para solucionar un timeout. El repositorio se puede clonar desde la terminal de EC2 Instance Connect si la instancia tiene salida a GitHub.
:::

### 1.3 Confirmar Docker en el servidor

**EN EC2** (prompt `ubuntu@ip-…`). Si reutilizas la instancia de L3, Docker probablemente ya está instalado. Haz esta comprobación:

```bash
docker --version
docker compose version
df -h /
```

**Qué hace cada comando:** los dos primeros muestran la versión del motor y de Compose; `df` muestra espacio libre en el disco raíz. **Lo visible:** dos líneas con versiones y la columna `Avail` con al menos **5G**. Si falta Docker **o falta Compose** (habitual si reutilizas la EC2 de L3), ejecuta el bloque siguiente. También es seguro si Docker ya está instalado:

```bash
sudo apt-get update
sudo apt-get install -y software-properties-common
sudo add-apt-repository -y universe
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
newgrp docker
docker compose version
```

**Qué hace cada comando:** actualiza el índice, habilita el repositorio `universe` de Ubuntu 24.04 (donde está `docker-compose-v2`), instala Docker y Compose, inicia el motor, da permiso a `ubuntu` y activa el grupo en esta sesión. **Lo visible:** `docker compose version` devuelve una versión, no `command not found`. Si el motor aún da `permission denied`, cierra SSH y vuelve a entrar para renovar el grupo. No instales el antiguo `docker-compose` con guion: esta guía usa **`docker compose`**.

---

## Tramo 2 · La puerta y sus dos oficinas

### 2.1 Descargar el repositorio en EC2

**EN TU COMPUTADOR, en el navegador:** abre `https://github.com/Umbingelelo/ity1102-l6-gateway-rabbitmq`. Debes ver el nombre del proyecto y las carpetas `gateway/`, `catalogo/`, `ventas/`, `api/`, `worker/`, además de `compose.yaml` y `LABORATORIO.md`. Pulsa el botón verde **Code** → pestaña **Local** → **HTTPS**: allí aparece la dirección que termina en `.git`. Puedes pulsar el icono de copiar, pero el comando siguiente ya trae esa dirección completa. No pulses **Fork** ni necesitas iniciar sesión.

**EN EC2**, en la terminal donde ves `ubuntu@ip-…`, comprueba Git y descarga todo el repositorio:

```bash
git --version
git clone https://github.com/Umbingelelo/ity1102-l6-gateway-rabbitmq.git ~/l6
cd ~/l6
pwd
git remote -v
find . -maxdepth 2 -type f | sort
docker compose config --services
```

**Qué hace cada comando:** comprueba Git; `clone` trae **todas** las carpetas al directorio `~/l6` de EC2; `cd` entra allí; `pwd`, `remote` y `find` te muestran dónde estás, la URL de origen y los archivos; Compose enumera los servicios. **Lo visible:** `Cloning into '/home/ubuntu/l6'...`, luego `pwd` termina en `/l6`, `git remote -v` muestra la URL pública y `find` incluye `compose.yaml`, cinco Dockerfiles y el código de los cinco servicios. El último comando imprime `gateway`, `catalogo`, `ventas`, `api`, `worker`, `rabbitmq`, `redis` (pueden variar de orden). No escribas el signo `$` del prompt ni ejecutes esto en PowerShell.

:::pista
Si `git --version` dice `command not found`, ejecuta `sudo apt-get update` y `sudo apt-get install -y git` **en EC2**, y repite el bloque. Si Git dice `destination path '/home/ubuntu/l6' already exists`, **no borres trabajo anterior**: si ya es este repositorio y aún no lo has editado, ejecuta `git -C ~/l6 pull --ff-only` y después `cd ~/l6`; si era una carpeta de otro intento, renómbrala con `mv ~/l6 ~/l6-anterior` y repite `git clone`. Si `clone` no llega a GitHub, abre la URL pública en tu navegador y comprueba que la EC2 tenga salida HTTPS a internet; también la necesitarás para descargar las imágenes Docker.
:::

:::caja{2.1 corta}
Escribe los **siete nombres** que te devuelve Compose. De ellos, ¿cuáles cinco se construyen desde el código del repositorio y cuáles dos se descargan como imágenes oficiales?
:::

### 2.2 Leer y construir la puerta

**EN EC2.** Antes de arrancar, mira las tres rutas del gateway y el código de cada oficina:

```bash
sed -n '1,55p' gateway/server.js
sed -n '1,80p' catalogo/server.js
sed -n '1,80p' ventas/app.py
sed -n '1,65p' compose.yaml
docker compose build gateway catalogo ventas
```

**Qué hace cada comando:** muestra el código que ejecuta el gateway, la lista de productos en Node y la respuesta de ventas en Flask; luego muestra qué puerto publica Compose y construye **tus tres primeras imágenes**. No hay Nginx: `gateway/server.js` usa el módulo HTTP de Node para enviar `/products` al catálogo, `/sales` a ventas y `/predict`, `/job/…`, `/events/…` a la API. **Lo visible:** al final, Compose informa que las tres imágenes se construyeron; si falla una dependencia de Python, revisa la red de salida de la EC2.

Arranca solo esas tres piezas:

```bash
docker compose up -d gateway catalogo ventas
docker compose ps
curl -i http://localhost:8080/health
curl -i http://localhost:8080/products
curl -i -X POST http://localhost:8080/sales
```

**Qué hace cada comando:** arranca la puerta y las oficinas en segundo plano; `ps` muestra si siguen vivas; cada `curl -i` pide una respuesta **con sus headers** y contenido. **Lo visible:** `/health` devuelve `HTTP/1.1 200 OK` y `{"gateway":"ok"}`; `/products` devuelve `200` y tres artículos; `POST /sales` devuelve `201` con `"status":"registrada"`. El gateway puede mostrar `502` unos segundos si un servicio todavía está arrancando: repite cuando `docker compose ps` muestre `Up`.

**EN TU COMPUTADOR**, en un navegador, abre `http://LA-IP:8080/products`. Debes ver JSON con Laptop, Mouse y Teclado; no hace falta conocer los puertos internos. Si el `curl` **en EC2** funciona pero el navegador **en tu computador** no, revisa la regla `8080` desde **My IP**, la IPv4 actual y que la dirección empiece por `http://` (no `https://`).

:::control{1}
**Punto de control: la puerta es la única entrada.** En EC2, `docker compose ps` debe mostrar **solo `0.0.0.0:8080->8080/tcp` como puerto publicado**. Las oficinas pueden decir `3000/tcp` y `5000/tcp`, pero sin `0.0.0.0:` delante: solo se ven desde la red interna. Guarda la salida de los tres `curl` para Pulso.
:::

:::caja{2.2 corta}
Copia el código HTTP y el texto que devolvió cada ruta. ¿Qué servicio escribió la lista de productos? ¿Por qué el navegador no necesita saber que ventas está en el puerto 5000?
:::

### 2.3 Comprobar qué ocurre cuando una oficina no responde

**EN EC2:**

```bash
docker compose stop ventas
curl -i -X POST http://localhost:8080/sales
curl -i http://localhost:8080/products
docker compose start ventas
```

**Qué hace cada comando:** detiene solo ventas, consulta ambas oficinas a través de la misma puerta y vuelve a levantarla. **Lo visible:** ventas responde `502` con `"ventas no responde"`; catálogo sigue respondiendo `200`. Si `start` tarda, espera a ver `Up` con `docker compose ps`. No dejes ventas detenida para el siguiente tramo.

:::caja{2.3 corta}
¿Por qué contesta el gateway con `502` y no ventas? ¿Qué prueba la respuesta `200` del catálogo durante la caída?
:::

---

## Tramo 3 · La cola y la cocina

### 3.1 Construir lo que falta

**EN EC2.** En tu misma carpeta `~/l6`, lee los puntos donde cada servicio hace su trabajo:

```bash
sed -n '1,130p' api/server.js
sed -n '1,100p' worker/inference.py
docker compose build api worker
docker compose up -d
docker compose ps
```

**Qué hace cada comando:** muestra el código completo de la API y del worker, construye **ambas imágenes desde tus archivos** y arranca las siete piezas. Compose espera a que RabbitMQ y Redis estén sanos antes de iniciar API y worker. **Lo visible:** siete filas con estado `Up`; RabbitMQ y Redis pueden tardar entre 10 y 40 segundos en quedar `(healthy)`. Solo `gateway` muestra un puerto publicado al exterior. Una línea `Restarting` en API indica que no pudo conectar a RabbitMQ o Redis: consulta la pista siguiente.

:::pista
Si `api` o `worker` no dice `Up`, mira el mensaje real con `docker compose logs --tail=30 api worker rabbitmq redis`. `ECONNREFUSED` o `connection refused`: verifica que RabbitMQ y Redis digan `(healthy)` y vuelve a ejecutar `docker compose up -d`. `no space left on device`: EC2 no tiene el disco de 20 GiB o conservas imágenes viejas de L3. **No borres imágenes ni volúmenes ajenos** sin revisar; consulta al docente si reutilizaste la instancia.
:::

### 3.2 Pedir un trabajo sin esperar el resultado

**EN EC2** (también funciona EN TU COMPUTADOR sustituyendo `localhost` por `LA-IP`):

```bash
curl -i -H 'Content-Type: application/json' -d '{"data":"un producto bueno"}' http://localhost:8080/predict
```

**Qué hace cada comando:** manda texto al gateway, que lo pasa a la API; esta escribe `Pending` en Redis, deja el mensaje persistente en RabbitMQ y responde inmediatamente. **Lo visible:** `HTTP/1.1 202 Accepted` con `{"jobId":"xxxxxxxx-xxxx-…","status":"Pending"}`. **Copia el `jobId` real**: en las instrucciones que siguen lo llamamos `TU-JOB-ID`. No esperes que se vea la predicción aquí: el worker simula 12 segundos de trabajo. Si ves `503`, mira el estado de RabbitMQ y API antes de repetir.

:::caja{3.1 corta}
Pega tu respuesta `202` con su `jobId` y di en una frase por qué `202` no significa «la predicción ya está lista».
:::

### 3.3 Mirar la pizarra y la cola

**EN EC2.** Reemplaza `TU-JOB-ID` por el número de tu respuesta, **sin las comillas angulares**. Si tardaste en copiarlo, el trabajo ya pudo terminar: eso es normal; haz otro pedido si quieres ver `Pending`.

```bash
curl -i http://localhost:8080/job/TU-JOB-ID
docker compose exec redis redis-cli HGETALL job:TU-JOB-ID
docker compose exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker compose logs --tail=12 worker
```

**Qué hace cada comando:** consulta el estado por HTTP, lo lee directamente en Redis, pregunta cuántos mensajes están esperando (`messages_ready`) y cuántos están en manos del worker sin confirmación (`messages_unacknowledged`), y lee el log del cocinero. **Lo visible antes de terminar:** `status: Pending`, normalmente `messages_unacknowledged = 1`. **Después de unos 12 segundos:** `status: Completed`, resultado `{"label":"positivo",…}`, cola con `0 0` y log `ack enviado`. Si no ves el `1`, no es falla: el trabajo pudo haber terminado antes de que consultaras.

:::ojo
`redis-cli HGETALL` muestra el resultado como **texto JSON** guardado en un campo. `/job/TU-JOB-ID` lo entrega como objeto JSON. Son las mismas respuestas, vistas desde dos sitios distintos: desde el cliente y desde la pizarra interna.
:::

### 3.4 Esperar el aviso en vez de preguntar muchas veces

La API ofrece un flujo de eventos (`/events/TU-JOB-ID`). Abre **una segunda terminal SSH a EC2**. En la primera pide otro trabajo como en 3.2 y copia su nuevo `jobId`. En la segunda, antes de que pasen los 12 segundos:

```bash
curl -N http://localhost:8080/events/TU-JOB-ID
```

**Qué hace cada comando:** `-N` muestra el aviso a medida que llega, sin esperar a que se cierre la conexión. **Lo visible:** primero `: escuchando` y, al terminar el worker, una línea `data: {"jobId":"…","result":…}`. El gateway Node transmite ese flujo sin cortarlo. Si te conectaste tarde, la API mira Redis y entrega el resultado ya guardado. No uses un `jobId` anterior si quieres observar los 12 segundos de espera.

:::control{2}
**Punto de control: respuesta rápida, resultado lento.** Guarda el `202` con `jobId`, el estado `Completed` y el aviso `data:`. La API publica el aviso después de escribir el resultado en Redis. El usuario puede preguntar por el número o esperar la notificación; son dos formas de ver el mismo trabajo.
:::

:::caja{3.2 corta}
Pega el estado final y el aviso. ¿Cuál llegó primero: el `202` o la predicción? ¿Dónde quedó guardada la predicción cuando cerraste la ventana del aviso?
:::

---

## Tramo 4 · La comanda que vuelve

### 4.1 Detener al worker antes del ack

**EN EC2.** Vamos a detener deliberadamente **solo el worker**, cuando esté procesando. Haz un nuevo pedido como en 3.2 y copia el nuevo `jobId`. Inmediatamente consulta el log: al ver `Procesando <tu-id>`, ejecuta el `stop` **antes de los 12 segundos**. Si no alcanzas, repite con un pedido nuevo. El experimento no se hizo si ya viste `ack enviado`.

```bash
docker compose logs --tail=5 worker
docker compose exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
docker compose stop -t 0 worker
docker compose exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
curl -i http://localhost:8080/job/TU-JOB-ID
```

**Qué hace cada comando:** muestra qué pedido tomó el worker; mira la cola antes de detenerlo; lo para de inmediato **sin darle oportunidad de confirmar**; vuelve a mirar la cola y pregunta por el estado. **Lo visible:** antes del stop hay `messages_unacknowledged = 1`; después, cuando RabbitMQ detecta la conexión cerrada, ese mensaje pasa a `messages_ready = 1` y `messages_unacknowledged = 0`. En Redis el pedido sigue `Pending`. Puede tardar algunos segundos en volver a `ready`: vuelve a consultar la cola si aún ves `0 1`.

:::alerta
No uses `docker compose down -v` en este punto: `-v` borra los volúmenes de RabbitMQ y Redis, incluida tu evidencia. Tampoco apagues EC2 aún. La prueba es **worker detenido, broker y Redis vivos**.
:::

### 4.2 Volver a levantarlo y observar el resultado

**EN EC2:**

```bash
docker compose up -d worker
docker compose logs --tail=12 worker
curl -i http://localhost:8080/job/TU-JOB-ID
docker compose exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
```

**Qué hace cada comando:** inicia otra vez **ese** worker; su log debe mostrar `Procesando <tu-id>` y luego `ack enviado`. Si preguntaste demasiado rápido, el estado aún será `Pending`: espera 12 segundos y repite las dos últimas consultas. **Lo visible al terminar:** el mismo `jobId` pasa a `Completed`, resultado visible, cola `0 0`. No hay que mandar otro pedido: fue el mensaje que volvió al riel.

:::control{3}
**Punto de control que no se salta:** conserva las salidas `0 1` (o la línea `Procesando` anterior al corte), luego `1 0` con el worker detenido, y finalmente `Completed` con `0 0`. El `ack` se envía **después** de guardar el resultado en Redis. Si el worker se cae después de guardar pero antes de confirmar, RabbitMQ puede entregarlo otra vez: por eso el worker reconoce un `jobId` ya `Completed` y no recalcula la predicción.
:::

:::caja{4.1 corta}
Explica con tus tres observaciones dónde estaba el pedido antes del corte, mientras el worker estaba detenido y después de reiniciarlo. ¿Qué se habría perdido si el worker hubiera confirmado el mensaje **antes** de escribir en Redis?
:::

### 4.3 Una modificación tuya y el cierre

Para comprobar que **construiste** el servicio, no solo encendiste contenedores, cambia una regla sencilla del worker. **EN EC2:** abre el archivo con `nano worker/inference.py`; busca la línea que asigna la etiqueta y reemplaza la palabra `bueno` por `excelente`. Guarda con **Ctrl+O**, Enter, sal con **Ctrl+X**. Reconstruye solo el worker:

```bash
docker compose up -d --build worker
docker compose logs --tail=5 worker
curl -i -H 'Content-Type: application/json' -d '{"data":"un producto excelente"}' http://localhost:8080/predict
```

**Qué hace cada comando:** reconstruye tu imagen Python, confirma que el worker espera mensajes y manda un texto que activa **tu** cambio. Copia el nuevo `jobId`, espera 12 segundos y consulta `/job/TU-JOB-ID` como en 3.3. **Lo visible:** `"label":"positivo"`. Si da `neutro`, revisa que hayas guardado el archivo y que el rebuild haya terminado. No edites el resultado directamente en Redis: eso no probaría tu código.

**EN LA CONSOLA DE AWS**, EC2 → **Instances** → marca tu instancia → **Instance state → Stop instance**. Espera a ver `Stopped`. Los datos en el volumen EBS y el proyecto `~/l6` permanecen; la **IPv4 pública automática cambiará** al volver a iniciarla. Si creaste una IP elástica para otro laboratorio, puede seguir cobrando aunque la instancia esté apagada: decide si aún la necesitas antes de liberarla.

:::caja{4.2 corta}
Pega la salida de tu última predicción y escribe qué línea cambiaste. Anota también la hora en que la instancia quedó `Stopped`.
:::

### Si algo no responde: sigue la señal, no adivines

| Lo que ves | Dónde mirar | Qué corregir |
|---|---|---|
| AWS muestra `vockey` vacío | Punto verde y región | Inicia Learner Lab y selecciona `us-east-1` |
| SSH `timed out` | Security group, tu IP, `2/2 checks` | Actualiza `My IP`; no es un problema del `.pem` |
| `git clone` falla con `Repository not found` o no conecta | URL del repositorio y salida HTTPS de EC2 | Usa la dirección HTTPS completa de 2.1; confirma en tu navegador que el repositorio es público |
| Navegador desde tu computador no abre `8080`, `curl localhost` en EC2 sí | Regla TCP 8080, IPv4 nueva, `http://` | Abre 8080 **solo a My IP** |
| Gateway devuelve `502` para una ruta | `docker compose ps` y `docker compose logs --tail=30 gateway api catalogo ventas` | El destino está caído o todavía inicia; levántalo, no abras su puerto |
| API devuelve `503` al pedir | `docker compose ps` y `logs api rabbitmq redis` | Espera los healthchecks y reinicia API si es necesario |
| `jobId` devuelve `404` | Número copiado de otra petición | Usa el ID completo, sin `<` ni `>` |
| Pedido sigue `Pending` después de un minuto | `logs worker`, estado de cola, `ps` | Revisa si el worker está detenido y levántalo |
| Resultado `neutro` para `excelente` | Archivo worker y build | Reconstruye el worker después de editar; envía **otro** pedido |

**Seguridad:** se expone HTTP sin TLS ni autenticación, restringido a la IP de clase. Es un entorno didáctico, **no un diseño de producción**. No pongas datos personales en el texto del pedido. RabbitMQ y Redis no tienen puertos públicos; la contraseña predeterminada de sus imágenes no queda accesible desde internet. Al terminar, detén la instancia.
