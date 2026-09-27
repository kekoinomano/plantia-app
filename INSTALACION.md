# Instalación tras clonar el repositorio

Necesitas Node.js 22.13 o superior y, según el dispositivo, Android Studio con el SDK o Xcode con CocoaPods. Para iOS también necesitas CMake y Ninja.

Desde la raíz del repositorio:

```sh
npm ci
mkdir -p modules/plantia-pcm/third_party
git clone --depth 1 --branch 1.2.3 --recurse-submodules --shallow-submodules https://github.com/sfztools/sfizz.git modules/plantia-pcm/third_party/sfizz-1.2.3
```

Para Android, conecta un dispositivo y ejecuta:

```sh
npm run android -- --device
```

Para iOS, conecta un iPhone y ejecuta:

```sh
bash scripts/build-sfizz-ios.sh
npx pod-install
npm run ios -- --device
```

Después de instalar la app, `npm start` inicia Metro. Usa la compilación instalada; Expo Go no incluye el audio ni Bluetooth de Plantia.

Los archivos `assets/audio/sfz/*.sfzpack` son instrumentos que usa la app: deben venir en el repositorio. Si faltan tras clonar, el repositorio aún no incluye todos los assets necesarios para compilar.
