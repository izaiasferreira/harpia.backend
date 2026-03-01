import os
import requests
from dotenv import load_dotenv
load_dotenv()

def send_message_whatsapp_text(number, messageText):
    try:
        url = os.getenv("WHATSAPP_LINK_SEND_TEXT")
        headers = {
                'Content-Type': 'application/json'
            }
                
        body = {
            "number": number,
            "message": messageText
        }
            
        requests.post(
            url,
            headers=headers,
            json=body
        )
        
        return {'status': 'success'}
        
    except Exception as error:
        print(f'Erro geral: {error}', flush=True)
        return None


def send_message_whatsapp_file(number, messageText, file):
    try:
        url = os.getenv("WHATSAPP_LINK_SEND_FILES")
        headers = {
                'Content-Type': 'application/json'
        }
                
        body = {
            "number": number,
            "message": messageText,
            "file": file
        }

        print(f"URL: {url}")
        print(f"Body: {body}")
            
        response = requests.post(
            url,
            headers=headers,
            json=body
        )

        if response.status_code != 200:
            print(f'Erro geral: {response.text}', flush=True)
            return {'status': 'error'}
        
        return response.json()
        
    except Exception as error:
        print(f'Erro geral: {error}', flush=True)
        return None
        