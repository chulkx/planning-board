# Deploy — Planning Board

## Requisitos

- Node.js 18+
- npm 9+
- Sistema operativo: Windows, Linux o macOS
- Red local (LAN) con acceso al puerto configurado

## Modo desarrollo

```bash
npm install
npm run dev
```

Frontend en `http://localhost:5173`, API en `http://localhost:3002`. El proxy de Vite redirige `/api/*` al backend automáticamente.

## Modo producción

```bash
npm install
cp .env.example .env   # editar si hace falta
npm run build
npm start
```

La app completa queda en `http://localhost:3002`. Express sirve el frontend compilado desde `dist/`.

### En Windows con start.bat

El repo incluye `start.bat` para lanzar la app de producción sin terminal abierta:

```bat
start.bat
```

Abre una ventana CMD minimizada con `npm start`. Para cerrar, terminar el proceso `node.exe` desde el Administrador de tareas.

### Con PM2 (recomendado para LAN permanente)

```bash
npm install -g pm2
npm run build
pm2 start "npm start" --name planning-board
pm2 save
pm2 startup   # para que arranque con Windows/Linux
```

PM2 reinicia el proceso si falla y guarda logs en `~/.pm2/logs/`.

## Variables de entorno

Crear un archivo `.env` en la raíz del proyecto (o setear como variables de sistema):

| Variable | Default | Descripción |
| --- | --- | --- |
| `PORT` | `3002` | Puerto del servidor Express |
| `NODE_ENV` | `development` | `development` o `production` |
| `DB_PATH` | `data/planning.db` | Ruta al archivo SQLite |
| `HOST` | `0.0.0.0` | Interfaz de red (`0.0.0.0` = acepta desde LAN) |
| `JWT_SECRET` | *(requerido en prod)* | Clave para firmar JWT. Usar valor largo y aleatorio. |
| `CORS_ORIGIN` | `*` | Origen permitido para CORS. En LAN: `http://192.168.x.x:3002` |

**Ejemplo `.env` para producción LAN:**

```env
PORT=3002
NODE_ENV=production
DB_PATH=data/planning.db
HOST=0.0.0.0
JWT_SECRET=cambia_esto_por_una_clave_larga_y_aleatoria_32chars
CORS_ORIGIN=*
```

## Acceso desde la red local

1. Verificar que `HOST=0.0.0.0` en `.env`
2. En Windows: abrir el puerto en el Firewall de Windows Defender
   - Panel de control → Firewall → Reglas de entrada → Nueva regla → Puerto TCP 3002
3. Acceder desde otro equipo en la red: `http://<IP-del-servidor>:3002`
4. Obtener la IP del servidor: `ipconfig` (Windows) o `ip addr` (Linux)

## Estructura de datos

La base de datos SQLite se crea automáticamente en `data/planning.db` al primer arranque. El directorio `data/` se crea si no existe.

Las migraciones corren automáticamente al arrancar. No hay que ejecutar comandos SQL manualmente.

| Versión de migración | Descripción |
| --- | --- |
| v1–v11 | Esquema base (R0–R6) |
| v12 | Tabla `item_links` (bloqueadores / relacionados) |
| v13 | Tablas `labels` e `item_labels` |
| v14 | Tabla `item_comments` |

## Backup y restore

### Backup manual (JSON)

Desde la app: **Configuración → Exportar backup JSON**. Descarga un archivo `.json` con todos los datos.

Desde la terminal:

```bash
curl http://localhost:3002/api/v1/exports/json -o backup-$(date +%Y%m%d).json
```

### Restore

Desde la app: **Configuración → Restaurar desde backup JSON**. Sube el archivo descargado previamente.

El restore limpia todas las tablas y las recarga desde el backup en una sola transacción. Si algo falla, no se toca la DB.

### Backup SQLite directo

Copiar el archivo `data/planning.db` mientras la app no está corriendo:

```bash
# Detener la app primero (Ctrl+C o pm2 stop planning-board)
cp data/planning.db backups/planning-$(date +%Y%m%d).db
```

## Verificar que funciona

```bash
curl http://localhost:3002/api/v1/health
# Respuesta esperada: {"status":"ok"}
```

Logs del servidor aparecen en la consola con formato `[INFO] 2026-04-17T... mensaje`.

## Actualizar a una nueva versión

```bash
git pull
npm install
npm run build
pm2 restart planning-board   # o npm start
```

Las migraciones nuevas se aplican automáticamente al arrancar.

## Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `EADDRINUSE: port 3002` | Puerto ocupado | Cambiar `PORT` en `.env` o cerrar el proceso que usa el puerto |
| `SQLITE_CANTOPEN` | Ruta `DB_PATH` no existe | Crear el directorio: `mkdir -p data` |
| Frontend muestra "Error de red" | CORS bloqueado | Verificar `CORS_ORIGIN` en `.env` |
| No se puede acceder desde otro PC | Firewall o `HOST` incorrecto | Verificar `HOST=0.0.0.0` y regla de firewall |
| JWT inválido al iniciar sesión | `JWT_SECRET` cambiado | Los tokens previos se invalidan; volver a iniciar sesión |
