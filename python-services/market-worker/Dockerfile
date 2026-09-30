FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py settlement_store.py symbol_aliases.json* .
CMD ["python", "worker.py"]
