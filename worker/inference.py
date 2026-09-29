import json
import os
import time

import pika
import redis

cache = redis.Redis(host=os.environ['REDIS_HOST'], decode_responses=True)
connection = pika.BlockingConnection(pika.ConnectionParameters(host=os.environ['RABBITMQ_HOST']))
channel = connection.channel()
channel.queue_declare(queue='inference_queue', durable=True)
channel.basic_qos(prefetch_count=1)

def procesar(ch, method, properties, body):
    pedido = json.loads(body)
    job_id = pedido['jobId']
    print(f'Procesando {job_id}', flush=True)
    if cache.hget(f'job:{job_id}', 'status') != 'Completed':
        time.sleep(12)  # Simula una inferencia lenta; NO es un modelo entrenado.
        texto = pedido['data'].lower()
        etiqueta = 'positivo' if 'bueno' in texto else 'negativo' if 'malo' in texto else 'neutro'
        resultado = {'label': etiqueta, 'input': pedido['data']}
        cache.hset(f'job:{job_id}', mapping={
            'status': 'Completed', 'result': json.dumps(resultado)
        })
    else:
        resultado = json.loads(cache.hget(f'job:{job_id}', 'result'))
    cache.publish('job_notifications', json.dumps({'jobId': job_id, 'result': resultado}))
    ch.basic_ack(delivery_tag=method.delivery_tag)
    print(f'Terminado {job_id}; ack enviado', flush=True)

channel.basic_consume(queue='inference_queue', on_message_callback=procesar)
print('Worker listo; esperando pedidos', flush=True)
channel.start_consuming()
