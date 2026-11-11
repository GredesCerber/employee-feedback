import type { FastifyInstance } from 'fastify';
import { ApiError, identity, invalid, validateBody, visibleComplaint } from './http.js';
import { createTextTranslator, type TargetLocale, type TextTranslator } from './ai/translate.js';

type TranslationRequest = {
  targetLocale: TargetLocale;
  field: 'description' | 'proposedSolution' | 'comment' | 'decision' | 'actions';
  commentId?: string;
};

export function registerTranslations(app: FastifyInstance, translator: TextTranslator = createTextTranslator()) {
  app.post<{ Params: { complaintId: string } }>('/complaints/:complaintId/translations', async request => {
    const user = identity(app, request);
    const item = visibleComplaint(app, request.params.complaintId, user);
    const input = validateBody<TranslationRequest>('TranslationRequest', request.body);
    if (input.field !== 'comment' && input.commentId !== undefined) invalid();
    let text: string | null | undefined;
    switch (input.field) {
      case 'description': text = item.description; break;
      case 'proposedSolution': text = item.proposedSolution; break;
      case 'decision': text = item.decision?.explanation; break;
      case 'actions': text = item.decision?.actions; break;
      case 'comment': text = item.comments.find(comment => comment.id === input.commentId)?.text; break;
    }
    if (!text?.trim() || text.length > 5000) invalid('Выберите доступный текст сообщения длиной до 5000 символов.');
    if (!translator.enabled) throw new ApiError(503, 'TRANSLATION_UNAVAILABLE', 'Перевод сейчас недоступен. Исходное сообщение сохранено.');
    try {
      const translatedText = await translator.translate(text, input.targetLocale);
      return { translatedText, targetLocale: input.targetLocale, source: 'llm' as const };
    } catch {
      throw new ApiError(503, 'TRANSLATION_UNAVAILABLE', 'Перевод сейчас недоступен. Исходное сообщение сохранено.');
    }
  });
}
