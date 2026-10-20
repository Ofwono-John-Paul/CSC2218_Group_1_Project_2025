# Simple Banking App

## Run the application

The project includes an Atlas Bank web dashboard in addition to the FastAPI/Swagger
API. From the repository root, start the server with:

```bash
python -m uvicorn main:app --reload
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser. The dashboard
supports opening accounts, viewing balances and activity, and making deposits or
withdrawals. The API documentation remains available at
[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).
#