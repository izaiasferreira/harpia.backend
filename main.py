import os
import uvicorn
from fastapi import FastAPI
from datetime import datetime
from dotenv import load_dotenv
from functions.postgres_functions import pendencias, cnl, perdas

load_dotenv()

    

app = FastAPI(title="API Banco", version="1.0.0", debug=True)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/pendencias")
def pendencias_query(token=None,regional: str = 'all', dateinit: str = datetime.now().strftime("%d.%m.%Y"), dateend: str = datetime.now().strftime("%d.%m.%Y")):
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    return pendencias(regional)

@app.get("/cnl")
def cnl_query(token=None,regional: str = 'all', dateinit: str = datetime.now().strftime("%d.%m.%Y"), dateend: str = datetime.now().strftime("%d.%m.%Y")):
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    return cnl(regional, dateinit.replace("/", "."), dateend.replace("/", "."))

@app.get("/perdas")
def perdas_query(token=None,regional: str = 'all', dateinit: str = datetime.now().strftime("%d.%m.%Y"), dateend: str = datetime.now().strftime("%d.%m.%Y")):
    print(os.getenv("API_TOKEN"))
    print(token)
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    return perdas(regional, dateinit.replace("/", "."), dateend.replace("/", "."))


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
