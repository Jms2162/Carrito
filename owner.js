const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const loginPanel = document.querySelector("#login-panel");
const ordersPanel = document.querySelector("#orders-panel");
const loginForm = document.querySelector("#owner-login-form");
const loginStatus = document.querySelector("#login-status");
const ordersStatus = document.querySelector("#orders-status");
const ordersList = document.querySelector("#orders-list");
let renderedOrders = "";

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
    throw new Error("El servidor entregó una respuesta inválida.");
  }
  if (!response.ok) {
    const error = new Error(result.error || "No se pudo completar la solicitud.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function setStatus(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

function orderStatusLabel(status) {
  return ({
    awaiting_stock_confirmation: "Esperando confirmación de stock",
    awaiting_payment: "Esperando confirmación de pago",
    paid: "Pago confirmado",
    unavailable: "Stock no disponible",
  })[status] || status;
}

function renderOrders(orders) {
  const snapshot = JSON.stringify(orders);
  if (snapshot === renderedOrders) return;
  renderedOrders = snapshot;
  if (orders.length === 0) {
    ordersList.innerHTML = '<p class="empty-orders">Todavía no hay pedidos.</p>';
    return;
  }

  ordersList.innerHTML = orders.map((order) => {
    const stockPending = order.status === "awaiting_stock_confirmation";
    const paymentPending = order.status === "awaiting_payment";
    const action = stockPending ? "stock" : paymentPending ? "payment" : "";
    const actionLabel = stockPending
      ? "Confirmar stock y avisar al cliente"
      : paymentPending
        ? "Confirmar pago recibido y avisar al cliente"
        : "";
    const statusClass = order.status === "paid"
      ? "status-paid"
      : order.status === "unavailable"
        ? "status-unavailable"
        : "";
    const items = order.items.map((item) => `
      <li><span>${escapeHtml(item.quantity)} × ${escapeHtml(item.name)}</span><span>${money.format(item.unitPrice * item.quantity)}</span></li>
    `).join("");
    const note = stockPending
      ? "Al confirmar, se comprobará y reservará el stock disponible. Si falta stock, el pedido se marcará como no disponible."
      : paymentPending
        ? `El stock está reservado. Método elegido: ${escapeHtml(order.payment)}. Confirmá solo después de recibir el pago.`
        : order.status === "paid"
          ? "El cliente verá el mensaje de pago confirmado y entrega estimada dentro de 24 horas."
          : "No se descontó stock para este pedido.";

    return `
      <article class="order-card">
        <div class="order-card-header">
          <div>
            <h2>${escapeHtml(order.id)}</h2>
            <p class="order-meta">${escapeHtml(order.customerName)} · ${escapeHtml(order.customerEmail)}<br />${dateFormatter.format(new Date(order.createdAt))} · ${escapeHtml(order.payment)}</p>
          </div>
          <span class="order-status ${statusClass}">${escapeHtml(orderStatusLabel(order.status))}</span>
        </div>
        <ul class="order-items">${items}</ul>
        <div class="order-total"><span>Total</span><span>${money.format(order.total)}</span></div>
        ${action ? `<button class="order-action" type="button" data-order="${escapeHtml(order.id)}" data-action="${action}">${actionLabel}</button>` : ""}
        <p class="order-note">${note}</p>
      </article>`;
  }).join("");
}

async function refreshOrders() {
  const result = await requestJson("/api/owner/orders");
  renderOrders(result.orders);
  setStatus(ordersStatus);
}

async function showOrders() {
  loginPanel.hidden = true;
  ordersPanel.hidden = false;
  try {
    await refreshOrders();
  } catch (error) {
    if (error.status === 401) {
      ordersPanel.hidden = true;
      loginPanel.hidden = false;
      return;
    }
    setStatus(ordersStatus, error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setStatus(loginStatus);
  try {
    const password = new FormData(loginForm).get("password");
    await requestJson("/api/owner/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    loginForm.reset();
    await showOrders();
  } catch (error) {
    setStatus(loginStatus, error.message);
  } finally {
    submitButton.disabled = false;
  }
});

ordersList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-order][data-action]");
  if (!button) return;
  button.disabled = true;
  setStatus(ordersStatus);
  try {
    await requestJson(`/api/owner/orders/${encodeURIComponent(button.dataset.order)}/confirm-${button.dataset.action}`, {
      method: "POST",
    });
    renderedOrders = "";
    await refreshOrders();
    setStatus(ordersStatus, "Estado actualizado. El cliente verá la confirmación simulada en su tienda.");
  } catch (error) {
    setStatus(ordersStatus, error.message);
    button.disabled = false;
    if (error.status === 401) {
      ordersPanel.hidden = true;
      loginPanel.hidden = false;
    }
  }
});

document.querySelector("#owner-logout").addEventListener("click", async () => {
  try {
    await requestJson("/api/owner/logout", { method: "POST", body: JSON.stringify({}) });
    ordersPanel.hidden = true;
    loginPanel.hidden = false;
    renderedOrders = "";
  } catch (error) {
    setStatus(ordersStatus, error.message);
  }
});

async function initialize() {
  try {
    const result = await requestJson("/api/owner/session");
    if (result.authenticated) await showOrders();
    else loginPanel.hidden = false;
  } catch (error) {
    loginPanel.hidden = false;
    setStatus(loginStatus, error.message);
  }
}

initialize();
window.setInterval(() => {
  if (!ordersPanel.hidden) refreshOrders().catch((error) => setStatus(ordersStatus, error.message));
}, 10000);
