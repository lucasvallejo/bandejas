# Circuito de trazabilidad de remitos y facturas

Este proyecto provee una Single Page Application (SPA) en HTML y JavaScript vanilla para gestionar el circuito completo de órdenes de compra, remitos, facturas, propuestas de pago, órdenes de pago y legajos vinculados a las operaciones de FoodService.

## Características principales

- Autenticación mediante la función `login()` provista, con consumo del endpoint corporativo y almacenamiento de sesión en `sessionStorage`.
- Layout responsive con sidebar dinámico en función de los permisos devueltos por el servicio de autenticación.
- Integración con Firebase Realtime Database y Firebase Storage a través de clientes REST ligeros.
- Módulos independientes para cada entidad del circuito (OC, remitos, facturas, propuestas, OP, legajos y auditoría).
- Línea de tiempo reutilizable para visualizar los eventos auditados de cualquier ítem.
- Utilidades para exportar propuestas a CSV, calcular semanas ISO y subir adjuntos a Storage.
- Hooks de auditoría en cada operación crítica, preservando la trazabilidad minuto a minuto.

## Estructura

```
public/
  index.html              # Punto de entrada de la SPA
  css/styles.css          # Estilos base y componentes
  js/
    app.js                # Registro de módulos y arranque
    auth.js               # Autenticación y manejo de sesión
    firebase.js           # Inicialización de clientes Firebase
    router.js             # Router muy ligero para la SPA
    ui/                   # Módulos por entidad y timeline
    utils/                # Clientes, helpers de permisos, fechas, excel, storage
```

## Configuración

1. Crear un archivo de configuración que invoque `setConfig()` con las credenciales de Firebase, por ejemplo:

```html
<script type="module">
  import { setConfig } from './js/utils/config.js';
  setConfig({
    databaseURL: 'https://<tu-proyecto>.firebaseio.com',
    storageBucket: 'https://firebasestorage.googleapis.com/v0/b/<tu-bucket>.appspot.com/o',
    authTokenProvider: async () => sessionStorage.getItem('firebaseToken')
  });
</script>
```

2. Servir el contenido de `public/` (por ejemplo con Firebase Hosting o un servidor estático).

## Desarrollo local

```bash
npm install -g serve
serve public
```

Luego ingresar a `http://localhost:3000` y autenticarse con un usuario habilitado por el endpoint corporativo.

## Licencia

MIT
