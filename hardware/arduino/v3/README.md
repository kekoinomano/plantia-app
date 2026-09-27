# Plantia ESP32 v2

Este programa hace una sola cosa: mientras el móvil está conectado, mide el tiempo entre subidas del pin del sensor. Guarda 10 intervalos y los envía juntos por Bluetooth. Después vuelve a llenar el array desde la posición 0.

Todo el programa está en [v2.ino](v2.ino). La v1 queda guardada en `../v1`, pero esta versión no usa ninguno de sus archivos. No hay MIDI, botones, ajustes remotos ni recepción de comandos.

## Cómo cargarlo

1. Abre `v2.ino` en Arduino IDE.
2. Selecciona tu placa ESP32 con BLE y el puerto USB correspondiente.
3. Compila y sube el programa. Solo necesitas las librerías del paquete **esp32 de Espressif**; la compilación de referencia usa la versión **3.3.11**.
4. Abre la app actualizada y busca dispositivos.

**Los UUID han cambiado. Debes actualizar tanto el ESP32 como la app.** La app nueva no mostrará una placa que todavía anuncie los UUID antiguos, aunque se llame Plantia.

## Los dos UUID: para qué sirve cada uno

Un UUID es un identificador. Aquí usamos uno para encontrar nuestro servicio Bluetooth y otro para el canal por el que enviamos las muestras.

| Uso | Constante del ESP32 | Constante de la app | UUID |
| --- | --- | --- | --- |
| Encontrar el servicio | `SERVICE_UUID` | `PLANT_SERVICE` | `df7167d3-4595-4d3e-b28d-f20ae4c87cdc` |
| Recibir los datos | `DATA_UUID` | `PLANT_CHARACTERISTIC` | `05cdaa8c-62b1-459e-a07f-1e4167b443c5` |

Las constantes de la app están en [src/lib/plant-connection.ts](../../../src/lib/plant-connection.ts). Si vuelves a cambiarlas, cambia también el sketch.

El ESP32 anuncia el UUID del servicio para que se pueda encontrar **antes de conectar**. La app pasa ese UUID a `startDeviceScan([PLANT_SERVICE], ...)` y además comprueba que cada resultado lo incluya en `device.serviceUUIDs`. La comparación admite mayúsculas y minúsculas.

El nombre no interviene en el filtro:

- Un dispositivo llamado Plantia con otro UUID no aparece.
- Un dispositivo con nuestro UUID aparece aunque tenga otro nombre o no anuncie nombre. La lista lo muestra como Plantia.
- Si ninguno anuncia nuestro UUID, la lista queda vacía. Al iniciar otra búsqueda se borran los resultados anteriores.

El UUID identifica este firmware, no una placa física individual. Si lo cargas en dos ESP32, ambos aparecerán. No es una contraseña ni un mecanismo de autenticación.

## Qué ocurre desde que lo enciendes

1. `setup()` prepara **GPIO 4** como entrada con `INPUT_PULLUP`, que activa su resistencia interna de pull-up.
2. Crea el servicio Bluetooth y una característica de tipo `NOTIFY`: un canal para enviar datos al móvil.
3. Empieza a anunciarse para que la app pueda encontrarlo.
4. Cuando el móvil conecta, `onConnect()` descarta las muestras anteriores y espera a que active las notificaciones.
5. Con las notificaciones activadas, cada subida de GPIO 4 ejecuta `onRise()`. Una subida es el cambio de `LOW` a `HIGH`. La primera solo guarda el instante de inicio.
6. Desde la segunda subida, `onRise()` calcula el intervalo y lo guarda en la siguiente posición libre del array.
7. Cuando hay 10 valores, `loop()` prepara el mensaje y lo envía si el móvil está listo para recibirlo.
8. El contador vuelve a 0 y se repite el proceso.

