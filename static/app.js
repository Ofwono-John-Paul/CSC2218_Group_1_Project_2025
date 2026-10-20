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
  list.innerHTML = state.accounts.map((account) => `<article class="account-card"><div class="account-card-head"><span class="account-type">${account.type}</span><span class="muted">Active</span></div><div class="account-name">${account.account_owner}</div><div class="account-balance">${money(account.balance)}</div><div class="account-id">${account.account_id}</div><div class="account-actions"><button data-action="balance" data-account="${account.account_id}">Balance</button><button data-action="deposit" data-account="${account.account_id}">Deposit</button><button data-action="withdraw" data-account="${account.account_id}">Withdraw</button><button data-action="transfer" data-account="${account.account_id}">Transfer</button><button data-action="interest" data-account="${account.account_id}">Interest</button><button data-action="limits" data-account="${account.account_id}">Limits</button><button data-action="notifications" data-account="${account.account_id}">Alerts</button><button data-action="statement" data-account="${account.account_id}">Statement</button><button data-action="logs" data-account="${account.account_id}">Logs</button></div></article>`).join("");
}

function accountLabel(account) {
  return `${account.account_owner} · ${account.type} · ${money(account.balance)}`;
}

function populateTransferAccounts(sourceId) {
  const source = $("#transfer-source");
  const destination = $("#transfer-destination");
  source.innerHTML = state.accounts.map((account) => `<option value="${account.account_id}" ${account.account_id === sourceId ? "selected" : ""}>${accountLabel(account)}</option>`).join("");
  destination.innerHTML = state.accounts.filter((account) => account.account_id !== sourceId).map((account) => `<option value="${account.account_id}">${accountLabel(account)}</option>`).join("");
}

function openSettings(accountId, mode) {
  const form = $("#settings-form");
  $("#settings-title").textContent = mode === "interest" ? "Calculate interest" : mode === "limits" ? "Transaction limits" : "Notification preferences";
  $("#settings-description").textContent = mode === "interest" ? "Apply the current monthly interest rate to this account." : mode === "limits" ? "Set the daily and monthly transaction limits." : "Choose how you want to receive account notifications.";
  if (mode === "interest") {
    form.innerHTML = `<input type="hidden" name="account_id" value="${accountId}"><input type="hidden" name="mode" value="interest"><label>Calculation date<input name="calculationDate" type="date"></label><button class="primary-button full" type="submit">Calculate interest</button>`;
  } else if (mode === "limits") {
    form.innerHTML = `<input type="hidden" name="account_id" value="${accountId}"><input type="hidden" name="mode" value="limits"><label>Daily limit<input name="dailyLimit" type="number" min="0" step="0.01" value="500" required></label><label>Monthly limit<input name="monthlyLimit" type="number" min="0" step="0.01" value="2000" required></label><button class="primary-button full" type="submit">Save limits</button>`;
  } else {
    form.innerHTML = `<input type="hidden" name="account_id" value="${accountId}"><input type="hidden" name="mode" value="notifications"><label>Notification channel<select name="notifyType"><option value="email">Email</option><option value="sms">SMS</option></select></label><div class="account-actions"><button class="primary-button full" type="submit" name="notificationAction" value="subscribe">Subscribe</button><button class="outline-button full" type="submit" name="notificationAction" value="unsubscribe">Unsubscribe</button></div>`;
  }
  openModal("settings-modal");
}

async function showAccountDetails(accountId, mode) {
  const account = state.accounts.find((item) => item.account_id === accountId);
  let content = "";
  if (mode === "statement") {
    const now = new Date();
    const statement = await api(`/accounts/${accountId}/statement?year=${now.getFullYear()}&month=${now.getMonth() + 1}&format=json`);
    content = `<p class="muted">This month's transactions</p>${transactionRows(statement.transactions)}`;
  } else {
    const result = await api(`/accounts/${accountId}/logs`);
    content = result.logs.length ? `<div class="transaction-list">${result.logs.map((log) => `<div class="transaction"><div class="transaction-name">${log}</div></div>`).join("")}</div>` : `<p class="muted">No account logs yet.</p>`;
  }
  $("#details-title").textContent = mode === "statement" ? `${account.type} statement` : "Account logs";
  $("#details-content").innerHTML = content;
  openModal("details-modal");
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
    if (target.dataset.action === "balance") {
      const account = state.accounts.find((item) => item.account_id === target.dataset.account);
      showToast(`${account.account_owner} balance: ${money(account.balance)}`);
      return;
    }
    if (target.dataset.action === "transfer") {
      populateTransferAccounts(target.dataset.account);
      if (!$("#transfer-destination").options.length) { showToast("Open another account before transferring", true); return; }
      openModal("transfer-modal");
      return;
    }
    if (["interest", "limits", "notifications"].includes(target.dataset.action)) {
      openSettings(target.dataset.account, target.dataset.action);
      return;
    }
    if (["statement", "logs"].includes(target.dataset.action)) {
      showAccountDetails(target.dataset.account, target.dataset.action).catch((error) => showToast(error.message, true));
      return;
    }
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

$("#transfer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  data.amount = Number(data.amount);
  try { await api("/accounts/transfer", { method: "POST", body: JSON.stringify(data) }); event.target.reset(); closeModals(); await refresh(); showToast("Transfer completed"); } catch (error) { showToast(error.message, true); }
});

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  try {
    let message = "";
    if (data.mode === "interest") {
      const query = data.calculationDate ? `?calculationDate=${data.calculationDate}` : "";
      const result = await api(`/accounts/${data.account_id}/interest/calculate${query}`, { method: "POST" });
      message = `Interest applied: ${money(result.interest_applied)}`;
    } else if (data.mode === "limits") {
      await api(`/accounts/${data.account_id}/limits`, { method: "PATCH", body: JSON.stringify({ dailyLimit: Number(data.dailyLimit), monthlyLimit: Number(data.monthlyLimit) }) });
      message = "Transaction limits updated";
    } else {
      const action = data.notificationAction;
      await api(`/notifications/${action}`, { method: "POST", body: JSON.stringify({ accountId: data.account_id, notifyType: data.notifyType }) });
      message = action === "subscribe" ? "Notifications enabled" : "Notifications disabled";
    }
    closeModals(); await refresh(); showToast(message);
  } catch (error) { showToast(error.message, true); }
});

$("#toggle-balance").addEventListener("click", () => { state.hidden = !state.hidden; refresh(); });
window.addEventListener("hashchange", () => showSection(location.hash.slice(1) || "overview"));
refresh().catch((error) => showToast(error.message, true));
showSection(location.hash.slice(1) || "overview");
