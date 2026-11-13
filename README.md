# NovaShop

Catálogo público de productos para mascotas y el hogar. Las seis fichas se publican desde `data/initial-products.json`, con nombres descriptivos y sin identificar a los comercios proveedores. La gestión privada se limita a confirmar stock y pagos de pedidos; no incluye edición de productos.

Los precios y existencias son ficticios y solo sirven para mostrar el flujo de compra. No se procesan cobros ni se envían correos reales.

## Ver el catálogo con Live Server

1. Abrí la carpeta `NovaShop` en VS Code.
2. Abrí `index.html` y seleccioná **Go Live**. La configuración de este proyecto usa el puerto `5501` para evitar conflictos con otros servicios en el puerto predeterminado `5500`.
3. Si ya tenías Live Server iniciado, detenelo y volvé a iniciarlo para que tome el nuevo puerto.

El catálogo y sus ilustraciones se cargan desde `data/initial-products.json`. Live Server permite explorar productos y armar un carrito; no envía pedidos ni muestra controles de confirmación. Para hacer pedidos y usar la gestión privada se necesita el servidor de NovaShop.

## Usar el carrito y recibir pedidos localmente

Necesitás Node.js 20 o superior. Primero configurá una contraseña privada de al menos 16 caracteres desde PowerShell en la carpeta del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File .\Configurar-Acceso-NovaShop.ps1
```

La contraseña se guarda fuera del proyecto, en el perfil local de Windows, y no se escribe en el código. Después, iniciá NovaShop:

```powershell
npm start
```

Abrí `http://127.0.0.1:3000` para comprar y `http://127.0.0.1:3000/owner` para ingresar a la gestión privada. Solo la sesión autenticada puede ver pedidos o confirmarlos. Las acciones de stock y pago también están protegidas en el servidor, no solo ocultas en la página. La sesión dura hasta 8 horas o hasta cerrar sesión.

Al recibir un pedido, el stock todavía no se descuenta. Desde `/owner`, confirmá primero su disponibilidad: el servidor verifica y reserva las unidades en ese momento. Después, cuando hayas recibido el pago por transferencia o efectivo, confirmalo en la misma página. El cliente verá el cambio de estado en su tienda y podrá seguir comprando mientras espera.

Para ajustar el catálogo de demostración, actualizá `data/initial-products.json` y, si ya existe, el producto correspondiente en `data/store.json`. El stock se reserva cuando se confirma la disponibilidad del pedido y se mantiene reservado mientras espera el pago.

El flujo muestra dos emails ficticios: confirmación de stock antes del pago y confirmación de pago con una entrega estimada en 24 horas. No envía mensajes reales ni procesa pagos: las confirmaciones las hacés manualmente desde la página privada. Para un sitio publicado en Internet harán falta alojamiento HTTPS, un servicio de correo y un procesador de pagos.

## Validación

```powershell
npm run check
```