Al desconectar, se deja de guardar muestras, se descarta el bloque pendiente y se vuelve a anunciar el dispositivo. La siguiente conexión empieza desde cero. Desactivar o reactivar las notificaciones también reinicia la captura, aunque no se desconecte el móvil. Mientras están desactivadas no se recogen muestras.

## Cómo se calcula el tiempo

Usamos **microsegundos**, igual que la v1 y el motor de audio de la app. **1.000 microsegundos = 1 milisegundo**.

`micros()` devuelve el tiempo desde que arrancó el ESP32. No reiniciamos ese reloj: guardamos una referencia en `previousTime` y restamos.

Por ejemplo:

| Suceso | Valor de `micros()` | Intervalo guardado |
| --- | ---: | ---: |
| Activa las notificaciones | 100000 | Todavía ninguno |
| Primera subida | 100250 | Solo marca el inicio |
| Segunda subida | 100550 | 300 |
| Tercera subida | 100950 | 400 |

La operación es `intervalo = ahora - previousTime`. Después hacemos `previousTime = ahora`.

Todos los valores miden entre dos subidas. El tiempo esperando desde la conexión o desde la activación de las notificaciones no se incluye. El primer bloque necesita **11 subidas para obtener 10 intervalos**; los siguientes necesitan 10 subidas si no hay pérdidas por falta de espacio. Al enviar un bloque **solo reiniciamos el contador del array**, no `previousTime`, para mantener la referencia entre bloques.

Los tiempos usan `uint32_t`, un entero sin signo de 32 bits. La resta sigue funcionando cuando el contador de `micros()` da la vuelta, siempre que el intervalo real sea menor que una vuelta completa, unos 71 minutos.

## Qué recibe la app

Cada notificación lleva texto UTF-8 con este formato:

```json
{"arr":[250,300,400,280,310,295,305,290,320,275]}
```

Siempre son 10 enteros en orden de captura. No se calcula ninguna media ni se filtran los valores. El lector de [plant-packet.ts](../../../src/lib/plant-packet.ts) convierte ese JSON en los datos de la app.

El móvil debe activar las notificaciones del canal de datos. Para eso existe `subscription`, un descriptor estándar de BLE llamado `BLE2902`. Aunque no recibimos comandos propios de la app, BLE necesita ese intercambio para activar los envíos.

También se negocia el **MTU**, que es el tamaño de los paquetes Bluetooth. El mensaje más largo posible ocupa 119 bytes, y BLE necesita otros 3: un MTU de **122** cubre cualquier bloque. El ESP32 ofrece **247** y la app solicita **247**. Si el tamaño acordado no permite enviar el mensaje completo, el programa conserva el bloque y espera; no lo envía cortado.

## Por qué hay una interrupción y un bloqueo

`loop()` se ejecuta continuamente, pero puede estar ocupado preparando un mensaje o llamando a Bluetooth cuando sube el pin. Por eso usamos `attachInterrupt(..., RISING)`: el ESP32 llama a `onRise()` al detectar la subida.

Dentro de esa función hacemos lo mínimo: leer el reloj, guardar la diferencia y actualizar el contador. No construimos JSON ni enviamos Bluetooth desde la interrupción.

Como `onRise()`, `loop()` y los callbacks de Bluetooth comparten variables, usamos `sampleMux` para proteger los accesos. Entre `portENTER_CRITICAL` y `portEXIT_CRITICAL` accedemos a esos datos sin que otro de esos bloques los cambie a la vez. Dentro de la interrupción se usan las variantes con sufijo `_ISR`.

`loop()` copia el array en `batch` mientras tiene ese bloqueo y lo libera antes de construir el JSON y enviarlo. Así no mantiene el bloqueo durante operaciones más lentas.

`session` es un contador que cambia al conectar, desconectar y cambiar la activación de las notificaciones. `batchSession` guarda el valor que tenía cuando copiamos las muestras. Compararlos ayuda a descartar copias de una captura anterior y a no reiniciar por error una captura nueva. El cambio de suscripción se recibe en `SubscriptionCallbacks`, para detectar incluso desactivaciones y activaciones rápidas entre dos ejecuciones de `loop()`.

