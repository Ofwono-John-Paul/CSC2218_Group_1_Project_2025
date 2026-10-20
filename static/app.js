const state = { accounts: [], transactions: [], hidden: false };
const $ = (selector) => document.querySelector(selector);
const money = (value) => `Shs. ${(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Something went wrong");
  return body;
}

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show${error ? " error" : ""}`;
  window.setTimeout(() => { toast.className = "toast"; }, 3200);
}

function openModal(id) { $(`#${id}`).classList.add("open"); }
function closeModals() { document.querySelectorAll(".modal-backdrop").forEach((modal) => modal.classList.remove("open")); }

function showSection(section) {
  document.querySelectorAll(".content-section").forEach((item) => item.classList.toggle("active", item.id === section));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.section === section));
  history.replaceState(null, "", `#${section}`);
  if (section === "activity") renderActivity("#all-activity", state.transactions);
}

function transactionRows(transactions) {
  if (!transactions.length) return `<div class="empty-state"><div class="empty-icon">◌</div><h3>No activity yet</h3><p>Your transactions will appear here.</p></div>`;
  return `<div class="transaction-list">${transactions.slice().reverse().map((transaction) => {
    const incoming = ["deposit", "transfer-in", "interest"].includes(transaction.type);
    return `<div class="transaction"><div class="transaction-main"><div class="transaction-icon">${incoming ? "↙" : "↗"}</div><div><div class="transaction-name">${transaction.type.replace("-", " ")}</div><div class="transaction-date">Balance after ${money(transaction.balance_after)}</div></div></div><div class="amount ${incoming ? "in" : ""}">${incoming ? "+" : "-"}${money(transaction.amount)}</div></div>`;
  }).join("")}</div>`;
}

function renderActivity(selector, transactions) { $(selector).innerHTML = transactionRows(transactions); }

function renderAccounts() {
  const list = $("#account-list");
  if (!state.accounts.length) {
    list.innerHTML = `<div class="activity-card" style="grid-column:1/-1"><div class="empty-state"><div class="empty-icon">＋</div><h3>Your first account is waiting</h3><p>Open an account to see it here.</p><button class="primary-button small" data-open-modal="account-modal">Open account</button></div></div>`;
    return;
  }
  list.innerHTML = state.accounts.map((account) => `<article class="account-card"><div class="account-card-head"><span class="account-type">${account.type}</span><span class="muted">Active</span></div><div class="account-name">${account.account_owner}</div><div class="account-balance">${money(account.balance)}</div><div class="account-id">${account.account_id}</div><div class="account-actions"><button data-action="deposit" data-account="${account.account_id}">Deposit</button><button data-action="withdraw" data-account="${account.account_id}">Withdraw</button></div></article>`).join("");
}

async function refresh() {
  state.accounts = await api("/accounts");
  state.transactions = [];
  for (const account of state.accounts) {
    const transactions = await api(`/accounts/${account.account_id}/transactions`);
    state.transactions.push(...transactions.map((transaction) => ({ ...transaction, account_id: account.account_id })));
  }
  const total = state.accounts.reduce((sum, account) => sum + account.balance, 0);
  $("#total-balance").textContent = state.hidden ? "••••••" : money(total);
  $("#account-count").textContent = state.accounts.length;
  const movement = state.transactions.reduce((sum, transaction) => sum + (["deposit", "transfer-in", "interest"].includes(transaction.type) ? transaction.amount : -transaction.amount), 0);
  $("#month-movement").textContent = money(movement);
  renderAccounts();
  renderActivity("#recent-activity", state.transactions.slice(-5));
  if ($("#activity").classList.contains("active")) renderActivity("#all-activity", state.transactions);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.dataset.openModal) openModal(target.dataset.openModal);
  if (target.hasAttribute("data-close-modal")) closeModals();
  if (target.dataset.section) showSection(target.dataset.section);
  if (target.dataset.sectionLink) { event.preventDefault(); showSection(target.dataset.sectionLink); }
  if (target.dataset.action) {
    $("#action-form").elements.account_id.value = target.dataset.account;
    $("#action-form").elements.action.value = target.dataset.action;
    $("#action-title").textContent = target.dataset.action === "deposit" ? "Deposit money" : "Withdraw money";
    $("#action-description").textContent = target.dataset.action === "deposit" ? "Add money to this account securely." : "Take money out of this account.";
    openModal("action-modal");
  }
});

$("#account-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  data.initial_deposit = Number(data.initial_deposit);
  try { await api("/accounts", { method: "POST", body: JSON.stringify(data) }); event.target.reset(); closeModals(); await refresh(); showToast("Account opened successfully"); } catch (error) { showToast(error.message, true); }
});

$("#action-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const endpoint = `/accounts/${data.account_id}/${data.action}`;
  try { await api(endpoint, { method: "POST", body: JSON.stringify({ amount: Number(data.amount) }) }); event.target.reset(); closeModals(); await refresh(); showToast(`${data.action === "deposit" ? "Deposit" : "Withdrawal"} completed`); } catch (error) { showToast(error.message, true); }
});

$("#toggle-balance").addEventListener("click", () => { state.hidden = !state.hidden; refresh(); });
window.addEventListener("hashchange", () => showSection(location.hash.slice(1) || "overview"));
refresh().catch((error) => showToast(error.message, true));
showSection(location.hash.slice(1) || "overview");
