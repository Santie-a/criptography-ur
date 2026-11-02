# Etapa 1: compilar la UI
FROM node:22-alpine AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Etapa 2: servidor de Python que sirve la API y la UI compilada
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    MINICHAIN_HOST=0.0.0.0 MINICHAIN_PORT=8000 MINICHAIN_FRONTEND_DIST=/app/frontend/dist
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY minichain/ minichain/
COPY server/ server/
COPY --from=ui /ui/dist frontend/dist
RUN useradd --create-home app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["python", "-m", "server"]
