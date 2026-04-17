# Manual de Usuario — Planning Board

## Qué es Planning Board

Planning Board es una aplicación web para gestión de backlog estilo Scrum, orientada a equipos pequeños que trabajan en múltiples productos. Corre completamente local o en la red interna (LAN); no requiere internet ni cuentas en la nube.

---

## Acceso y login

Al abrir la app se muestra la pantalla de login. Ingresá con tu usuario y contraseña. Los usuarios son creados por el administrador desde **Configuración → Usuarios**.

Una vez dentro, la barra superior muestra tu nombre de usuario y las secciones de la app:

- **Backlog** — lista de todos los ítems
- **Board** — tablero Kanban por producto
- **Sprints** — planning, métricas y cierre de sprints
- **Milestones** — hitos de entrega
- **Analítica** — gráficos y métricas
- **Importar** — carga de ítems desde CSV
- **Configuración** — ajustes del sistema

---

## Backlog

Vista principal de todos los ítems del backlog.

### Filtros

En la parte superior podés filtrar por:

- **Texto**: busca en título y descripción
- **Producto**: muestra solo ítems de ese producto
- **Estado**: `No iniciado`, `En progreso`, `Bloqueado`, `Review`, `Hecho`, `Cancelado`
- **Prioridad**: `Crítica`, `Alta`, `Media`, `Baja`
- **Tipo**: `Epic`, `Historia`, `Bug`, `Feature`, `Tarea`
- **Sprint**: filtra por sprint asignado
- **Milestone**: filtra por milestone
- **Etiqueta**: filtra por label asignado al ítem
- **Asignado a**: filtra por desarrollador

### Vista tabla / árbol

El toggle **Tabla / Árbol** en la esquina superior derecha cambia entre:

- **Tabla**: todos los ítems en lista plana, ordenable por columnas
- **Árbol**: ítems agrupados por jerarquía (épico → historia → tarea/bug) con contadores de progreso

### Reordenar

En vista tabla podés arrastrar las filas para cambiar el orden del backlog.

### Vistas guardadas

1. Aplicá los filtros que querés guardar
2. Hacé click en **Guardar vista** y poné un nombre
3. La vista aparece como un chip debajo de los filtros
4. Click en el chip restaura todos los filtros guardados

### Editar un ítem

Hacé click en cualquier fila para abrir el panel lateral de edición. El panel tiene 4 pestañas:

#### Pestaña Detalles

Campos editables: título, descripción, estado, prioridad, tipo, producto, sprint, milestone, story points, esfuerzo real en horas, fecha de vencimiento, asignados, notas.

Las **notas** tienen toggle Editar / Vista previa con soporte Markdown.

#### Pestaña Relaciones

Permite vincular el ítem con otros:

- **Bloquea a**: este ítem bloquea a los ítems listados
- **Bloqueado por**: este ítem está bloqueado por los ítems listados
- **Relacionado con**: referencia cruzada sin relación de bloqueo

Para agregar un vínculo: escribí en el buscador (mínimo 2 caracteres), seleccioná el ítem y el tipo de relación, y hacé click en el botón +. Para quitar un vínculo, hacé click en × junto a la relación.

#### Pestaña Comentarios

Lista cronológica de comentarios del ítem. Para agregar uno:

1. Elegí tu usuario en el selector **"Como"**
2. Escribí el texto (soporta Markdown)
3. Click en **Agregar comentario**

Los comentarios propios se pueden editar (click en el ícono de lápiz) o eliminar (click en ×).

#### Pestaña Actividad

Timeline de todos los cambios del ítem: quién cambió qué, de qué valor a qué valor, y cuándo. Incluye cambios manuales, por importación y automáticos del sistema.

### Etiquetas en el ítem

Debajo del campo de prioridad en la pestaña Detalles hay un selector de etiquetas. Hacé click en el chip de una etiqueta para asignarla o quitarla. Las etiquetas disponibles se crean en **Configuración → Etiquetas**.

---

## Board (Kanban)

Vista de tarjetas por columna de estado. Las columnas corresponden a los estados del backlog.

### Filtrar por producto

El selector de producto en la parte superior muestra solo los ítems de ese producto. Si no seleccionás producto, aparecen todos.

### Mover tarjetas

Arrastrá cualquier tarjeta a otra columna. Si la columna tiene un **límite WIP** configurado y ya está en el límite, el header de la columna se muestra en rojo como advertencia (el movimiento igual se permite).

### Información en las tarjetas

- Color del punto: producto al que pertenece
- Prioridad (badge de color)
- Tipo (ícono)
- Story points
- Asignados
- Etiquetas
- Si tiene bloqueadores activos: badge rojo "Bloqueado"
- Si es un épico: barra de progreso de historias hijas

---

## Sprints

Pantalla de planning y seguimiento de sprints.

### Crear un sprint

Click en **Nuevo sprint** → completar nombre, fechas de inicio y fin, y productos que incluye.

### Agregar ítems al sprint

Desde el panel derecho de ítems sin sprint, arrastrá o usá el botón → para mover ítems al sprint activo.

### Capacidad por developer

La sección **Capacidad** muestra para cada developer sus horas comprometidas vs capacidad:

