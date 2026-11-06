# Tueste — dashboard de análisis financiero

Aplicación estática para analizar márgenes, adquisición, escenarios de marketing y caja proyectada de Tueste. Está construida con HTML, CSS y JavaScript; no necesita servidor, base de datos, Node.js ni instalación de dependencias. Chart.js se carga desde CDN, por lo que los gráficos requieren conexión a internet.

## Ejecutar en Visual Studio Code

1. Abre en VS Code la carpeta del proyecto.
2. Abre `tueste-dashboard\index.html`.
3. Para ejecutarlo, abre ese archivo en un navegador: desde el Explorador de archivos puedes hacer doble clic en `index.html`; también puedes usar la extensión Live Server de VS Code y seleccionar **Open with Live Server**. La extensión es opcional.
4. Mantén conexión a internet para descargar Chart.js desde CDN. Los indicadores y el simulador funcionan sin el CDN, pero los gráficos no estarán disponibles.

No hay un proceso de compilación o comandos de instalación.

## Funcionalidades

- Tarjetas de indicadores financieros que se recalculan al editar los supuestos.
- Gráficos de recuperación del CAC, relación LTV:CAC, adquisición y ROAS.
- Comparación independiente de la situación actual, propuesta de agencia y alternativa con pack.
- Prototipo interactivo del programa de referidos: experiencia de quien invita y su amigo, recompensas, progreso, aviso de compra y panel de medición simulado.
- Ficha de growth con el embudo actual, el costo máximo permitido, el experimento A/B y un plan de 90 días.
- Simulador de 24 meses para cuatro planes, con caja, cohortes, retención, piso mínimo, tabla mensual y exportación CSV.
- Guardado local de supuestos mediante `localStorage` y botón para restaurar los datos originales.
- Diseño adaptable a pantallas móviles y de escritorio.

## Validación de los datos iniciales

Con los valores originales deben aparecer aproximadamente:

| Indicador | Resultado |
|---|---:|
| Margen de contribución normal | $15.89 |
| Margen de contribución suscripción | $12.643 |
| ROAS break-even normal | 2.14 |
| CAC de anuncios | $48.48 |
| CAC real (incluye fee) | $54.55 |
| ROAS primer pedido | 0.70 |
| LTV cliente suelto | $47.67 |
| LTV suscriptor | $95.18 |
| LTV promedio | $54.80 |
| LTV:CAC | 1.00:1 |
| Payback | 12 meses |

Verificación del mes 1 del plan de inversión fija de $8,000:

- 165 clientes de Meta + 47 sin Meta = 212 clientes nuevos.
- Cada cliente aporta en el primer mes `85% × $15.89 + 15% × $12.643` = $15.40295 de contribución esperada.
- Contribución de las cohortes nuevas: `212 × $15.40295` = **$3,265.43**.
- Contribución de clientes actuales: **$9,000**.
- Salidas: `$8,000 + $1,000 de fee + $6,500 de costos fijos` = **$15,500**.
- Caja final: `$35,000 + $3,265.43 + $9,000 − $15,500` = **$31,765.43**.

## Probar el dashboard

1. **Indicadores y gráficos:** cambia un precio, costo o porcentaje en “Supuestos editables”. Comprueba que las tarjetas, los escenarios y los gráficos se actualicen. El CAC marginal corresponde al tramo de adquisición que contiene la inversión actual.
2. **Escenarios:** compara sus inversiones, CAC real, ROAS y LTV:CAC. Los supuestos no se mezclan entre escenarios. El descuento de B afecta el primer pedido de clientes sueltos; la adopción del pack C comienza en 0% y se puede modificar.
3. **Referidos:** abre “Programa de referidos”. Simula la entrega y prueba del café antes de activar la invitación, abre el recorrido como amigo, prueba una compra y revisa el aviso, el progreso y el panel. Los pedidos y métricas de esta página son demostrativos; no cobra ni registra clientes.
4. **Ficha de growth:** contrasta el embudo actual con la meta hipotética, verifica el CAC real de Meta ($50) y el límite de recompensas ($25), y revisa el experimento y las decisiones de los días 30, 60 y 90.
5. **Simulador:** pulsa “Ejecutar simulación”. Comprueba el mes 1 del plan fijo de $8,000 con la verificación anterior, las tarjetas de resumen, el gráfico, las alertas y los 96 renglones (24 meses por cuatro planes).
6. **Reglas de caja:** revisa las alertas de caja bajo el piso editable y confirma que desde el mes 13 la inversión de cada plan sea al menos el promedio de sus meses 1–12. Un plan que incumple se marca como tal; el dashboard no declara un ganador.
7. **CSV:** ejecuta la simulación y pulsa “Exportar CSV”. El archivo incluye resúmenes y datos mensuales de los cuatro planes.
8. **Persistencia:** cambia un supuesto y recarga la página para comprobar que se conserva. Pulsa “Restaurar datos originales” para recuperar los valores de inicio y volver a ejecutar la simulación.

