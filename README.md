# GOVP–EPCIS 2.0 Profile

Perfil abierto para referenciar acontecimientos **GS1 EPCIS 2.0** desde GOVP sin
copiar un repositorio EPCIS ni inventar semántica ausente.

> Estado `0.1.2`: perfil interoperable con los cinco tipos de acontecimiento
> probados contra el esquema normativo GS1 EPCIS 2.0.0 y con una prueba de
> captura y consulta preparada para un repositorio OpenEPCIS independiente.

## Principio de interoperabilidad

GOVP conserva:

- `eventID`, tipo y `eventTime`;
- `action`, `bizStep`, `disposition`, `readPoint` y `bizLocation` solo cuando el
  evento los contiene;
- URL HTTPS del evento original;
- SHA-256 de una representación estable del evento;
- código y URL pública del GOVP asociado.

No copia listas EPC, cantidades, business transactions ni extensiones al
payload GOVP. Esos datos permanecen en el repositorio EPCIS original y quedan
protegidos por la huella.

La representación estable excluye `@context` y `recordTime`: el primero es una
instrucción de serialización JSON-LD y el segundo puede ser asignado por el
repositorio durante la captura. El resto del contenido empresarial sí forma
parte de la huella.

## Mapeo GOVP

| EPCIS | GOVP |
| --- | --- |
| `eventID` | `source.externalId` |
| evento completo normalizado | `evidence[].sha256` |
| URL de consulta del evento | `evidence[].url` |
| `bizStep` presente | texto de `requirement` |
| `TransactionEvent` | subject `order` |
| `AggregationEvent` / `AssociationEvent` | subject `shipment` |
| EPC class | subject `lot` |
| EPC instance | subject `product` |

Cuando no existe `bizStep`, el perfil genera una formulación neutral; nunca
infiere “shipping”, “receiving” u otra semántica.

## Artefactos

- `context/govp-epcis-context.jsonld`: términos GOVP añadibles al contexto EPCIS;
- `schemas/govp-epcis-reference.schema.json`: JSON Schema 2020-12;
- `vectors/*.jsonld`: vectores ficticios Object, Aggregation, Transaction,
  Transformation y Association Event;
- paquete TypeScript para huella, mapeo, enlace y extracción.

La referencia normativa es [GS1 EPCIS and CBV 2.0](https://ref.gs1.org/standards/epcis/2.0.0/).
El contexto oficial EPCIS se conserva y el contexto GOVP se añade como segundo
contexto JSON-LD. Las propiedades enlazadas se serializan con el prefijo
`govp:*`, que el contexto expande al namespace
`https://govp.io/ns/epcis#`. El lector conserva compatibilidad con la primera
serialización basada en IRI absolutas. Se incluye además la declaración de
prefijo inline para repositorios que, por seguridad, no descargan contextos
remotos durante la captura.

La validación descarga el esquema inmutable `epcis-json-schema.json` de GS1
2.0.0 y exige su SHA-256 conocida antes de usarlo. Esto comprueba la forma
normativa de cada vector, pero no sustituye una captura y consulta reales.

## Desarrollo

```bash
npm install
npm run check
npm pack
```

El contexto JSON-LD se publica de forma estable en
`https://downloads.govp.io/contexts/epcis/0.1/govp-epcis-context.jsonld`.

## Aceptación nativa OpenEPCIS

Con un repositorio OpenEPCIS 2.0 disponible, registra el namespace GOVP y
ejecuta:

```bash
OPEN_EPCIS_URL=http://localhost:8080 npm run validate:openepcis
```

El runner captura un documento con los cinco tipos de evento enlazados, espera
la finalización asíncrona, recupera cada `eventID` mediante la API EPCIS y
comprueba que la extensión, la URL original y la huella GOVP sobreviven sin
alteraciones.

También se incluye una aceptación portable para repositorios EPCIS 2.0 con
Basic Auth. Usa credenciales sintéticas exclusivas de cada ejecución:

```bash
EPCIS_REPOSITORY_URL=https://fastnt-dev.azurewebsites.net \
EPCIS_BASIC_AUTH=usuario_sintetico:contraseña_sintetica \
npm run validate:repository
```

Además de captura y consulta, esta prueba exige que otras credenciales no puedan
recuperar el evento.

## Límite de autorización

El perfil transporta una URL HTTPS del evento original, pero no transporta sus
credenciales. El repositorio EPCIS debe aplicar su propio OAuth, mTLS o control
de acceso; quien comprueba un GOVP solo puede resolver esa URL si también está
autorizado por el propietario EPCIS.

Apache-2.0. GS1 y EPCIS son marcas o estándares de GS1; este perfil no está
certificado por GS1.
