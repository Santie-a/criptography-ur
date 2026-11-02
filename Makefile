# Atajos. En Windows sin make, copia los comandos de cada regla.
PY ?= python3

.PHONY: install dev build run test demo docker

install:            ## dependencias de Python y de la UI
	$(PY) -m pip install -r requirements-dev.txt
	cd frontend && npm install

dev:                ## API + Vite con recarga (http://localhost:5173)
	./scripts/dev.sh

build:              ## compila la UI en frontend/dist
	cd frontend && npm run build

run: build          ## un solo proceso sirve API y UI (http://localhost:8000)
	$(PY) -m server

test:               ## pruebas del núcleo, el servidor y chequeo de tipos de la UI
	$(PY) -m pytest -q
	cd frontend && npm run typecheck

demo:               ## demo narrada en la terminal, sin UI
	$(PY) -m minichain

docker:             ## imagen lista para desplegar (http://localhost:8000)
	docker compose up --build