- Verde: carga ≤ 80%
- Amarillo: 80–100%
- Rojo: > 100%

Los valores son editables inline. Los cambios se guardan automáticamente.

### Burndown

Gráfico de story points restantes vs línea ideal. Se actualiza diariamente con el snapshot del estado del sprint.

### Velocity

Gráfico de story points completados por sprint cerrado (por producto o global).

### Cumulative Flow Diagram (CFD)

Distribución de ítems por estado a lo largo del tiempo. Útil para detectar cuellos de botella.

### Cerrar un sprint

1. Click en **Cerrar sprint**
2. Se muestra un preview: ítems incompletos y a dónde van a parar (próximo sprint del mismo producto, o backlog si no hay)
3. Confirmá para cerrar

### Retrospectiva

La sección **Retrospectiva** (colapsable) tiene tres campos: ¿Qué salió bien?, ¿Qué mejorar?, Action items con checkboxes. Se guarda automáticamente.

---

## Milestones

Pantalla de hitos de entrega.

### Crear un milestone

Click en **+ Nuevo** → nombre y fecha meta opcional → **Crear milestone**.

### Asignar ítems a un milestone

Los ítems sin milestone aparecen en el panel izquierdo inferior (**Sin milestone**). Seleccioná un milestone en la lista y hacé click en → junto a un ítem para asignarlo.

Para quitar un ítem de un milestone, hacé click en × junto al ítem en el panel derecho.

### Dashboard del milestone

Hacé click en ↗ junto a cualquier milestone para abrir su dashboard detallado:

- **Barra de progreso**: porcentaje de ítems completados
- **Contadores**: total / abiertos / cerrados / vencidos / cancelados
- **Burndown**: gráfico de ítems abiertos a lo largo del tiempo (derivado del historial de cambios)
- **Ítems por estado**: lista completa agrupada con fechas de vencimiento

---

## Analítica

Pantalla de métricas con 4 pestañas.

### Overview

Métricas globales: ítems por estado, por prioridad, por tipo, distribución por producto.

### Sprints

Velocity por sprint, comparativa de SP comprometidos vs completados, trends.

### Productos

Distribución y evolución de ítems por producto. CFD configurable por producto y rango de fechas.

### Devs

Métricas de rendimiento por developer:

- **Carga actual**: SP asignados en el sprint activo vs capacidad, con porcentaje de utilización
- **Throughput**: ítems completados por sprint (últimos 6 sprints), en barra por sprint
- **Cycle time promedio**: tiempo promedio desde `in-progress` a `done` en horas
- **Actividad**: heatmap de ítems cerrados por semana (últimas 12 semanas)

---

## Importar (CSV)

Carga masiva de ítems desde un archivo CSV exportado de Microsoft Lists u otra fuente.

### Pasos

1. **Subir archivo**: arrastrá el CSV o hacé click para seleccionarlo
2. **Mapeo de columnas**: la app detecta automáticamente las columnas. Ajustá si hace falta
3. **Preview**: revisá los ítems que se van a crear o actualizar
4. **Confirmar**: click en **Importar** para aplicar los cambios

### Comportamiento de reimportación

- Si un ítem ya existe (mismo `ID externo`): se actualiza solo si los datos cambiaron
- Los campos editados manualmente desde la app **no se sobreescriben** aunque el CSV traiga valores distintos
- Los ítems del CSV que no existen se crean nuevos

---

## Configuración

### General

Nombre del equipo y ajustes globales.

### Productos

Lista de productos. Para cada producto podés configurar las **columnas del Kanban** y sus **límites WIP**.

### Developers

Lista de desarrolladores con su capacidad por sprint por defecto (en horas o SP).

### Etiquetas

Gestión de etiquetas para ítems:

- **Crear etiqueta**: nombre + color (paleta de 11 colores) → click en **Crear**
- **Eliminar**: click en × junto a la etiqueta

Las etiquetas creadas aquí aparecen en el selector de etiquetas del `ItemEditPanel`.

### Usuarios

Lista de usuarios con acceso a la app. Nombre, email, rol.

### Backup y restore

- **Exportar backup JSON**: descarga un snapshot completo de todos los datos
- **Restaurar desde backup JSON**: sube un backup previo para restaurar el estado (borra los datos actuales y los reemplaza)

---

## Preguntas frecuentes

**¿Puedo usar la app desde otro equipo de la red?**
Sí. El administrador del servidor configura `HOST=0.0.0.0` en el `.env` y abre el puerto en el firewall. Accedé desde `http://<IP-del-servidor>:3002`.

**¿Se pierden los cambios manuales al reimportar el CSV?**
No. Los campos editados desde la UI quedan protegidos con `manualOverrides` y no son sobreescritos por la importación.

**¿Puedo asignar un ítem a más de un desarrollador?**
Sí. El selector de asignados en el panel de edición permite múltiples selecciones.

**¿Qué pasa con los ítems incompletos al cerrar un sprint?**
El sistema los mueve automáticamente al próximo sprint del mismo producto (si existe) o al backlog.

**¿Cómo agrego etiquetas a un ítem?**
Primero creá las etiquetas en **Configuración → Etiquetas**. Luego abrí el ítem y seleccioná las etiquetas en la pestaña Detalles.
