import requests
import logging
from flask import current_app

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_BASE = """Você é um assistente especializado em criptomoedas integrado ao CryptoTracker.

Regras de resposta:
- Português brasileiro, direto e objetivo
- Máximo 3 parágrafos OU 5 itens de lista — nunca os dois juntos
- Use os dados reais do contexto abaixo; nunca invente números
- Se não tiver o dado, diga que não tem e oriente de forma geral
- Responda apenas sobre finanças e criptomoedas
- Use markdown: **negrito** para valores, `código` para símbolos, listas quando listar mais de 2 itens
- Não repita o que o usuário disse; vá direto ao ponto

{user_context_block}
"""


class DeepSeekService:
    def __init__(self):
        self.api_key = current_app.config.get('DEEPSEEK_API_KEY')
        self.api_url = current_app.config.get('DEEPSEEK_API_URL')

    def _build_messages(self, user_message: str, user_context: str, history: list) -> list:
        context_block = (
            f"Contexto atual:\n{user_context}"
            if user_context else
            "Contexto atual: nenhum dado disponível."
        )
        system_prompt = SYSTEM_PROMPT_BASE.format(user_context_block=context_block)
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend(history[-16:])  # últimas 8 trocas (16 msgs)
        messages.append({"role": "user", "content": user_message})
        return messages

    def get_bot_response(self, user_message: str, user_context: str = '', history: list = None) -> str:
        """Resposta completa (sem streaming)."""
        payload = {
            "model": "deepseek-chat",
            "messages": self._build_messages(user_message, user_context, history or []),
            "max_tokens": 600,
            "temperature": 0.7,
        }
        try:
            resp = requests.post(
                self.api_url,
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except requests.exceptions.Timeout:
            logger.error("DeepSeek timeout")
            return "O assistente demorou para responder. Tente novamente."
        except requests.exceptions.HTTPError as e:
            logger.error(f"DeepSeek HTTP error: {e}")
            if resp.status_code == 401:
                return "Chave de API inválida. Configure a variável API_DEEPSEEK."
            return "Erro ao se comunicar com o assistente."
        except Exception as e:
            logger.error(f"DeepSeek error: {e}")
            return "Erro inesperado. Tente novamente."

    def stream_response(self, user_message: str, user_context: str = '', history: list = None):
        """Gerador SSE — produz chunks no formato 'data: {...}\\n\\n'."""
        payload = {
            "model": "deepseek-chat",
            "messages": self._build_messages(user_message, user_context, history or []),
            "max_tokens": 600,
            "temperature": 0.7,
            "stream": True,
        }
        try:
            with requests.post(
                self.api_url,
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json=payload,
                stream=True,
                timeout=60,
            ) as resp:
                resp.raise_for_status()
                for raw_line in resp.iter_lines():
                    if not raw_line:
                        continue
                    line = raw_line.decode('utf-8')
                    if not line.startswith('data: '):
                        continue
                    data = line[6:]
                    if data.strip() == '[DONE]':
                        yield 'data: [DONE]\n\n'
                        return
                    yield f'data: {data}\n\n'
        except requests.exceptions.Timeout:
            logger.error("DeepSeek stream timeout")
            yield 'data: {"error":"timeout"}\n\n'
        except requests.exceptions.HTTPError as e:
            logger.error(f"DeepSeek stream HTTP error: {e}")
            yield 'data: {"error":"http"}\n\n'
        except Exception as e:
            logger.error(f"DeepSeek stream error: {e}")
            yield 'data: {"error":"unknown"}\n\n'
