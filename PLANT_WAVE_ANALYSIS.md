# saviasound: de los datos del sensor a una representación por ondas

Documento metodológico · 21 de septiembre de 2026

## 1. Objetivo y alcance

El nuevo planteamiento consiste en obtener una representación matemática compacta de las variaciones medidas por el sensor. En lugar de depender exclusivamente de valores individuales, queremos describir tramos recientes de la señal mediante una suma de sinusoides y conservar también la información que esa suma no representa.

Esta representación será la base de una futura estrategia musical. Este documento termina en la obtención de los datos y las ecuaciones: no establece correspondencias con notas, instrumentos, ritmo ni silencios.

La configuración propuesta consta de **dos análisis simultáneos**:

| Parámetro | Análisis corto | Análisis largo |
| --- | --- | --- |
| Historial considerado | Últimos 2–3 segundos | Últimos 8 segundos aproximadamente |
| Finalidad descriptiva | Caracterizar variaciones recientes | Caracterizar la estructura de un tramo más largo |
| Actualización propuesta | Cada 1 o 2 segundos | Cada 1 o 2 segundos |
| Objetivo inicial de ajuste | 80 % de variación explicada | 80 % de variación explicada |
| Máximo de componentes | 8 sinusoides | 8 sinusoides |

Se elegirá una duración concreta para cada análisis y se registrará junto al resultado: «2–3 segundos» no significa variar la duración sin indicarlo. El 80 % es un objetivo, no una condición garantizada.

**Estado:** el laboratorio actual permite analizar una ventana seleccionada. Los dos análisis simultáneos y la cadencia de 1–2 segundos son el diseño propuesto; este documento no implica que ya estén integrados en el motor musical.

## 2. Qué mide el sensor

La planta forma parte del circuito asociado a un temporizador 555 astable. El firmware registra el intervalo entre dos flancos ascendentes consecutivos de su salida: un periodo completo del oscilador.

Cada valor recibido representa un periodo en **microsegundos (µs)**. Se envían arrays de diez valores ordenados.

- Un periodo menor indica que el circuito completa el ciclo más deprisa.
- Un periodo mayor indica que lo completa más despacio.
- El condensador y el resto del circuito influyen en esa duración.

El dato observado es el **periodo del circuito**. No es una medida directa de actividad biológica, estado emocional, salud ni resistencia absoluta de la planta. Relacionarlo cuantitativamente con resistencia exige conocer y calibrar el circuito; comparar plantas o condensadores diferentes requiere tener en cuenta esa configuración.

Hay dos frecuencias distintas que no deben confundirse: la frecuencia eléctrica del 555, aproximadamente el inverso de cada periodo, y las frecuencias que extraemos más adelante de las **variaciones de esos periodos a lo largo del tiempo**.

## 3. Recepción y validación

La aplicación decodifica cada paquete y conserva sus diez periodos, un índice de recepción y el tiempo de llegada.

El laboratorio acepta arrays de diez enteros positivos, con valores de hasta 5.000.000 µs. Un paquete inválido reinicia su historial. También lo reinician una discontinuidad en la secuencia que recibe el laboratorio, un retroceso del tiempo de llegada o una separación superior a seis segundos entre paquetes.

No se rellenan esos huecos inventando medidas. Después de un reinicio hay que reunir otra ventana completa para producir un ajuste.

El índice de secuencia actual se genera en el móvil: **su continuidad no demuestra que se hayan transmitido todos los ciclos ni permite detectar toda pérdida anterior a la recepción**.

## 4. Construcción del eje temporal

Actualmente el laboratorio coloca cada medida al final del intervalo que representa. Antes de cualquier agrupación, acumula los periodos originales:

```text
t_i = t_(i−1) + periodo_i / 1.000.000
```

El tiempo `t_i` está en segundos. Los puntos no están espaciados uniformemente: un ciclo largo hace avanzar más el tiempo que uno corto.

### Limitación temporal importante

