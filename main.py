from functions.postgres_functions import save_revalidate_file
from functions.postgres_functions import get_files_for_revalidate
import os
import uvicorn
import urllib.parse
from fastapi import FastAPI, Body, HTTPException
from fastapi.responses import FileResponse, JSONResponse
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


# Endpoints de consultas
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


# Webhooks
@app.post("/webhook_perdas")
def webhook_perdas(token=None, body: dict = Body(...)):
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}

    print(body)
    if body['event'] == 'service.completed':
        image_url = list(body['data']['completionData'].values())[0]
        return send_message_whatsapp_file(
            number=os.getenv("WHATSAPP_NUMBER_PERDAS"),
            messageText=f"Perda Recuperada: \\nIN:{body['data']['title']} \\nDESCRIÇÃO: {body['data']['description'].replace('\n', '\\n')}",
            file=image_url
        )
    return {"error": "Evento inválido"}

# Endpoint para revalidação de fotos
@app.get("/files_for_revalidate")
def serve_public_files(token=None):
    
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    
    return get_files_for_revalidate()

@app.post("/revalidate_file")
def revalidate_file(token=None, body: dict = Body(...)):
    
    if token != os.getenv("API_TOKEN"):
        return {"error": "Token inválido"}
    
    return save_revalidate_file(body['instalacao'], body['data'], body['validation'])

# Endpoint para servir arquivos
root = os.environ.get("FILES_ROOT", os.path.join(os.path.dirname(__file__), "public"))
root_abs = os.path.abspath(root)
os.makedirs(root_abs, exist_ok=True)

@app.get("/")
@app.get("/{file_path:path}")
def serve_public_files(file_path: str = ""):
    if not file_path:
        return JSONResponse(
            status_code=404, 
            content={"detail": "Seja bem vindo. Você não especificou um arquivo."}
        )
    
    path = urllib.parse.unquote(file_path)
    safe = os.path.normpath(path).lstrip("\\/")
    requested = os.path.abspath(os.path.join(root_abs, safe))
    
    if not requested.startswith(root_abs):
        requested = root_abs
        
    if os.path.isfile(requested):
        return FileResponse(requested)
    return JSONResponse(status_code=404, content={"detail": "Arquivo não encontrado."})


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
