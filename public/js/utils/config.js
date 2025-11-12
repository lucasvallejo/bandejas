const defaultConfig = {
  databaseURL: 'https://pruebas2025.firebaseio.com/',
  storageBucket: 'gs://cantina-89c6a.appspot.com/mesadeentrada',
  authTokenProvider: async () => null,
  features: {
    excepcion_firma_director: false
  },
  finanzas: {
    cierre_semanal: 'lunes 12:00',
    semana_iso: true
  },
  ui: {
    timeline_dock: 'right',
    density: 'comfortable'
  }
};

let runtimeConfig = null;

export function setConfig(config) {
  runtimeConfig = { ...defaultConfig, ...config };
}

export function getConfig() {
  return runtimeConfig ?? defaultConfig;
}
