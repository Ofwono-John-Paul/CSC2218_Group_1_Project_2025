from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from domain.entities.account_type import AccountType
from domain.entities.transaction_type import TransactionType
from uuid import uuid4
from typing import List
from datetime import datetime
import sys

# Check Python SSL support
try:
    import ssl
except ImportError:
    print("ERROR: Python SSL module is missing. Please install Python with SSL support.", file=sys.stderr)
    raise

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

# In-memory databases
accounts = {}
transactions = {}
notification_subscriptions = {}
logs = []
account_limits = {}
interest_rate = 0.02  # 2% annual interest

# Models
class AccountCreateRequest(BaseModel):
    account_type: str
    initial_deposit: float
    owner_name: str

class TransactionRequest(BaseModel):
    amount: float

class Transaction(BaseModel):
    type: str
    amount: float
    balance_after: float

class TransferRequest(BaseModel):
    sourceAccountId: str
    destinationAccountId: str
    amount: float

class NotificationRequest(BaseModel):
    accountId: str
    notifyType: str  # e.g., email, sms

# Helper logging function
def log_event(event: str):
    logs.append(event)

# Browser application
@app.get("/", include_in_schema=False)
def serve_dashboard():
    return FileResponse("static/index.html")

# Account overview
@app.get("/accounts")
def list_accounts():
    return [
        {
            "account_id": account_id,
            "type": account["type"],
            "balance": account["balance"],
            "account_owner": account["owner_name"],
        }
        for account_id, account in accounts.items()
    ]

# Create Account
@app.post("/accounts")
def create_account(request: AccountCreateRequest):
    account_id = str(uuid4())
    accounts[account_id] = {
        "type": request.account_type,
        "balance": request.initial_deposit,
        "owner_name": request.owner_name
    }
    transactions[account_id] = [
        Transaction(type="deposit", amount=request.initial_deposit, balance_after=request.initial_deposit)
    ]
    log_event(f"Created account {account_id} for {request.owner_name} with balance {request.initial_deposit}")
    return {
        "account_id": account_id,
        "type": request.account_type,
        "balance": request.initial_deposit,
        "account_owner": request.owner_name
    }

# Deposit
@app.post("/accounts/{account_id}/deposit")
def deposit(account_id: str, request: TransactionRequest):
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    accounts[account_id]["balance"] += request.amount
    new_balance = accounts[account_id]["balance"]
    transactions[account_id].append(
        Transaction(type="deposit", amount=request.amount, balance_after=new_balance)
    )
    log_event(f"Deposit of {request.amount} to {account_id}; new balance: {new_balance}")
    return {"message": "Deposit successful", "balance": new_balance}

# Withdraw
@app.post("/accounts/{account_id}/withdraw")
def withdraw(account_id: str, request: TransactionRequest):
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    if request.amount > accounts[account_id]["balance"]:
        raise HTTPException(status_code=400, detail="Insufficient funds")
    accounts[account_id]["balance"] -= request.amount
    new_balance = accounts[account_id]["balance"]
    transactions[account_id].append(
        Transaction(type="withdraw", amount=request.amount, balance_after=new_balance)
    )
    log_event(f"Withdrawal of {request.amount} from {account_id}; new balance: {new_balance}")
    return {"message": "Withdrawal successful", "balance": new_balance}

# Get Account Balance
@app.get("/accounts/{account_id}/balance")
def get_balance(account_id: str):
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"balance": accounts[account_id]["balance"]}

# Get Transaction History
@app.get("/accounts/{account_id}/transactions", response_model=List[Transaction])
def get_transaction_history(account_id: str):
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    return transactions[account_id]

