from flask import Blueprint, request, jsonify, session, Response, stream_with_context
from flask_login import login_required, current_user
from app.services.deepseek_service import DeepSeekService
from app.services.context_service import build_user_context
import logging

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__)

MAX_HISTORY = 8  # trocas (8 user + 8 assistant = 16 msgs enviadas ao modelo)


@chat_bp.route('/chat/stream', methods=['POST'])
@login_required
def stream_response():
    """Endpoint SSE — envia chunks à medida que chegam da DeepSeek."""
    try:
        body = request.get_json(silent=True) or {}
        user_message = body.get('message', '').strip()
        history = body.get('history', [])  # histórico vem do cliente

        if not user_message:
            def err():
                yield 'data: {"error":"empty"}\n\n'
            return Response(err(), content_type='text/event-stream')

        user_context = build_user_context(current_user.id)
        svc = DeepSeekService()

        def generate():
            for chunk in svc.stream_response(user_message, user_context=user_context, history=history):
                yield chunk

        return Response(
            stream_with_context(generate()),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Transfer-Encoding': 'chunked',
            },
        )
    except Exception as e:
        logger.error(f"stream error: {e}")
        def err():
            yield 'data: {"error":"server"}\n\n'
        return Response(err(), content_type='text/event-stream')


@chat_bp.route('/chat/clear', methods=['POST'])
@login_required
def clear_history():
    session.pop('chat_history', None)
    return jsonify({"ok": True})
