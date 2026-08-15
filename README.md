# Doomy WhatsApp Evolution Bridge

Puente para conectar grupos de WhatsApp con **Doomy Oficina** usando **Evolution API**.

Esta versión ya no usa Baileys directamente. Evolution API administra la sesión, QR, reconexión y WhatsApp; este proyecto solo recibe webhooks, procesa mensajes y responde usando la API de Evolution.

## Arquitectura

```txt
WhatsApp Grupo
   ↓
Evolution API
   ↓ Webhook
Doomy WhatsApp Evolution Bridge
   ↓
Doomy Oficina API
```

## Funciones incluidas

- Webhook para Evolution API.
- Activación por `@Doomy`, `Doomy`, `oye Doomy` o `/doom`.
- Solo responde en grupos.
- Ignora mensajes propios.
- Filtro por grupos autorizados.
- Rate limit por usuario.
- Memoria temporal por grupo.
- Memoria ambiental de conversaciones recientes sin responder automáticamente.
- Reacciones naturales con 👍, ✅ y 👀 cuando no hace falta enviar texto.
- Roles por usuario.
- Logs de interacciones.
- Detección de intención/herramienta: inventario, cotizaciones, agenda, CRM, PDF, Excel.
- División automática de respuestas largas.
- Indicador de escribiendo, si el endpoint de Evolution está disponible.
- Endpoint para configurar webhook automáticamente.
- Interpretación de imágenes mediante Claude Vision y lectura local de PDF para buscar folios.

## Instalación local

```bash
npm install
cp .env.example .env
npm run dev
```

## Variables principales

```env
PORT=3000
PUBLIC_BASE_URL=https://doomy-whatsapp-bridge.up.railway.app

EVOLUTION_API_URL=https://tu-evolution-api.com
EVOLUTION_API_KEY=tu_api_key
EVOLUTION_INSTANCE=doomy-oficina

DOOMY_API_URL=https://tu-doomy-oficina.com/api/doomy/chat
DOOMY_API_KEY=tu_key_de_doomy

WEBHOOK_SECRET=coloca_un_secreto_largo
BOT_NAME=Doomy
ALLOWED_GROUP_IDS=
ADMIN_USER_IDS=

AMBIENT_MEMORY_ENABLED=true
MEMORY_MAX_MESSAGES=30
MEMORY_TTL_MINUTES=180
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
MEDIA_MAX_BYTES=10485760
PDF_MAX_CHARACTERS=60000
```

## Flujo de uso

1. Instala Evolution API en Railway o VPS.
2. Crea una instancia, por ejemplo `doomy-oficina`.
3. Escanea el QR desde el WhatsApp que será Doomy.
4. Despliega este Bridge.
5. Configura el webhook de Evolution hacia:

```txt
https://TU-BRIDGE/webhook/evolution?secret=TU_WEBHOOK_SECRET
```

6. Agrega el número de Doomy a un grupo.
7. Escribe:

```txt
@Doomy ping
```

Debe responder:

```txt
Doomy activo. Monarca tecnológico en línea.
```

## Configurar webhook automáticamente

Con el Bridge desplegado:

```bash
curl -X POST "https://TU-BRIDGE/admin/setup-webhook?secret=TU_WEBHOOK_SECRET"
```

El endpoint configurará Evolution API para enviar eventos a `/webhook/evolution`.

## Contrato con Doomy Oficina

Este Bridge manda a Doomy Oficina:

```json
{
  "message": "resume lo que se habló",
  "groupId": "120363...@g.us",
  "senderId": "52133...@s.whatsapp.net",
  "senderName": "Edgar",
  "role": "admin",
  "toolHint": "cotizaciones",
  "history": [],
  "raw": {}
}
```

Doomy Oficina debe responder cualquiera de estas formas:

```json
{ "reply": "Respuesta de Doomy" }
```

```json
{ "message": "Respuesta de Doomy" }
```

```json
{ "text": "Respuesta de Doomy" }
```

## Roles

Puedes crear:

```txt
data/roles.json
```

Ejemplo:

```json
{
  "5213312345678@s.whatsapp.net": "admin",
  "5213399999999@s.whatsapp.net": "ventas"
}
```

Roles sugeridos:

- `admin`
- `supervisor`
- `ventas`
- `invitado`

## Chat privado del propietario

Para permitir mensajes privados únicamente al propietario, configura `OWNER_USER_IDS`
con uno o más identificadores separados por coma. El propietario se trata como `admin`,
sus mensajes privados no requieren escribir “Doomy” y conservan acceso completo a las
funciones que exponga Doomy Oficina, incluido Home Assistant.

```env
OWNER_USER_IDS=5213312345678@s.whatsapp.net,523312345678@s.whatsapp.net
```

Los demás chats privados se ignoran.

### Asistente personal

En el chat privado del propietario y en los grupos permitidos, Doomy puede guardar recordatorios, citas, compras y mandados. En los grupos, la agenda es compartida y el aviso se publica en el mismo grupo:

```txt
Recuérdame mañana a las 9 llamar a Juan
Recuérdame en 5 minutos revisar el horno
Agenda dentista el viernes a las 5 pm
Agrega leche y café a la lista de compras
¿Qué hay en la lista de compras?
Agrega recoger el paquete a mandados
¿Qué pendientes tengo?
```

Las citas generan avisos 24 horas antes, una hora antes y al momento. Los recordatorios
se envían de forma proactiva al chat privado. Para conservar los datos entre despliegues,
monta un volumen de Railway en `/app/data`. Opcionalmente puedes cambiar la ruta con
`PERSONAL_DATA_PATH`; el programador se ejecuta cada 30 segundos y puede ajustarse con
`PERSONAL_SCHEDULER_INTERVAL_SECONDS`.

## Producción

Recomendado:

- Evolution API + PostgreSQL + Redis en VPS o Railway.
- Este Bridge como servicio separado.
- Doomy Oficina como API principal.

No uses tu número personal. Usa un número dedicado para Doomy.

## Siguiente mejora recomendada

Agregar persistencia real para memoria y logs usando PostgreSQL o Redis, para que no se pierda contexto si Railway reinicia el servicio.
