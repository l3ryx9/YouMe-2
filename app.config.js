// app.config.js — YouMe V2 (Supabase)
// Variables d'environnement utilisées :
//   GOOGLE_MAPS_API_KEY_ANDROID — Clé API Google Maps pour Android
//   EXPO_PUBLIC_SUPABASE_URL    — URL du projet Supabase (exposée au client)
//   EXPO_PUBLIC_SUPABASE_ANON_KEY — Clé anon Supabase (exposée au client)
module.exports = {
  expo: {
    name: 'YouMe',
    slug: 'youme',
    owner: 'alemille9',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/logo-icon.jpg',
    userInterfaceStyle: 'dark',
    scheme: 'youme',
    splash: {
      image: './assets/images/logo-splash.png',
      resizeMode: 'contain',
      backgroundColor: '#000000',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.youme24.appname',
      buildNumber: '1',
      infoPlist: {
        NSMicrophoneUsageDescription:
          "YouMe V2 nécessite l'accès au microphone pour enregistrer des messages vocaux.",
        NSPhotoLibraryUsageDescription:
          "YouMe V2 nécessite l'accès à la galerie pour partager des photos.",
        NSPhotoLibraryAddUsageDescription:
          "YouMe V2 nécessite l'accès à la galerie pour partager des photos.",
        NSCameraUsageDescription:
          "YouMe V2 nécessite l'accès à la caméra pour prendre des photos et vidéos.",
        NSUserNotificationsUsageDescription:
          'YouMe V2 nécessite les notifications pour vous alerter des nouveaux messages.',
        NSLocationWhenInUseUsageDescription:
          "YouMe V2 nécessite l'accès à la position pour le partage de position en direct.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "YouMe V2 nécessite l'accès à la position en arrière-plan pour continuer le partage de position quand l'écran est verrouillé.",
        UIBackgroundModes: ['location'],
      },
      // NOTE : GoogleService-Info.plist conservé uniquement pour FCM natif
      // (notifications push silencieuses). Firebase Auth et Firestore ne sont
      // plus utilisés. Ce fichier peut être retiré si vous n'utilisez pas FCM.
      googleServicesFile: './GoogleService-Info.plist',
    },
    android: {
      package: 'com.youme24.appname',
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/images/logo-icon.jpg',
        backgroundColor: '#000000',
      },
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
        },
      },
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.CAMERA',
        'android.permission.VIBRATE',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_LOCATION',
      ],
      // NOTE : google-services.json conservé uniquement pour FCM natif.
      googleServicesFile: './google-services.json',
    },
    web: {
      bundler: 'metro',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-notifications',
      [
        'expo-av',
        {
          microphonePermission:
            "Autoriser YouMe à accéder au microphone pour enregistrer des messages vocaux.",
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission:
            "YouMe V2 nécessite l'accès à la galerie pour partager des photos et vidéos.",
          cameraPermission:
            "YouMe V2 nécessite l'accès à la caméra pour prendre des photos et vidéos.",
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            "YouMe V2 nécessite l'accès à la position en arrière-plan pour continuer le partage de position quand l'écran est verrouillé.",
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      // FCM natif conservé pour les notifications silencieuses (localisation furtive)
      '@react-native-firebase/app',
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 24,
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            extraProguardRules:
              '-keep class org.tensorflow.** { *; }\n-dontwarn org.tensorflow.**\n-keep class com.google.flatbuffers.** { *; }\n-dontwarn com.google.flatbuffers.**',
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: { origin: false },
      eas: { projectId: '99878b99-246a-4c9c-8187-b33ec4c1e864' },
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
    description: 'YouMe V2 — Application de messagerie privée avec IA locale',
    sdkVersion: '51.0.0',
    platforms: ['ios', 'android'],
    jsEngine: 'hermes',
  },
};
