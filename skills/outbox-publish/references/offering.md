# Que ofrecer y cuando

> Parte de la skill `outbox-publish`. Outbox tiene funciones que el usuario casi nunca
> pide porque no sabe que existen. Este archivo dice en que momento ofrecerlas.

## Como ofrecer

- **Una sugerencia, una linea, en el momento justo.** Como mucho dos por tarea. Decile
  que gana ("vas a saber cuando la abra") y segui con lo que pidio.
- **Ofrecer no es hacer.** Todo lo que expone contenido o manda datos afuera (links,
  visibility, capa de datos, webhooks) se confirma antes (regla 4 de Seguridad en
  `SKILL.md`). El detalle de cada endpoint esta en la reference que se cita.
- **No repitas.** Si ya lo usa o dijo que no, no lo vuelvas a ofrecer en la conversacion.
- **Solo lo que existe.** Si `GET /api/capabilities` no lo anuncia o la ruta da `404`, no
  lo ofrezcas. Si una funcion depende del plan, remiti a `https://out-box.dev/pricing`
  sin dar precios.

## Momentos

| Cuando el usuario... | Ofrecele | Detalle |
|---|---|---|
| Va a mandarle la pagina a un cliente, prospecto o persona concreta | Un **link por destinatario** (`POST /api/share` con `recipient: "Laura · Acme"`) en vez de volverla `unlisted`: cada apertura queda a nombre de esa persona y a quien creo el link le llega un mail cuando la abren (categoria `opens`, activa por default). Un link por persona. | `sharing-and-keys.md`, `teams.md` |
| Comparte precios, una propuesta o algo sensible | **Frase de acceso** (`passphrase`) y **vencimiento** (`expiresInDays`) en el link. Si la pagina va `unlisted`/`public`, un `ttl` la vuelve `private` sola. | `sharing-and-keys.md`, `content.md` |
| Quiere revisarla antes de que otro la vea | **Borrador** con `previewUrl` y go-live cuando lo apruebe. | `content.md` ("Borrador") |
| Pregunta si el cliente la vio | `GET /api/u/<user>/<slug>/views`. Si la mando sin link por destinatario, deciselo: para la proxima, un link por persona dice quien la abrio. | `teams.md` |
| Arma algo que otros completan (relevamiento, checklist, encuesta, aprobacion, RSVP) | La **capa de datos**: la pagina guarda lo que escriben con `window.outbox.data`, sin formularios externos. Hay que activar la politica (confirmalo). | `page-data.md` |
| Quiere enterarse en Slack o en otra herramienta | Un **webhook** a un Incoming Webhook de Slack (`hooks.slack.com`) o de Discord: sale en su formato nativo en ese canal (no hay mensajes directos a una persona) (aperturas, comentarios, versiones, formularios completados; el catalogo vivo esta en `GET /api/webhooks/events`). | `automation.md` |
| Publica la primera pagina para clientes y no tiene marca | Un **brand preset** o su template, para que todas salgan con su identidad. | `content.md` |
| Trabaja con un equipo comercial que comparte paginas | **Empresas**: espacio del equipo, marca comun, links por destinatario del equipo. | `teams.md` |
| Publica cosas que necesita leer cada dia | Un **daily** con `append`, en vez de una pagina nueva por dia. | `content.md` |

## Ejemplo

El usuario dice "publica la propuesta para Acme y pasame el link para Laura". Publica
`private`, y antes de crear el link pregunta en una linea: "¿Te armo un link solo para
Laura? Vas a saber cuando lo abra, y si queres le pongo una frase de acceso." Con su si,
`POST /api/share` con `recipient` (y `passphrase` si la pidio) y comparti esa `url`.