## Fórmulas y supuestos del modelo

- **Margen normal:** precio normal − café − envío − comisión de pago − empaque.
- **Margen suscripción:** precio de suscripción − café − envío − comisión − empaque.
- **Margen pack:** precio del pack − (3 × costo de café por bolsa) − (precio × comisión) − caja del pack.
- **ROAS break-even:** precio normal / margen normal.
- **CAC anuncios:** inversión / clientes nuevos de Meta.
- **CAC real:** (inversión + fee de agencia) / clientes nuevos de Meta.
- **ROAS real del primer pedido:** clientes Meta × precio normal / inversión en Meta.
- **LTV suelto:** margen normal × pedidos sueltos en 12 meses.
- **LTV suscripción:** margen de suscripción × suma de la retención mensual elevada a las potencias 0–11.
- **LTV promedio:** LTV suelto y LTV suscripción ponderados por sus participaciones.
- **CAC marginal:** cambio de inversión / cambio de clientes nuevos entre puntos contiguos del historial.
- **Caja:** caja anterior + contribución de clientes actuales + contribución de cohortes − inversión − fee − costos fijos.

El historial Meta se interpola linealmente entre los seis puntos del caso y se limita a inversiones de $0–$20,000. Los 47 clientes mensuales sin Meta se agregan como una cohorte aparte. El fee se cobra solo en meses con inversión.

El caso especifica el perfil de pedidos sueltos por mes de vida: 1.00, 0.15, 0.20, 0.20, 0.20, 0.20, 0.20, 0.15, 0.15, 0.15, 0.20 y 0.20 en los meses 1–12 (3 pedidos en total). El simulador conserva ese perfil; si se editan el total anual o los pedidos del mes 1, redistribuye proporcionalmente los meses 2–12. Desde el mes 13 se modelan 0.10 pedidos sueltos mensuales. Las suscripciones comienzan en el mes de adquisición y retienen el porcentaje configurado cada mes.

La adopción del pack es un supuesto adicional, no un dato del caso: comienza en 0% para no atribuir adopción ficticia. En el escenario C, cada pack adoptado reemplaza el primer pedido suelto y los pedidos posteriores conservan la frecuencia configurada. La gestión interna de C no lleva fee. El simulador usa los márgenes normales de los productos; el pack se evalúa en el escenario C.

El programa de referidos es un prototipo local: usa el embudo del caso como línea base y muestra por separado las compras simuladas durante la demostración. La meta de 8 compras referidas por cada 100 clientes habilitados, las tasas del embudo rediseñado y el escenario de CAC combinado son hipótesis para un experimento, no resultados garantizados. No se envían mensajes, no se procesa pago y no se canjean recompensas reales.

El plan conservador invierte el monto editable durante los primeros 12 meses y, posteriormente, al menos el promedio del primer año. El plan optimizado es una heurística: en cada mes busca la mayor inversión de hasta $20,000 que no deje la caja de ese mes por debajo del piso, con el mínimo de inversión requerido desde el mes 13. No proyecta anticipadamente los meses futuros; por ello puede generar alertas posteriores. Ninguno de los planes se declara ganador automáticamente.

No se modelan impuestos, devoluciones, costos fijos variables por pedido, crecimiento orgánico distinto de los clientes indicados, ni valor temporal del dinero. La contribución no se confunde con ventas brutas.
