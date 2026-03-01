import os
import uvicorn
from fastapi import FastAPI, Body
from datetime import datetime
from dotenv import load_dotenv
from functions.requests_functions import send_message_whatsapp_text, send_message_whatsapp_file
from functions.postgres_functions import (
    pendencias,
    cnl,
    perdas,
    perdas_json,
    pendencias_json,
    C12_json,
)

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

@app.get("/pendencias_json")
def pendencias_json_endpoint(token=None,regional: str = 'all'):
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    return pendencias_json(regional)

@app.get("/cnl")
def cnl_query(token=None,regional: str = 'all', dateinit: str = datetime.now().strftime("%d.%m.%Y"), dateend: str = datetime.now().strftime("%d.%m.%Y")):
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    return cnl(regional, dateinit.replace("/", "."), dateend.replace("/", "."))

@app.get("/c12_json")
def c12_json_endpoint(token=None,regional: str = 'all', dateinit: str = datetime.now().strftime("%d.%m.%Y"), dateend: str = datetime.now().strftime("%d.%m.%Y")):
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    return C12_json(regional, dateinit.replace("/", "."), dateend.replace("/", "."))

@app.get("/perdas")
def perdas_query(token=None,regional: str = 'all', dateinit: str = datetime.now().strftime("%d.%m.%Y"), dateend: str = datetime.now().strftime("%d.%m.%Y")):
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    return perdas(regional, dateinit.replace("/", "."), dateend.replace("/", "."))

@app.get("/perdas_json")
def perdas_json_endpoint(token=None,regional: str = 'all', dateinit: str = datetime.now().strftime("%d.%m.%Y"), dateend: str = datetime.now().strftime("%d.%m.%Y")):
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    return perdas_json(regional, dateinit.replace("/", "."), dateend.replace("/", "."))


@app.post("/webhook_perdas")
def webhook_perdas(token=None, body: dict = Body(...)):
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    image_url = list(body['data']['completionData'].values())[0]
    return send_message_whatsapp_file(
        number=os.getenv("WHATSAPP_NUMBER_PERDAS"),
        messageText=f"Perda Recuperada: \\nIN:{body['data']['title']} \\nDESCRIÇÃO: {body['data']['description'].replace('\n', '\\n')}",
        file=image_url
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
