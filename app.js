const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const cart = new Map();
let products = [];
let activeCategory = "Todos";
let searchQuery = "";
let lastFocusedElement = null;
let previewMode = false;

const productGrid = document.querySelector("#product-grid");
const emptyResults = document.querySelector("#empty-results");
const resultsCount = document.querySelector("#results-count");
const drawer = document.querySelector("#cart-drawer");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
const checkoutDialog = document.querySelector("#checkout-dialog");
const successDialog = document.querySelector("#success-dialog");
const activeOrderKey = "novashop-active-order";
let activeOrder = null;
let syncingActiveOrder = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("El servidor entregó una página HTML en lugar de la API de NovaShop.");
  }
  if (!response.ok) {
    const error = new Error(result.error || "No se pudo completar la solicitud.");
    error.status = response.status;
    error.details = result;
    throw error;
  }
  return result;
}

function saveActiveOrder() {
  if (activeOrder) localStorage.setItem(activeOrderKey, JSON.stringify(activeOrder));
  else localStorage.removeItem(activeOrderKey);
}

async function refreshProducts() {
  try {
    const result = await requestJson("/api/products", { headers: {} });
    products = result.products;
    previewMode = false;
    showCatalogNotice("");
  } catch {
    const response = await fetch("data/initial-products.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("No se pudo cargar el catálogo público.");
    products = await response.json();
    previewMode = true;
    showCatalogNotice("Vista de catálogo de demostración: podés usar el carrito, pero para enviar pedidos y recibir confirmaciones necesitás iniciar el servidor con npm start.");
  }
  renderProducts();
  renderCart();
}

function showCatalogNotice(message) {
  const notice = document.querySelector("#catalog-notice");
  notice.replaceChildren();
  notice.hidden = !message;
  if (!message) return;
  notice.append(document.createTextNode(message));
}

function renderProducts() {
  const visibleProducts = products.filter((product) => {
    const matchesCategory = activeCategory === "Todos" || product.category === activeCategory;
    const matchesSearch = `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  productGrid.innerHTML = visibleProducts
    .map((product) => {
      const available = product.stock > 0 && product.price !== null;
      const image = product.image
        ? `<img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" />`
        : `<div class="product-placeholder ${product.category === "Mascotas" ? "pet-placeholder" : "home-placeholder"}" aria-hidden="true"><span>${product.category === "Mascotas" ? "♡" : "⌂"}</span></div>`;
      return `
        <article class="product-card">
          <div class="product-image-wrap">
            ${image}
            <span class="product-badge">${available ? "DISPONIBLE" : product.stock === 0 ? "SIN STOCK" : "CONSULTAR"}</span>
            ${product.image.startsWith("/images/") ? '<span class="illustration-badge">IMAGEN ILUSTRATIVA</span>' : ""}
            <button class="product-add" type="button" data-add="${escapeHtml(product.id)}" aria-label="Agregar ${escapeHtml(product.name)} al carrito" ${available ? "" : "disabled"}>
              ${available ? "+" : "−"}
            </button>
          </div>
          <div class="product-info">
            <div><h3 class="product-name">${escapeHtml(product.name)}</h3><span class="product-category">${escapeHtml(product.category)}</span></div>
            <div class="product-pricing">
              ${product.price === null ? `<div class="product-price price-pending">Precio a confirmar</div>` : `<div class="product-price">${money.format(product.price)}</div>`}
              <div class="product-stock">${product.stock === 1 ? "1 unidad disponible" : `${product.stock} unidades disponibles`}</div>
            </div>
          </div>
          ${product.description ? `<p class="product-description">${escapeHtml(product.description)}</p>` : ""}
        </article>`;
    })
    .join("");

  resultsCount.textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? "producto" : "productos"}`;
  emptyResults.hidden = visibleProducts.length > 0;
}

function getCartQuantity() {
  return [...cart.values()].reduce((total, item) => total + item.quantity, 0);
}

function getSubtotal() {
  return [...cart.values()].reduce((total, item) => {
    const product = products.find((entry) => entry.id === item.id);
    return total + (product?.price || 0) * item.quantity;
  }, 0);
}

function renderCart() {
  const quantity = getCartQuantity();
  const cartItems = [...cart.values()];
  document.querySelector("#cart-count").textContent = String(quantity);
  document.querySelector("#drawer-item-count").textContent = `(${quantity})`;
  document.querySelector("#cart-items").innerHTML = cartItems
    .map(({ id, quantity: itemQuantity }) => {
      const product = products.find((entry) => entry.id === id);
      if (!product) {
        return `<article class="cart-item cart-item-unavailable"><div><strong>Producto sin disponibilidad</strong><small>Quitalo para continuar.</small></div><button class="remove-item" type="button" data-remove="${escapeHtml(id)}">Quitar</button></article>`;
      }
      return `
        <article class="cart-item">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="" />` : `<div class="cart-item-placeholder">${product.category === "Mascotas" ? "♡" : "⌂"}</div>`}
          <div class="cart-item-description">
            <strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)} · ${product.stock} disponibles</small>
            <div class="quantity-control" aria-label="Cantidad de ${escapeHtml(product.name)}">
              <button type="button" data-quantity="${escapeHtml(id)}" data-change="-1" aria-label="Quitar una unidad">−</button>
              <span>${itemQuantity}</span>
              <button type="button" data-quantity="${escapeHtml(id)}" data-change="1" aria-label="Agregar una unidad" ${itemQuantity >= product.stock ? "disabled" : ""}>+</button>
            </div>
          </div>
          <div class="cart-item-price"><strong>${product.price === null ? "Precio a confirmar" : money.format(product.price * itemQuantity)}</strong><button class="remove-item" type="button" data-remove="${escapeHtml(id)}">Quitar</button></div>
        </article>`;
    })
    .join("");

  const isEmpty = quantity === 0;
  const hasPendingOrder = activeOrder && !["paid", "unavailable"].includes(activeOrder.order.status);
  const canCheckout = !previewMode && !hasPendingOrder && cartItems.length > 0 && cartItems.every(({ id, quantity: count }) => {
    const product = products.find((entry) => entry.id === id);
    return product && product.active && product.price !== null && product.stock >= count;
  });
  document.querySelector("#cart-empty").hidden = !isEmpty;
  document.querySelector("#cart-footer").hidden = isEmpty;
  document.querySelector("#cart-subtotal").textContent = money.format(getSubtotal());
  document.querySelector("#cart-shipping").textContent = "A coordinar";
  document.querySelector("#cart-total").textContent = money.format(getSubtotal());
  document.querySelector("#checkout-total").textContent = money.format(getSubtotal());
  document.querySelector("#shipping-progress").textContent = previewMode
    ? "Para enviar pedidos y confirmar stock, iniciá NovaShop con npm start."
    : hasPendingOrder
      ? "Tenés un pedido pendiente. Podés seguir comprando y volver a consultarlo antes de iniciar otro."
    : canCheckout
      ? "Stock disponible. Se vuelve a verificar antes de reservarlo."
      : "El pedido solo se habilita con precio y stock confirmados.";
  document.querySelector("#checkout-button").disabled = !canCheckout;
  document.querySelector("#resume-order").hidden = !hasPendingOrder;
  document.querySelector("#resume-pending-empty").hidden = !(isEmpty && hasPendingOrder);
}