# Fund Transfer
@app.post("/accounts/transfer")
def transfer_funds(request: TransferRequest):
    source = request.sourceAccountId
    dest = request.destinationAccountId
    amount = request.amount

    if source not in accounts or dest not in accounts:
        raise HTTPException(status_code=404, detail="Source or destination account not found")
    if accounts[source]["balance"] < amount:
        raise HTTPException(status_code=400, detail="Insufficient funds in source account")

    accounts[source]["balance"] -= amount
    accounts[dest]["balance"] += amount

    transactions[source].append(
        Transaction(type="transfer-out", amount=amount, balance_after=accounts[source]["balance"])
    )
    transactions[dest].append(
        Transaction(type="transfer-in", amount=amount, balance_after=accounts[dest]["balance"])
    )

    log_event(f"Transferred {amount} from {source} to {dest}")
    return {"message": "Transfer successful", "from": source, "to": dest, "amount": amount}

# Subscribe to Notifications
@app.post("/notifications/subscribe")
def subscribe_notification(request: NotificationRequest):
    notification_subscriptions[request.accountId] = request.notifyType
    log_event(f"Account {request.accountId} subscribed to {request.notifyType} notifications")
    return {"message": f"Subscribed to {request.notifyType} notifications."}

# Unsubscribe from Notifications
@app.post("/notifications/unsubscribe")
def unsubscribe_notification(request: NotificationRequest):
    if request.accountId in notification_subscriptions:
        del notification_subscriptions[request.accountId]
        log_event(f"Account {request.accountId} unsubscribed from notifications")
        return {"message": "Unsubscribed from notifications."}
    raise HTTPException(status_code=404, detail="No subscription found for this account.")

# View All Logs
@app.get("/logs/transactions")
def get_all_logs():
    return {"logs": logs}

# View Logs for Specific Account
@app.get("/accounts/{account_id}/logs")
def get_account_logs(account_id: str):
    account_logs = [log for log in logs if account_id in log]
    return {"logs": account_logs}

# Interest Calculation
@app.post("/accounts/{account_id}/interest/calculate")
def calculate_interest(account_id: str, calculationDate: str = None):
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        date = datetime.strptime(calculationDate, "%Y-%m-%d") if calculationDate else datetime.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    balance = accounts[account_id]["balance"]
    interest = balance * (interest_rate / 12)
    accounts[account_id]["balance"] += interest

    transactions[account_id].append(
        Transaction(type="interest", amount=interest, balance_after=accounts[account_id]["balance"])
    )
    log_event(f"Interest of {interest:.2f} applied to {account_id} on {date.date()}; new balance: {accounts[account_id]['balance']:.2f}")
    return {
        "account_id": account_id,
        "interest_applied": round(interest, 2),
        "calculation_date": date.date(),
        "new_balance": round(accounts[account_id]['balance'], 2)
    }

# Update Limits
@app.patch("/accounts/{account_id}/limits")
def update_limits(account_id: str, limits: dict):
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    account_limits[account_id] = {
        "dailyLimit": limits.get("dailyLimit", 500),
        "monthlyLimit": limits.get("monthlyLimit", 2000)
    }
    log_event(f"Updated limits for {account_id}: {account_limits[account_id]}")
    return {"message": "Limits updated", "limits": account_limits[account_id]}

# Retrieve Limits
@app.get("/accounts/{account_id}/limits")
def get_limits(account_id: str):
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"limits": account_limits.get(account_id, {"dailyLimit": 500, "monthlyLimit": 2000})}

# Monthly Statements
@app.get("/accounts/{account_id}/statement")
def get_monthly_statement(account_id: str, year: int, month: int, format: str = "json"):
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    monthly_transactions = [
        t for t in transactions[account_id]
        if isinstance(t, Transaction) and datetime.today().month == month and datetime.today().year == year
    ]
    if format == "json":
        return {"account_id": account_id, "month": month, "year": year, "transactions": monthly_transactions}
    elif format == "csv":
        csv_data = "type,amount,balance_after\n" + "\n".join(
            f"{t.type},{t.amount},{t.balance_after}" for t in monthly_transactions
        )
        return JSONResponse(content={"csv": csv_data})
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'json' or 'csv'.")
