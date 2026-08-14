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
- Roles por usuario.
- Logs de interacciones.
- Detección de intención/herramienta: inventario, cotizaciones, agenda, CRM, PDF, Excel.
- División automática de respuestas largas.
- Indicador de escribiendo, si el endpoint de Evolution está disponible.
- Endpoint para configurar webhook automáticamente.

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

## Producción

Recomendado:

- Evolution API + PostgreSQL + Redis en VPS o Railway.
- Este Bridge como servicio separado.
- Doomy Oficina como API principal.

No uses tu número personal. Usa un número dedicado para Doomy.

## Siguiente mejora recomendada

Agregar persistencia real para memoria y logs usando PostgreSQL o Redis, para que no se pierda contexto si Railway reinicia el servicio.