function setCheckoutMessage(message = "") {
  const status = document.querySelector("#checkout-status");
  status.textContent = message;
  status.hidden = !message;
}

async function addToCart(productId) {
  try {
    await refreshProducts();
    const product = products.find((item) => item.id === productId);
    if (!product || !product.active || product.stock < 1 || product.price === null) {
      setCheckoutMessage("Ese producto no tiene stock disponible.");
      return;
    }
    const existingItem = cart.get(productId);
    if ((existingItem?.quantity ?? 0) >= product.stock) {
      setCheckoutMessage(`Solo quedan ${product.stock} unidades de ${product.name}.`);
    } else {
      cart.set(productId, { id: productId, quantity: (existingItem?.quantity ?? 0) + 1 });
      setCheckoutMessage("");
      renderCart();
      openCart();
    }
  } catch (error) {
    showPageError(error.message);
  }
}

function changeQuantity(productId, change) {
  const item = cart.get(productId);
  const product = products.find((entry) => entry.id === productId);
  if (!item) return;
  const quantity = item.quantity + change;
  if (quantity <= 0) cart.delete(productId);
  else if (product && quantity <= product.stock) cart.set(productId, { ...item, quantity });
  renderCart();
}

function showPageError(message) {
  const status = document.querySelector("#page-status");
  status.textContent = message;
  status.hidden = false;
}

function showCatalogError(message) {
  const notice = document.querySelector("#catalog-notice");
  notice.textContent = message;
  notice.hidden = false;
  productGrid.replaceChildren();
  emptyResults.textContent = "No se pudo cargar el catálogo.";
  emptyResults.hidden = false;
  resultsCount.textContent = "";
}

function openCart() {
  if (drawer.classList.contains("is-open")) return;
  lastFocusedElement = document.activeElement;
  drawer.removeAttribute("inert");
  drawer.setAttribute("aria-hidden", "false");
  drawerBackdrop.hidden = false;
  requestAnimationFrame(() => {
    drawer.classList.add("is-open");
    drawerBackdrop.classList.add("visible");
    document.querySelector("#close-cart").focus();
  });
  document.body.style.overflow = "hidden";
}

