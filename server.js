const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const dataDirectory = path.join(root, "data");
const storePath = path.join(dataDirectory, "store.json");
const catalogPath = path.join(dataDirectory, "initial-products.json");
const ownerPasswordPath = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "NovaShop", "owner-password")
  : "";
const port = Number(process.env.PORT) || 3000;
const ownerSessionCookie = "novashop_owner";
const ownerSessionLifetime = 8 * 60 * 60 * 1000;
const paymentMethods = new Set(["Transferencia", "Efectivo"]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let store;
let ownerPassword = "";
let orderOperations = Promise.resolve();
const ownerSessions = new Map();

async function loadOwnerPassword() {
  if (process.env.NOVASHOP_OWNER_PASSWORD) return process.env.NOVASHOP_OWNER_PASSWORD;
  if (!ownerPasswordPath) return "";
  try {
    return (await fs.readFile(ownerPasswordPath, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function loadStore() {
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    store = JSON.parse(await fs.readFile(storePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    store = { products: JSON.parse(await fs.readFile(catalogPath, "utf8")), orders: [] };
    await saveStore();
  }
  if (!Array.isArray(store.products) || !Array.isArray(store.orders)) {
    throw new Error("El archivo de datos de NovaShop tiene un formato inválido.");
  }
}

function saveStore() {
  return (async () => {
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(temporaryPath, storePath);
  })();
}

function withOrderLock(operation) {
  const result = orderOperations.then(operation);
  orderOperations = result.catch(() => {});
  return result;
}

function hashOrderToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicOrder(order) {
  const { confirmationTokenHash, ...safeOrder } = order;
  return safeOrder;
}

function getOwnerSessionToken(request) {
  const cookie = request.headers.cookie || "";
  const sessionCookie = cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${ownerSessionCookie}=`));
  return sessionCookie ? sessionCookie.slice(ownerSessionCookie.length + 1) : "";
}

function isOwnerAuthenticated(request) {
  const token = getOwnerSessionToken(request);
  const expiresAt = ownerSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    ownerSessions.delete(token);
    return false;
  }
  ownerSessions.set(token, Date.now() + ownerSessionLifetime);
  return true;
}

async function loginOwner(request, response) {
  if (!ownerPassword) {
    return sendJson(response, 503, { error: "Falta configurar la contraseña privada. Ejecutá Configurar-Acceso-NovaShop.ps1." });
  }
  const body = await readJson(request);
  if (!body || typeof body.password !== "string") {
    return sendJson(response, 400, { error: "Ingresá la contraseña de propietaria." });
  }
  const supplied = Buffer.from(body.password);
  const expected = Buffer.from(ownerPassword);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return sendJson(response, 401, { error: "La contraseña no es correcta." });
  }
  const token = crypto.randomBytes(32).toString("hex");
  ownerSessions.set(token, Date.now() + ownerSessionLifetime);
  const secure = request.socket.encrypted ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${ownerSessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/api/owner; Max-Age=${ownerSessionLifetime / 1000}${secure}`);
  return sendJson(response, 200, { authenticated: true });
}

function logoutOwner(request, response) {
  ownerSessions.delete(getOwnerSessionToken(request));
  response.setHeader("Set-Cookie", `${ownerSessionCookie}=; HttpOnly; SameSite=Strict; Path=/api/owner; Max-Age=0`);
  return sendJson(response, 200, { authenticated: false });
}

function requireOwner(request, response) {
  if (isOwnerAuthenticated(request)) return true;
  sendJson(response, 401, { error: "Iniciá sesión como propietaria para continuar." });
  return false;
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 16_384) {
      const error = new Error("La solicitud es demasiado grande.");
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("La solicitud no contiene JSON válido.");
    error.status = 400;
    throw error;
  }
}

async function createOrder(request, response) {
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendJson(response, 400, { error: "La solicitud del pedido no es válida." });
  }
  const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim() : "";
  if (!customerName || customerName.length > 120 || customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return sendJson(response, 400, { error: "Ingresá un nombre y un correo electrónico válidos." });
  }
  if (!paymentMethods.has(body.payment)) {
    return sendJson(response, 400, { error: "El medio de pago debe ser transferencia o efectivo." });
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
    return sendJson(response, 400, { error: "El carrito no contiene productos válidos." });
  }

  const quantities = new Map();
  for (const item of body.items) {
    if (!item || typeof item.id !== "string" || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      return sendJson(response, 400, { error: "El carrito contiene cantidades inválidas." });
    }
    const quantity = (quantities.get(item.id) || 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) {
      return sendJson(response, 400, { error: "La cantidad solicitada no es válida." });
    }
    quantities.set(item.id, quantity);
  }

  return withOrderLock(async () => {
    const orderItems = [];
    for (const [id, quantity] of quantities) {
      const product = store.products.find((entry) => entry.id === id && entry.active);
      if (!product || !Number.isFinite(product.price) || product.price < 0 || !Number.isSafeInteger(product.stock) || product.stock < quantity) {
        return sendJson(response, 409, { error: "El stock o el precio de un producto cambió. Actualizá el catálogo e intentá de nuevo." });
      }
      orderItems.push({
        id: product.id,
        name: product.name,
        quantity,
        unitPrice: product.price,
      });
    }

    const total = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    if (!Number.isSafeInteger(total) || total < 0) {
      return sendJson(response, 400, { error: "El total del pedido no es válido." });
    }
    const confirmationToken = crypto.randomBytes(32).toString("hex");
    const order = {
      id: `NS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      customerName,
      customerEmail,
      payment: body.payment,
      items: orderItems,
      total,
      status: "awaiting_stock_confirmation",
      confirmationTokenHash: hashOrderToken(confirmationToken),
      createdAt: new Date().toISOString(),
    };
    store.orders.push(order);
    try {
      await saveStore();
    } catch (error) {
      store.orders.splice(store.orders.indexOf(order), 1);
      throw error;
    }
    return sendJson(response, 201, { order: publicOrder(order), confirmationToken });
  });
}

async function handleOrderStatus(request, response, orderId) {
  const token = request.headers["x-order-token"];
  return withOrderLock(async () => {
    const order = store.orders.find((entry) => entry.id === orderId);
    if (!order || typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
      return sendJson(response, 404, { error: "No se encontró el pedido." });
    }
    if (typeof order.confirmationTokenHash !== "string") {
      return sendJson(response, 404, { error: "No se encontró el pedido." });
    }
    const actualHash = Buffer.from(hashOrderToken(token), "hex");
    const expectedHash = Buffer.from(order.confirmationTokenHash, "hex");
    if (actualHash.length !== expectedHash.length || !crypto.timingSafeEqual(actualHash, expectedHash)) {
      return sendJson(response, 404, { error: "No se encontró el pedido." });
    }
    return sendJson(response, 200, { order: publicOrder(order) });
  });
}

async function updateOrderStatus(response, orderId, action) {
  return withOrderLock(async () => {
    const order = store.orders.find((entry) => entry.id === orderId);
    if (!order) return sendJson(response, 404, { error: "No se encontró el pedido." });

    if (action === "stock") {
      if (order.status !== "awaiting_stock_confirmation") {
        return sendJson(response, 409, { error: "El pedido ya no está esperando confirmación de stock.", order: publicOrder(order) });
      }
      const currentProducts = order.items.map((item) => store.products.find((product) => product.id === item.id && product.active));
      const hasStock = currentProducts.every((product, index) => (
        product
        && Number.isSafeInteger(product.stock)
        && product.stock >= order.items[index].quantity
      ));
      if (!hasStock) {
        const previousStatus = order.status;
        order.status = "unavailable";
        order.unavailableAt = new Date().toISOString();
        try {
          await saveStore();
        } catch (error) {
          order.status = previousStatus;
          delete order.unavailableAt;
          throw error;
        }
        return sendJson(response, 409, {
          error: "No pudimos confirmar stock para todos los productos. No se descontó ninguna unidad.",
          order: publicOrder(order),
        });
      }

      currentProducts.forEach((product, index) => {
        product.stock -= order.items[index].quantity;
      });
      order.status = "awaiting_payment";
      order.stockConfirmedAt = new Date().toISOString();
      order.stockReserved = true;
      try {
        await saveStore();
      } catch (error) {
        currentProducts.forEach((product, index) => {
          product.stock += order.items[index].quantity;
        });
        order.status = "awaiting_stock_confirmation";
        delete order.stockConfirmedAt;
        delete order.stockReserved;
        throw error;
      }
      return sendJson(response, 200, { order: publicOrder(order) });
    }

    if (action === "payment") {
      if (order.status !== "awaiting_payment") {
        return sendJson(response, 409, { error: "El pedido no está esperando confirmación de pago.", order: publicOrder(order) });
      }
      order.status = "paid";
      order.paidAt = new Date().toISOString();
      try {
        await saveStore();
      } catch (error) {
        order.status = "awaiting_payment";
        delete order.paidAt;
        throw error;
      }
      return sendJson(response, 200, { order: publicOrder(order) });
    }

    return sendJson(response, 404, { error: "Acción de pedido desconocida." });
  });
}

async function serveFile(response, filePath) {
  try {
    const contents = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("No encontrado");
      return;
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "POST" && url.pathname === "/api/owner/login") {
    return loginOwner(request, response);
  }
  if (request.method === "GET" && url.pathname === "/api/owner/session") {
    return sendJson(response, 200, { authenticated: isOwnerAuthenticated(request) });
  }
  if (request.method === "POST" && url.pathname === "/api/owner/logout") {
    return logoutOwner(request, response);
  }
  if (request.method === "GET" && url.pathname === "/api/owner/orders") {
    if (!requireOwner(request, response)) return;
    const orders = store.orders
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 100)
      .map(publicOrder);
    return sendJson(response, 200, { orders });
  }
  const ownerOrderAction = url.pathname.match(/^\/api\/owner\/orders\/(NS-[A-Z0-9-]+)\/confirm-(stock|payment)$/);
  if (request.method === "POST" && ownerOrderAction) {
    if (!requireOwner(request, response)) return;
    return updateOrderStatus(response, ownerOrderAction[1], ownerOrderAction[2]);
  }
  if (request.method === "GET" && url.pathname === "/api/products") {
    return sendJson(response, 200, { products: store.products.filter((product) => product.active) });
  }
  const orderStatus = url.pathname.match(/^\/api\/orders\/(NS-[A-Z0-9-]+)$/);
  if (request.method === "GET" && orderStatus) {
    return handleOrderStatus(request, response, orderStatus[1]);
  }
  if (request.method === "POST" && url.pathname === "/api/orders") {
    return createOrder(request, response);
  }
  if (request.method !== "GET") {
    return sendJson(response, 405, { error: "Método no permitido." });
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    return serveFile(response, path.join(root, "index.html"));
  }
  if (url.pathname === "/owner" || url.pathname === "/owner.html") {
    return serveFile(response, path.join(root, "owner.html"));
  }
  if (["/app.js", "/styles.css", "/owner.js", "/owner.css"].includes(url.pathname)) {
    return serveFile(response, path.join(root, url.pathname.slice(1)));
  }
  if (url.pathname === "/data/initial-products.json") {
    return serveFile(response, catalogPath);
  }
  if (/^\/images\/[a-z0-9-]+\.svg$/.test(url.pathname)) {
    return serveFile(response, path.join(root, url.pathname.slice(1)));
  }
  response.writeHead(404);
  response.end("No encontrado");
}

async function main() {
  ownerPassword = await loadOwnerPassword();
  await loadStore();
  http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error("Error en la solicitud de NovaShop:", error);
      if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : "Ocurrió un error interno." });
      else response.destroy();
    });
  }).listen(port, "127.0.0.1", () => {
    console.log(`NovaShop está disponible en http://127.0.0.1:${port}`);
  });
}

main().catch((error) => {
  console.error("No se pudo iniciar NovaShop:", error);
  process.exitCode = 1;
});
