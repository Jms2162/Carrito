# NovaShop

Catálogo de demostración para mascotas y el hogar. Los precios y las existencias son valores de referencia; se confirman al conversar con NovaShop. No se procesan pagos ni se envían correos.

## Hacer un pedido por WhatsApp

1. Abrí `index.html` con **Go Live** en VS Code. Live Server usa el puerto `5501`.
2. Elegí productos, abrí el carrito y tocá **Pedir por WhatsApp**.
3. Se abrirá un chat con el número de NovaShop y un mensaje preparado con productos, cantidades y subtotal de referencia. Revisá el texto y presioná **Enviar** en WhatsApp.

El pedido no se envía hasta que el cliente presiona **Enviar**, ni queda confirmado automáticamente. La disponibilidad, la entrega y el pago se coordinan por chat. Para este flujo no hace falta ejecutar `npm start`.

Los pedidos enviados por WhatsApp no aparecen en el panel privado `/owner`; los administra la persona propietaria directamente en WhatsApp.

Para cambiar los productos, precios o existencias de referencia, editá `data/initial-products.json`.

## Validación

```powershell
npm run check
```