function closeCart() {
  if (!drawer.classList.contains("is-open")) return;
  drawer.classList.remove("is-open");
  drawerBackdrop.classList.remove("visible");
  drawer.setAttribute("aria-hidden", "true");
  drawer.setAttribute("inert", "");
  document.body.style.overflow = "";
  window.setTimeout(() => {
    drawerBackdrop.hidden = true;
    lastFocusedElement?.focus();
  }, 320);
}

async function openCheckout() {
  if (cart.size === 0) return;
  if (activeOrder && !["paid", "unavailable"].includes(activeOrder.order.status)) {
    renderOrderFlow();
    return;
  }
  try {
    await refreshProducts();
    if (document.querySelector("#checkout-button").disabled) return;
    setCheckoutMessage("");
    closeCart();
    checkoutDialog.showModal();
  } catch (error) {
    showPageError(error.message);
  }
}

function renderOrderFlow() {
  const { order } = activeOrder;
  const unavailable = order.status === "unavailable";
  const completed = order.status === "paid";
  const terminal = unavailable || completed;
  const name = order.customerName.split(/\s+/)[0];
  const messages = {
    awaiting_stock_confirmation: {
      title: "Solicitud recibida",
      message: `Hola ${name}, todavía no confirmamos la compra. Esperá el correo de NovaShop que confirma la disponibilidad antes de pagar.`,
      subject: "Recibimos tu solicitud: estamos revisando el stock",
      body: "La disponibilidad se comprobará antes de reservar tus productos. Todavía no se confirmó la compra ni se descontó stock.",
      mark: "✉",
    },
    awaiting_payment: {
      title: "Stock confirmado",
      message: `Hay stock para tu pedido. Elegiste ${order.payment}; ahora podés avanzar con el pago.`,
      subject: "Stock confirmado: tu pedido está listo para pagar",
      body: order.payment === "Transferencia"
        ? "En una tienda real recibirías aquí los datos para transferir. Esta demo no acepta transferencias reales."
        : "En una tienda real coordinaríamos el pago en efectivo. Esta demo no recibe dinero real.",
      mark: "✓",
    },
    paid: {
      title: "Pago confirmado",
      message: "¡Gracias por tu compra! En esta demo, el pedido llegará dentro de las próximas 24 horas.",
      subject: "Pago confirmado: tu pedido llega en 24 hs",
      body: "Tu pago quedó confirmado. Estamos preparando el pedido para que llegue dentro de las próximas 24 horas.",
      mark: "✓",
    },
    unavailable: {
      title: "Stock no disponible",
      message: "No pudimos confirmar las existencias de todos los productos. No se descontó ninguna unidad y no se realizó ningún cobro.",
      subject: "No pudimos confirmar el stock de tu pedido",
      body: "Lo sentimos, el stock cambió antes de confirmar el pedido. Podés volver al catálogo y elegir otros productos.",
      mark: "!",
    },
  };
  const content = messages[order.status];
  if (!content) throw new Error("El pedido tiene un estado desconocido.");

  document.querySelector("#success-title").textContent = content.title;
  document.querySelector("#success-message").textContent = content.message;
  document.querySelector("#success-mark").textContent = content.mark;
  document.querySelector("#email-recipient").textContent = order.customerEmail;
  document.querySelector("#email-subject").textContent = content.subject;
  document.querySelector("#email-body").textContent = content.body;
  document.querySelector("#success-summary").innerHTML = `
    <div class="summary-row"><span>Pedido</span><strong>${escapeHtml(order.id)}</strong></div>
    <div class="summary-row"><span>Medio de pago</span><strong>${escapeHtml(order.payment)}</strong></div>
    <div class="summary-row"><span>Estado</span><strong>${escapeHtml(content.title)}</strong></div>
    <div class="summary-row"><span>Total</span><strong>${money.format(order.total)}</strong></div>`;

  document.querySelector("#continue-pending-shopping").hidden = terminal;
  document.querySelector("#finish-shopping").hidden = !terminal;
  document.querySelector("#close-success").hidden = !terminal;
  const statusMessage = document.querySelector("#order-status-message");
  statusMessage.hidden = !unavailable;
  statusMessage.textContent = unavailable ? content.message : "";
  if (!successDialog.open) successDialog.showModal();
}

function closeSuccess() {
  if (activeOrder && !["paid", "unavailable"].includes(activeOrder.order.status)) return;
  activeOrder = null;
  saveActiveOrder();
  successDialog.close();
}

async function syncActiveOrder() {
  if (syncingActiveOrder || !activeOrder || activeOrder.mode !== "server"
    || ["paid", "unavailable"].includes(activeOrder.order.status)) return;
  syncingActiveOrder = true;
  try {
    const result = await requestJson(`/api/orders/${encodeURIComponent(activeOrder.order.id)}`, {
      headers: { "X-Order-Token": activeOrder.token },
    });
    if (result.order.status !== activeOrder.order.status) {
      activeOrder.order = result.order;
      saveActiveOrder();
      await refreshProducts();
      renderOrderFlow();
    }
  } catch (error) {
    showPageError(`No se pudo actualizar el estado del pedido: ${error.message}`);
  } finally {
    syncingActiveOrder = false;
  }
}

