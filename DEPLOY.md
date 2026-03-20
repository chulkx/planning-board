# Deploy

## Modo desarrollo

```bash
npm install
npm run dev
```

App disponible en http://localhost:5173 (frontend) y http://localhost:3002 (API).

## Modo producción (build compilado)

```bash
npm install
cp .env.example .env   # ajustar valores si es necesario
npm run build
npm start
```

App disponible en http://localhost:3002. El frontend compilado se sirve desde Express.

## Variables de entorno

| Variable | Default | Descripción |
| --- | --- | --- |
| `PORT` | `3002` | Puerto del servidor |
| `NODE_ENV` | `development` | `development` o `production` |
| `DB_PATH` | `data/planning.db` | Ruta al archivo SQLite |

## Verificar que funciona

`GET http://localhost:3002/api/v1/health` debe responder `{ "status": "ok" }`.