Esta reconstrucción representa el tiempo físico transcurrido solo si los periodos son consecutivos y no faltan ciclos entre ellos.

El firmware v2 del repositorio puede omitir ciclos cuando su array de diez medidas está lleno y todavía no ha terminado el envío. Sigue actualizando el instante del último flanco, pero no guarda todos los intervalos de esa espera. Por tanto, sumar los periodos transmitidos puede producir un tiempo menor que el realmente transcurrido.

**En el laboratorio actual, una ventana de ocho segundos significa ocho segundos del eje reconstruido; no necesariamente los últimos ocho segundos de reloj.** Sus frecuencias están referidas a ese eje y no deben interpretarse automáticamente como frecuencias físicas verificadas.

Para una base experimental reproducible conviene conservar los tiempos de recepción y documentar esta limitación. Para resolverla en adquisición habría que disponer de marcas temporales del dispositivo y de información sobre ciclos omitidos. El tiempo de llegada por Bluetooth, por sí solo, tampoco equivale al instante exacto de cada medición. Este documento no modifica la adquisición ni da por resuelta esa limitación.

## 5. Reducción cuando llegan demasiados arrays

El laboratorio limita la representación a **50 arrays de diez posiciones por bloque de un segundo de recepción**. Eso equivale a un máximo de 500 puntos conservados en ese bloque, no a 50 valores ni a un muestreo uniforme de 500 Hz. No es un límite calculado sobre toda ventana móvil posible de un segundo.

Mientras no se supera el límite, los arrays permanecen intactos. Al superarlo:

1. Se seleccionan diez arrays consecutivos.
2. Se calcula una media de cada uno de esos diez arrays.
3. Las diez medias forman un único array nuevo de diez posiciones.
4. Se sustituyen los diez arrays anteriores por ese array, manteniendo el orden.
5. Se repite si aún quedan más de 50 arrays en el bloque.

```text
Antes:   A1[10 valores], A2[10 valores], …, A10[10 valores]
Después: [media(A1), media(A2), …, media(A10)]

100 valores pasan a ser 10 valores.
```

La selección prioriza el grupo consecutivo con menos mediciones originales acumuladas, para evitar comprimir repetidamente la misma zona. Cada punto conserva cuántas mediciones representa. Si vuelve a agruparse, su peso permite calcular una media correcta:

```text
media = suma(valor_j × cantidad_j) / suma(cantidad_j)
```

Cada media recibe el tiempo del último punto de su grupo. El eje temporal ya se ha construido con los periodos originales: no se reconstruye sumando las medias.

**Esta operación sí pierde información:** elimina las variaciones internas y los extremos que no sobreviven a la media. No es una compresión reversible ni un filtro antialias con respuesta controlada. Conserva promedios, orden y cantidades representadas, pero no toda la forma original.

Por eso distinguimos:

- **Datos crudos:** periodos individuales recibidos.
- **Datos de análisis:** puntos conservados después de la posible agrupación.
- **Datos de dibujo:** selección adicional usada exclusivamente para mostrar la gráfica.

El ajuste se realiza sobre los datos de análisis. Para reevaluar posteriormente lo eliminado sería necesario conservar por separado los datos crudos.

## 6. Selección de las dos ventanas

En cada actualización se toma una instantánea del historial y un extremo final común `t_fin`, correspondiente al último punto disponible.

Para una duración `T`, se seleccionan los puntos que cumplen:

```text
t_fin − T < t_i ≤ t_fin
```

Se hace una selección para `T_corta` —2 o 3 segundos— y otra para `T_larga`, aproximadamente 8 segundos. Sus tiempos locales son:

```text
τ_i = t_i − (t_fin − T)
```

Cada ajuste usa así un eje entre 0 y `T`. Las dos ventanas comparten parte de sus datos; no son observaciones independientes ni bandas de frecuencia separadas.

El algoritmo actual requiere historial que cubra la ventana completa y entre 20 y 20.000 puntos dentro de ella. Una ventana insuficiente no se completa con ceros ni se considera un resultado válido. La señal recibida puede mostrarse mientras se reúne ese historial.