## Las partes de C++ menos habituales

| Sintaxis | Qué significa aquí |
| --- | --- |
| `constexpr` | Un valor constante que conocemos al compilar, como el número de muestras. |
| `uint8_t` | Entero sin signo de 8 bits, de 0 a 255. Suficiente para contar hasta 10. |
| `uint32_t` | Entero sin signo de 32 bits, usado para los tiempos. |
| `volatile` | Indica que una variable puede cambiar fuera del flujo normal de `loop()`. No evita accesos simultáneos; para eso está el bloqueo. |
| `BLEServer*` y otros `*` | Punteros a objetos creados por la librería. `server->metodo()` llama a un método de ese objeto. |
| `override` | Indica que nuestro método implementa uno definido por la librería, como `onConnect()`. |
| `ARDUINO_ISR_ATTR` | Marca específica de ESP32 para una función que se ejecuta como interrupción. |
| `snprintf` | Escribe texto en un array de caracteres respetando su tamaño. Lo usamos para montar el JSON sin ArduinoJson. |
| `packet + length` | La posición donde continuar escribiendo después del texto ya añadido. |
| `reinterpret_cast<uint8_t*>(packet)` | Presenta el texto como bytes, que es el tipo que pide `setValue()`. No cambia el contenido. |

`packet` tiene 120 posiciones: caben los 10 números más grandes posibles, las comas, llaves y corchetes, y el carácter final `\0` que usa C++ para terminar un texto. Ese carácter final no se envía.

## Qué pasa si llegan más subidas mientras enviamos

El array de captura solo tiene 10 posiciones. Mientras está lleno, las nuevas subidas no se guardan. Esto puede ocurrir durante el envío o si el MTU es demasiado pequeño. Antes de activar las notificaciones no se captura nada.

Sí se sigue actualizando `previousTime` con cada subida. Así, al quedar espacio otra vez, el siguiente valor mide desde la última subida real, no todo el tiempo que estuvimos esperando.

Es una versión pequeña, sin cola de bloques pendientes: no garantiza capturar todos los flancos si llegan más rápido de lo que se envían. Las notificaciones tampoco llevan una confirmación de recepción de la app ni reintentos propios.

El `delay(1)` final deja tiempo de CPU para otras tareas. Durante esa espera las interrupciones siguen capturando subidas mientras quede espacio.

## Si no aparece o no llegan datos

Abre el **Monitor serie de Arduino a 115200 baudios**. Verás mensajes al arrancar, al quedar disponible para conectar, al conectar el móvil, al activar las notificaciones y al enviar el primer bloque. También se avisa si el MTU es demasiado pequeño. Al desconectar se imprime el motivo numérico que devuelve ESP32 cuando se usa Bluedroid. No se imprime cada muestra para evitar ralentizar la captura.

La app refresca la caché de servicios de Android al conectar, porque los UUID cambiaron en la misma placa. Comprueba que existan el servicio y el canal de datos nuevos. Si falla la suscripción, muestra el error BLE concreto en lugar de llamarlo siempre «conexión perdida». Los logs de la app llevan el prefijo `[Plantia BLE]`.

- **No aparece:** comprueba que has subido este sketch con los UUID nuevos y que has abierto la app actualizada. El nombre Plantia por sí solo ya no sirve para aparecer.
- **Conecta pero no envía:** primero deben activarse las notificaciones; después hacen falta 11 subidas para el primer bloque y un MTU suficiente. Sin cambios de LOW a HIGH en GPIO 4 no se llena el array.
- **Aparecen dos placas:** ambas anuncian el mismo UUID. Para elegir una placa concreta entre ellas, la app tendría que guardar además su identificador de dispositivo.
