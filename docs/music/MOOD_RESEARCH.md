# Criterios musicales de los cinco moods

Las fuentes describen técnicas de composición y producción, no una receta única. Las
decisiones concretas siguientes son nuestras y se prueban con los datos del sensor.

| Mood | Reglas aplicadas | Referencias |
| --- | --- | --- |
| Lofi | Pulso de batería reconocible con swing, bajo que afirma raíz o tercera, séptimas cálidas y frases de piano de pregunta y respuesta. El arreglo alterna quién lleva el primer plano. | [iZotope: swing y síncopa](https://www.izotope.com/community/blog/swing-and-syncopation-understanding-daw-groove), [iZotope: mantener interesante la repetición](https://www.izotope.com/community/blog/how-to-keep-repetition-in-music-interesting), [iZotope: cadenas lofi](https://www.izotope.com/community/blog/6-genres-and-the-effects-chains-that-define-them) |
| Deep focus | Fondo armónico lento con evolución gradual, motivo breve que se repite y huecos cada cuatro compases; la reverberación deja espacio a las teclas. | [Sound On Sound: diseño ambiental](https://www.soundonsound.com/techniques/sound-design-ambient-music), [Sound On Sound: pads en arreglos](https://www.soundonsound.com/techniques/creating-using-synth-pad-sounds) |
| Sleep | Versión aún menos intrusiva del ambient: pedal pentatónico, piano separado, retirada de la quinta al cerrar la frase y cambio gradual de timbre ante una media larga distinta. No se presupone efecto terapéutico. | [Sound On Sound: diseño ambiental](https://www.soundonsound.com/techniques/sound-design-ambient-music), [Sound On Sound: reverberación y densidad](https://www.soundonsound.com/techniques/using-your-sequencers-reverb-processors) |
| Psicodélico | Pedal modal que estabiliza el centro, células de tres y cinco posiciones, panorama y ecos moderados; pequeños cortes de frase evitan la acumulación. | [Sound On Sound: tácticas de delay](https://www.soundonsound.com/techniques/digital-delay-tactics), [Sound On Sound: funcionamiento del phaser](https://www.soundonsound.com/sound-advice/how-phasers-work) |
| Ghibli | Tema **original** de ocho compases en vals: llamada, desarrollo, respuesta de madera y cadencia. Piano solo como centro, bajo en el tiempo fuerte y acompañamiento en los débiles. Usamos extensiones diatónicas y cambios de orquestación sin copiar temas. | [Análisis académico de *One Summer’s Day*](https://rsucon.rsu.ac.th/2021/paper/1923), [Sydney Symphony: notas sobre Hisaishi](https://files.baskercdn.com/sydneysymphony/files/2025_SSP07_Art%20of%20the%20Score-The%20Music-of-Joe%20Hisaishi_web_singles.pdf) |

## Cómo intervienen las ondas

Las componentes son senoidales ajustadas a la variación del **periodo eléctrico
del circuito**, no medidas separadas de procesos biológicos. La contribución al
ajuste determina el peso de cada onda. La primera suele pesar más, pero las
demás siguen formando parte del campo musical. Los identificadores se siguen
entre análisis cuando el ajuste permite relacionarlos; una fase local por sí
sola no se compara entre ventanas.

| Rasgo medido | Uso musical |
| --- | --- |
| Media del periodo y frecuencia geométrica ponderada, ventana larga | La media elige el centro tonal; ambas determinan el tempo objetivo. El centro se retiene por frase o sesión según el mood. |
| Distribución de frecuencias y anchura ponderada, ventana larga | Ruta de acordes y entrada discreta de una segunda capa o respuesta instrumental. |
| RMS ajustado relativo, ventana corta | Intensidad, articulación y actividad de figuras opcionales. Un ajuste casi plano permanece tranquilo. |
| Frecuencia, fase al final y peso de **cada** componente, ventana corta | Campo agregado de dieciséis posiciones: dirección, acento, nota estable de paso, desplazamiento y panorama. Todas las ondas con peso participan en cada posición; ninguna produce una nota literal por sí misma. |
| Distancia entre descriptores de ventanas largas | Un cambio grande permite renovar la identidad en el siguiente límite armónico de hasta cuatro compases; el tempo se aproxima algo más deprisa. |
| Extremo relativo en paquetes crudos | Saludo breve independiente de Fourier y afinado con el acorde vigente. |

Esta conversión comprime las frecuencias medidas a ciclos **musicales** por
motivo. No iguala hercios del sensor a alturas audibles. Los acordes, registros,
instrumentos, pulsos y límites de polifonía pertenecen a cada mood: la planta
elige y matiza dentro de ese vocabulario. La traza JSON del test conserva el
análisis de origen, los IDs de componentes y la regla de cada nota.
