FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir pika==1.3.2 redis==6.2.0
COPY inference.py .
USER 10001
CMD ["python", "inference.py"]