## 7. Representación de los periodos como una onda centrada

Dentro de cada ventana se convierten los periodos a milisegundos y se calcula su media:

```text
p_i = valor_i / 1.000
μ = suma(p_i) / N
x_i = μ − p_i
```

Así:

- `x_i > 0`: periodo menor que la media de esa ventana, representado hacia arriba.
- `x_i < 0`: periodo mayor que la media, representado hacia abajo.
- `x_i = 0`: periodo igual a la media.

Cada ventana tiene su propia media. No se aplica el suavizado de la gráfica principal ni se fuerza que esta señal tenga forma sinusoidal. Las sinusoides aparecerán como modelo de aproximación.

Actualmente la media y el error asignan **el mismo peso a cada punto conservado**, aunque unos representen más medidas que otros. No son medias ponderadas por duración ni por cantidad de muestras originales. La ponderación por cantidades se usa durante la agrupación, no durante el ajuste.

Se conserva `μ` por separado: centrar la señal elimina de las sinusoides la información sobre su nivel medio. El periodo se recupera mediante `p_i = μ − x_i`.

## 8. Preselección de frecuencias mediante FFT

El procedimiento tiene dos etapas: una FFT para encontrar frecuencias candidatas y un ajuste posterior sobre los puntos de análisis. No es una reconstrucción completa mediante todos los coeficientes de Fourier.

Para cada ventana:

1. Se construye una cuadrícula temporal uniforme de **2.048 posiciones**, desde 0 hasta `T − T/2048`.
2. Se interpola linealmente la señal centrada en esas posiciones. Antes del primer punto se mantiene su valor.
3. Se calcula la FFT de esa representación temporal uniforme.
4. Se ordenan las frecuencias positivas consideradas por la magnitud al cuadrado de sus coeficientes.
5. Se conservan hasta **32 frecuencias candidatas**.

La interpolación sirve solo para esta preselección. Las amplitudes, fases y errores finales se calculan usando los puntos de análisis y sus tiempos irregulares, no las 2.048 posiciones interpoladas.

Las frecuencias candidatas pertenecen a la cuadrícula:

```text
f_k = k / T
k = 1, 2, …, K
K = mínimo(1023, suelo(250 × T), suelo((N − 1) / 2))
```

Por tanto, la separación entre frecuencias de la búsqueda es:

| Ventana | Separación `1/T` |
| --- | --- |
| 2 s | 0,5 Hz |
| 3 s | Aproximadamente 0,333 Hz |
| 8 s | 0,125 Hz |

Son frecuencias sobre el eje temporal descrito en el paso 4. La ventana larga permite buscar frecuencias más próximas. El código actual no busca entre esas posiciones ni analiza componentes con un periodo mayor que la ventana.

La búsqueda se limita además por el tamaño de la FFT y el número de puntos. Por ejemplo, con suficientes puntos, ocho segundos permiten buscar hasta `1023/8 = 127,875 Hz`. Son límites computacionales, no una certificación del ancho de banda fiable del sensor.

Actualmente no se aplica una ventana de atenuación como Hann antes de la FFT. Los límites del tramo, las tendencias, el muestreo irregular y la agrupación pueden repartir o distorsionar la energía entre frecuencias. Tener 2.048 posiciones interpoladas no crea 2.048 mediciones independientes. Las 32 candidatas pueden dejar fuera componentes útiles.

## 9. Construcción progresiva de la suma de ondas

Se empieza con una estimación nula y un residuo igual a la señal:

```text
estimación_i = 0
residuo_i = x_i
```

Para cada frecuencia candidata todavía no utilizada se ajusta:

```text
s(τ) = a × sen(2πfτ) + b × cos(2πfτ)
```

Los coeficientes `a` y `b` se eligen por mínimos cuadrados: minimizan la suma de los errores cuadrados entre esa onda y el residuo actual, evaluados en los tiempos de los puntos conservados.

