# Inflación Hoy Argentina

Micrositio estático en HTML, CSS y JavaScript vanilla para consultar inflación oficial de Argentina, historial IPC, calculadora de actualización de montos y calculadora de cuotas ajustadas por inflación.

## Archivos

- `index.html`: estructura SEO, contenido, placeholders AdSense y secciones principales.
- `styles.css`: diseño responsive, mobile-first y liviano.
- `script.js`: carga de datos, cálculos, render de cards, tabla, gráfico, FAQs y calculadoras.
- `data/ipc.json`: ejemplo de serie local del IPC Nacional INDEC vía Datos Argentina.

## Cómo correrlo localmente

Como el sitio carga `data/ipc.json` con `fetch`, conviene servirlo por HTTP y no abrirlo directo con `file://`.

```bash
cd inflacion-argentina-hoy
python3 -m http.server 8080
```

Después abrí:

```text
http://localhost:8080
```

También puede subirse tal cual a GitHub Pages, Netlify, Cloudflare Pages o cualquier hosting estático.

## Fuente de datos

La fuente principal usada es:

- INDEC / Datos Argentina
- Dataset: `Índice de Precios al Consumidor Nacional (IPC). Base diciembre 2016.`
- Serie: `145.3_INGNACNAL_DICI_M_15`
- API: `https://apis.datos.gob.ar/series/api/series?ids=145.3_INGNACNAL_DICI_M_15&format=json&limit=5000`
- Recurso: `https://datos.gob.ar/dataset/sspm-indice-precios-al-consumidor-nacional-ipc-base-diciembre-2016/archivo/sspm_145.3`

El archivo incluido fue generado con datos oficiales disponibles al 17 de abril de 2026. El último período cargado es marzo de 2026.

## Cómo actualizar `data/ipc.json`

1. Abrí la API oficial de Datos Argentina:

```text
https://apis.datos.gob.ar/series/api/series?ids=145.3_INGNACNAL_DICI_M_15&format=json&limit=5000
```

2. Revisá el campo `meta[0].end_date` para confirmar cuál es el último mes disponible.

3. Agregá los nuevos registros al array `series` con este formato:

```json
{
  "period": "2026-04",
  "date": "2026-04-01",
  "ipcIndex": 11300.1234
}
```

4. Actualizá estos campos en `source`:

```json
{
  "lastFetched": "AAAA-MM-DD",
  "latestAvailablePeriod": "AAAA-MM"
}
```

5. No cargues inflación mensual a mano salvo que la fuente entregue el índice correcto. El sitio calcula variación mensual, acumulada del año e interanual desde `ipcIndex`.

## API en vivo opcional

En `script.js` está esta constante:

```js
const USE_LIVE_API = false;
```

Si la cambiás a `true`, el navegador intentará leer la API oficial en vivo. Para producción es más estable dejarla en `false` y actualizar `data/ipc.json`, porque evitás problemas de CORS, caídas temporales o cambios externos.

## Cómo funcionan los cálculos

- Inflación mensual: compara el IPC de un mes contra el mes anterior.
- Inflación acumulada del año: compara el IPC del mes contra diciembre del año anterior.
- Inflación interanual: compara el IPC del mes contra el mismo mes del año anterior.
- Calculadora de monto actualizado: usa `IPC final / IPC inicial`.
- Cuotas con inflación fija: multiplica cada cuota por una tasa mensual constante.
- Cuotas con inflación histórica: aplica las variaciones mensuales reales del IPC disponible.

## AdSense

El HTML incluye placeholders comentados para insertar anuncios sin romper la experiencia:

- `<!-- AdSense Slot: Top -->`
- `<!-- AdSense Slot: Mid Content -->`
- `<!-- AdSense Slot: FAQ -->`
- `<!-- AdSense Slot: Bottom -->`

No hay código real de AdSense incluido. Cuando el sitio tenga aprobación, pegá el bloque correspondiente dentro de cada `div.ad-slot` o reemplazá el placeholder.

## SEO incluido

- `title` y `meta description` orientados a long-tail.
- H1 único.
- Jerarquía H2/H3.
- Schema `WebPage`.
- Schema `FAQPage`.
- Open Graph y Twitter Cards.
- Copy útil para evitar thin content.
- Secciones de historial, explicación, calculadoras, FAQs y fuentes.

Antes de publicar, cambiá `canonical`, `og:url` y el nombre del sitio si vas a usar un dominio distinto de `inflacionhoy.ar`.

## Ideas para escalar el cluster SEO

- `/inflacion-2026`: resumen anual, tabla mensual y acumulada.
- `/inflacion-por-mes`: índice de páginas por mes con explicación del dato publicado.
- `/ipc-historico`: tabla ampliada y descarga del histórico.
- `/inflacion-acumulada`: explicación, ejemplos y calculadora enfocada en acumulado anual.
- `/inflacion-interanual`: evolución interanual y comparaciones de tendencia.
- `/calculadora-inflacion`: versión dedicada de la calculadora con ejemplos de sueldos, alquileres y ahorros.
- `/calculadora-cuotas-inflacion`: simulador avanzado con distintos escenarios.
- `/inflacion-vs-salarios`: comparación entre IPC y evolución salarial si se agrega fuente oficial.
- `/inflacion-vs-plazo-fijo`: comparación contra tasas publicadas.
- `/inflacion-vs-dolar`: comparación contra dólar oficial o series públicas.
- `/rem-inflacion-esperada`: página separada para expectativas REM del BCRA, aclarando que son estimaciones.
- Páginas por año: `/inflacion-2024`, `/inflacion-2025`, `/inflacion-2026`.
- Páginas por mes: `/inflacion-marzo-2026`, `/inflacion-febrero-2026`, etc.
- Calculadoras derivadas: alquiler ajustado, sueldo actualizado, presupuesto familiar, cuotas escolares, cuota de préstamo.

## Aclaración editorial

Los datos de inflación realizada provienen de fuentes oficiales del INDEC. Las expectativas, si se muestran, son estimaciones del REM del BCRA y no datos observados. El sitio es informativo y no reemplaza fuentes oficiales, asesoramiento financiero, legal, contable ni condiciones contractuales reales.