async function restoreActiveOrder() {
  const savedOrder = localStorage.getItem(activeOrderKey);
  if (!savedOrder) return;
  try {
    activeOrder = JSON.parse(savedOrder);
  } catch (error) {
    showPageError(`No se pudo recuperar el pedido guardado (${error.message}).`);
    return;
  }
  if (!activeOrder?.order?.id || !activeOrder.order.status) {
    activeOrder = null;
    saveActiveOrder();
    return;
  }
  if (activeOrder.mode !== "server") {
    activeOrder = null;
    saveActiveOrder();
    return;
  }
  try {
    const result = await requestJson(`/api/orders/${encodeURIComponent(activeOrder.order.id)}`, {
      headers: { "X-Order-Token": activeOrder.token },
    });
    activeOrder.order = result.order;
    saveActiveOrder();
  } catch (error) {
    showPageError(`No se pudo recuperar el estado del pedido: ${error.message}`);
    return;
  }
  renderOrderFlow();
}

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button && !button.disabled) addToCart(button.dataset.add);
});

document.querySelector("#cart-items").addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) {
    changeQuantity(quantityButton.dataset.quantity, Number(quantityButton.dataset.change));
    return;
  }
  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) {
    cart.delete(removeButton.dataset.remove);
    renderCart();
  }
});

document.querySelector(".category-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("selected", chip === button);
  });
  document.querySelectorAll("[data-category-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.categoryLink === activeCategory);
  });
  document.querySelector(".nav-link.active:not([data-category-link])")?.classList.toggle("active", activeCategory === "Todos");
  renderProducts();
});

document.querySelectorAll("[data-category-link]").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelector(`[data-category="${link.dataset.categoryLink}"]`)?.click();
  });
});

document.querySelector("#search-input").addEventListener("input", (event) => {
  searchQuery = event.target.value.trim().toLowerCase();
  renderProducts();
});

document.querySelector("#open-cart").addEventListener("click", async () => {
  try {
    await refreshProducts();
    openCart();
  } catch (error) {
    showPageError(error.message);
  }
});
document.querySelector("#close-cart").addEventListener("click", closeCart);
document.querySelector("#continue-shopping").addEventListener("click", closeCart);
drawerBackdrop.addEventListener("click", closeCart);
document.querySelector("#checkout-button").addEventListener("click", openCheckout);
document.querySelector("#resume-order").addEventListener("click", renderOrderFlow);
document.querySelector("#resume-pending-empty").addEventListener("click", renderOrderFlow);
document.querySelector("#close-checkout").addEventListener("click", () => checkoutDialog.close());

document.querySelector("#checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity() || cart.size === 0) return;

  const formData = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setCheckoutMessage("");
  try {
    if (previewMode) {
      throw new Error("Para enviar pedidos y habilitar confirmaciones privadas, iniciá NovaShop con npm start.");
    }
    const orderRequest = {
      items: [...cart.values()],
      customerName: formData.get("customerName"),
      customerEmail: formData.get("customerEmail"),
      payment: formData.get("payment"),
    };
    const result = await requestJson("/api/orders", {
      method: "POST",
      body: JSON.stringify(orderRequest),
    });
    activeOrder = { mode: "server", token: result.confirmationToken, order: result.order };
    saveActiveOrder();
    checkoutDialog.close();
    cart.clear();
    form.reset();
    renderCart();
    renderOrderFlow();
  } catch (error) {
    if (error.status === 409) {
      await refreshProducts();
      setCheckoutMessage(error.message);
    } else {
      setCheckoutMessage(error.message);
    }
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#close-success").addEventListener("click", closeSuccess);
document.querySelector("#finish-shopping").addEventListener("click", closeSuccess);
document.querySelector("#continue-pending-shopping").addEventListener("click", () => {
  if (activeOrder && !["paid", "unavailable"].includes(activeOrder.order.status)) {
    successDialog.close();
  }
});
successDialog.addEventListener("cancel", (event) => {
  if (activeOrder && !["paid", "unavailable"].includes(activeOrder.order.status)) event.preventDefault();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && drawer.classList.contains("is-open")) closeCart();
});

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
if (window.location.protocol === "file:") {
  showCatalogError("Abrí NovaShop con Live Server para que cargue el catálogo público.");
} else {
  refreshProducts().catch((error) => {
    const message = `No se pudo cargar el catálogo público (${error.message}).`;
    showCatalogError(message);
    showPageError(message);
  }).then(() => restoreActiveOrder());
}

window.setInterval(syncActiveOrder, 5000);