Se elige la candidata que más reduce ese error, se añade a la estimación y se resta del residuo. Las ondas seleccionadas anteriormente permanecen fijas. Se repite sobre las candidatas restantes.

La expresión equivalente que se muestra es:

```text
s_j(τ) = A_j × sen(2πf_jτ + φ_j)
A_j = raíz(a_j² + b_j²)
φ_j = atan2(b_j, a_j)

x_estimado(τ) = suma de s_j(τ), para j = 1…M
periodo_estimado(τ) = μ − x_estimado(τ)
```

`A_j` está en milisegundos, `f_j` en ciclos por segundo del eje empleado y `φ_j` en radianes. El desplazamiento constante de la señal centrada se fija en cero.

### Qué significa el orden de las ondas

La primera es la candidata que mejor aproxima por sí sola la señal. La segunda es la que mejor corrige el residuo de la primera, y así sucesivamente. Mejora la **suma acumulada**; no se afirma que cada onda aislada sea más parecida a la señal que la anterior.

Es una selección voraz entre candidatas, con componentes previas congeladas. No se reajustan conjuntamente todas las ondas ni se garantiza la mejor combinación global de ocho componentes. Su orden tampoco garantiza aportaciones estrictamente decrecientes.

### Cuándo se detiene

- Al alcanzar el objetivo de variación explicada, con una pequeña tolerancia numérica.
- Al seleccionar ocho ondas.
- Si no queda una candidata válida con una mejora suficiente.

Una señal casi constante devuelve cero ondas y porcentaje no definido. También puede haber cero componentes si ninguna candidata resulta útil. El resultado es, por tanto, de **0 a 8 ondas**, no obligatoriamente de 1 a 8.

## 10. Medida del error y del porcentaje de aproximación

Para los mismos puntos utilizados en el ajuste:

```text
SSE = suma((x_i − x_estimado_i)²)
SST = suma(x_i²)

R² = 1 − SSE / SST
porcentaje = 100 × R²
RMSE = raíz(SSE / N)
```

Como `x_i` está centrada en su media, `SST` es el error de representar todos los puntos mediante la línea central. El código acota el porcentaje mostrado entre 0 y 100.

- **0 %:** no se mejora respecto a representar la media.
- **80 %:** queda el 20 % del error cuadrático de esa referencia.
- **100 %:** la estimación coincide con todos los puntos evaluados.

Por ejemplo, si `SST = 100 ms²` y `SSE = 20 ms²`, el resultado es un 80 %. No significa que el 80 % de los puntos coincidan ni que el error medio sea del 20 %. El RMSE expresa el error en milisegundos.

Si `SST/N < 10⁻¹² ms²`, el código trata la señal como casi constante y no calcula un porcentaje interpretable.

El porcentaje describe el ajuste **sobre la misma ventana usada para calcular las ondas**. No mide capacidad de predicción, calidad biológica ni proporción de señal frente a ruido. Tampoco evalúa las variaciones crudas eliminadas durante la agrupación. Los porcentajes de dos ventanas tienen referencias distintas y no bastan por sí solos para comparar cuánto varían sus señales.

## 11. Actualización y continuidad entre resultados

La propuesta es repetir ambos análisis cada uno o dos segundos sobre el historial más reciente. Cada resultado debe conservar su duración y su origen temporal. No se añaden trabajos pendientes indefinidamente: si un cálculo tarda más, se prioriza una instantánea reciente en la siguiente actualización.

Recalcular no implica que las componentes anteriores persistan. La onda que ocupa la posición 1 puede tener otra frecuencia, amplitud o fase en el siguiente resultado. Identificar componentes entre actualizaciones exigiría un seguimiento adicional, que el ajuste actual no hace.

La fase está referida al inicio de cada ventana. Incluso una oscilación física que no cambia tendrá otra fase local cuando ese inicio se desplace. Antes de comparar fases hay que expresarlas respecto a un mismo origen temporal.

