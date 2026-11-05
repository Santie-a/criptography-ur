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
    MINICHAIN_HOST=0.0.0.0 MINICHAIN_FRONTEND_DIST=/app/frontend/dist \
    FORWARDED_ALLOW_IPS=*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY minichain/ minichain/
COPY server/ server/
COPY --from=ui /ui/dist frontend/dist
RUN useradd --create-home app
USER app
EXPOSE 8000
# El puerto sale de PORT (lo asigna Render) o es 8000 por defecto.
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.getenv('PORT', '8000'))"
CMD ["python", "-m", "server"]
