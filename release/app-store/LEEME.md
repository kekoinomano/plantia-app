# Recursos para publicar saviasound en App Store

## Qué subir

- `capturas-iphone/01.jpg`, `02.jpg` y `03.jpg`: imágenes para **iPhone con Dynamic Island (pantalla mediana)**. Cada una mide 1179 × 2556 px. Están compuestas con capturas existentes de la app; comprueba que la interfaz sigue siendo la misma antes de enviarlas.
- `ficha-es.txt`: textos para la ficha en español.
- `listing-en.txt`: traducción para añadir como localización inglesa si deseas una ficha en inglés.

## Campos que todavía requieren tus datos

1. **URL de soporte**: dirección pública que permita contactar contigo. No puede ser una ruta de este proyecto.
2. **Política de privacidad**: URL pública; se configura en **Privacidad de la app**, junto con el cuestionario de datos recogidos. No marques «No se recogen datos» sin revisar el comportamiento de la compilación final y sus SDK.
3. **Copyright**: nombre legal de la persona o empresa titular de la app.
4. **Equipo de revisión**: nombre, apellidos, teléfono y correo reales, y enlace al vídeo que muestra la app funcionando con el sensor físico.
5. **Precio, territorios, clasificación por edad y cumplimiento de exportación/encriptación**: responder en App Store Connect según la distribución y el comportamiento reales de la app.

## Campos de la pantalla que puedes omitir

- **Encabezado y resultados de la búsqueda**: creatividad adicional opcional. La ficha puede usar las capturas sin ella.
- **Vistas previas de la app**: vídeos promocionales opcionales. El vídeo privado para App Review es distinto y se enlaza en las notas de revisión.
- **Archivo de cobertura de la app de encaminamiento**: solo para apps de navegación.
- **Clip de app, app para iMessage y Game Center**: no se usan.
- La compilación actual está configurada solo para iPhone; no requiere capturas de iPad ni Apple Watch. Confirma los dispositivos admitidos cuando Apple procese el IPA.

## Compilación iOS en este Mac

Expo admite `eas build --platform ios --profile production --local --output ./output/saviasound-ios-production-v2.ipa`. Requiere Xcode, CocoaPods, Fastlane y acceso a tu cuenta Expo y Apple para firmar. Xcode y CocoaPods están instalados; Fastlane no estaba disponible al preparar esta carpeta. Puedes instalarlo con `brew install fastlane`.

Una vez creado el IPA, se puede subir con `eas submit --platform ios --profile production` o con Transporter. La subida deja la compilación en App Store Connect; después hay que seleccionarla en la ficha y enviarla a App Review.

El `Version` de la ficha debe coincidir con `expo.version` de `app.json`, actualmente `1.0.0`. El `2.0.0` de `package.json` no es la versión pública de iOS.

Fuentes: [Expo, compilaciones locales](https://docs.expo.dev/build-reference/local-builds/), [Apple, tamaños de capturas](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), [Apple, privacidad de la app](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy), [Apple, revisión con hardware](https://developer.apple.com/app-store/review/).