Actualizar cada segundo tampoco crea información ausente: con ciclos lentos puede haber pocas medidas nuevas o no reunirse los veinte puntos mínimos en la ventana corta.

## 12. Información que debe acompañar al resultado

Para poder interpretar y reproducir el análisis, se propone conservar:

| Grupo | Información |
| --- | --- |
| Procedencia | Identificador de sesión, versión del algoritmo y firmware, configuración conocida del circuito y condensador |
| Tiempo | Duración de ventana, principio y final en el eje reconstruido, tiempo de recepción y antigüedad del resultado |
| Entrada | Puntos de análisis con sus tiempos y cantidades representadas; disponibilidad de datos crudos por separado |
| Reducción | Arrays y valores recibidos/conservados; incidencias o reinicios |
| Nivel y variación | Media del periodo `μ` y variación de la señal centrada |
| Componentes | Frecuencia, amplitud, fase, orden y mejora en puntos porcentuales de cada onda |
| Ajuste | Suma estimada, residuo, RMSE, porcentaje alcanzado y objetivo solicitado |
| Límites | Número de componentes, rango de búsqueda y motivo de parada |
| Cómputo | Tiempo de cálculo y duración total de la actualización |

Esta es una propuesta de registro reproducible. El laboratorio ya obtiene parte de estos datos, pero no guarda automáticamente todo este conjunto como un archivo experimental.

## 13. Separación entre cálculo y dibujo

La gráfica principal del laboratorio dibuja como máximo 192 puntos por curva, conservando extremos de intervalos temporales. La gráfica individual de una componente usa hasta 96.

Esta reducción visual no modifica los coeficientes ni el error calculado. El ajuste utiliza todos los puntos de análisis admitidos, aunque la pantalla muestre menos vértices. Una gráfica ligera no implica un ajuste hecho con solo 192 medidas.

El coste se acota con una FFT de tamaño fijo, hasta 32 candidatas y ocho selecciones. Se reutilizan senos y cosenos y se reparte el trabajo en bloques que ceden el hilo de JavaScript. Esto reduce trabajo repetido; no garantiza una cadencia idéntica en todos los dispositivos.

## 14. Qué representa finalmente este método

El resultado de cada ventana es una descripción aproximada de la señal medida: **media + componentes sinusoidales + residuo + métricas de ajuste y procedencia**.

Las componentes son herramientas matemáticas para describir regularidades del registro. No identifican por sí mismas procesos biológicos independientes. Un residuo grande puede contener cambios reales, ruido, transitorios o limitaciones de la búsqueda; un ajuste alto tampoco demuestra que el registro esté libre de artefactos.

Este documento proporciona una base matemática y una descripción verificable de la implementación. La validez física de los tiempos, la calibración del circuito y la caracterización del ruido requieren validación experimental adicional. El objetivo es que cualquier trabajo posterior parta de lo que los datos realmente representan y de las transformaciones que han sufrido.

## Referencias de implementación y consulta

- [Captura del sensor, firmware v2](hardware/arduino/v2/v2.ino).
- [Decodificación de paquetes](src/lib/plant-packet.ts) y [recepción Bluetooth](src/lib/plant-connection.ts).
- [Agrupación y eje temporal del laboratorio](src/experiments/wave-lab/raw-buffer.ts).
- [FFT, selección de componentes y métricas](src/experiments/wave-lab/analysis.ts).
- [Pantalla del laboratorio](src/experiments/wave-lab/screen.tsx) y [reducción visual](src/experiments/wave-lab/plot-path.ts).
- [SciPy: ShortTimeFFT](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ShortTimeFFT.html), referencia general sobre análisis de Fourier por ventanas. El laboratorio utiliza una implementación propia en TypeScript, no SciPy.

Las cifras y decisiones marcadas como actuales describen el código consultado en la fecha del documento. Las dos ventanas simultáneas y el registro experimental completo son propuestas, no funcionalidades implementadas por la creación de este manual.
