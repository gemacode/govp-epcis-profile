# GOVP–EPCIS 2.0 Profile

Perfil abierto para referenciar acontecimientos **GS1 EPCIS 2.0** desde GOVP sin
copiar un repositorio EPCIS ni inventar semántica ausente.

> Estado `0.1`: candidato técnico. El mapeo, esquema, contexto y vectores están
> probados localmente; falta captura y consulta contra una implementación EPCIS
> independiente para superar la validación nativa.

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
- `vectors/object-event-shipping.jsonld`: vector EPCIS ficticio;
- paquete TypeScript para huella, mapeo, enlace y extracción.

La referencia normativa es [GS1 EPCIS and CBV 2.0](https://ref.gs1.org/standards/epcis/2.0.0/).
El contexto oficial EPCIS se conserva y el contexto GOVP se añade como segundo
contexto JSON-LD.

## Desarrollo

```bash
npm install
npm run check
npm pack
```

## Pendiente para conformidad nativa

1. publicar y recuperar el vector en un repositorio EPCIS 2.0 independiente;
2. verificar JSON-LD y extensiones en captura y consulta;
3. probar Object, Aggregation, Transaction, Transformation y Association Event;
4. documentar límites de autorización del evento original.

Apache-2.0. GS1 y EPCIS son marcas o estándares de GS1; este perfil no está
certificado por GS1.
