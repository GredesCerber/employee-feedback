import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { ApiError } from '../api/client';
import { errorMessage, requireData, useResource } from '../features/data';
import { LoadError } from '../features/complaint';
import type { Complaint } from '../features/complaint';

export default function SubmitPage() {
  const { api } = useSession();
  const load = useCallback(async () => requireData((await api.GET('/reference-data')).data), [api]);
  const reference = useResource(load);
  const [type, setType] = useState<Complaint['type']>('problem');
  const [categoryId, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [solution, setSolution] = useState('');
  const [attachment, setAttachment] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [created, setCreated] = useState<Complaint>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const nextErrors: Record<string, string> = {};
    if (!categoryId) nextErrors.categoryId = 'Выберите категорию.';
    if (!description.trim()) nextErrors.description = 'Опишите проблему или предложение.';
    setErrors(nextErrors); setFailure('');
    if (Object.keys(nextErrors).length) return;
    lock.current = true; setBusy(true);
    try {
      const result = await api.POST('/complaints', { body: {
        type, categoryId, description: description.trim(),
        ...(solution.trim() ? { proposedSolution: solution.trim() } : {}),
        ...(attachment ? { attachments: [{ name: 'sample-request.txt', mediaType: 'text/plain', sizeBytes: 120, isPlaceholder: true }] } : {}),
      } });
      setCreated(requireData(result.data));
    } catch (error) {
      setFailure(errorMessage(error));
      if (error instanceof ApiError) setErrors(Object.fromEntries((error.details ?? []).map(item => [item.field, item.message])));
    } finally { lock.current = false; setBusy(false); }
  }

  if (created) return <section className="section">
    <p className="eyebrow">Отправлено</p><h1>Обращение зарегистрировано</h1>
    <p className="registration-number">{created.number}</p><p>{created.nextAction}</p>
    <div className="actions"><Link className="primary-link" to={`/my/${created.id}`}>Открыть обращение</Link><Link to="/my">К моим обращениям</Link></div>
  </section>;

  return <section className="section"><p className="eyebrow">Обратная связь</p><h1>Новое обращение</h1>
    <p className="muted">Сообщите о проблеме или предложите улучшение. Обращение видят вы, руководители и администраторы.</p>
    {reference.loading && <p role="status">Загрузка категорий…</p>}
    {reference.error && <LoadError message={reference.error} retry={reference.reload} />}
    {reference.data && <form onSubmit={submit} noValidate className="complaint-form">
      <label htmlFor="complaint-type">Тип обращения</label><select id="complaint-type" value={type} onChange={event => setType(event.target.value as Complaint['type'])}><option value="problem">Проблема</option><option value="suggestion">Предложение</option><option value="praise">Благодарность</option></select>
      <label htmlFor="category">Категория</label><select id="category" value={categoryId} onChange={event => setCategory(event.target.value)} required aria-invalid={Boolean(errors.categoryId)} aria-describedby={errors.categoryId ? 'category-error' : undefined}><option value="">Выберите категорию</option>{reference.data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      {errors.categoryId && <p id="category-error" className="field-error">{errors.categoryId}</p>}
      <label htmlFor="description">Описание</label><textarea id="description" value={description} onChange={event => setDescription(event.target.value)} rows={5} maxLength={5000} required aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'description-error' : undefined} />
      {errors.description && <p id="description-error" className="field-error">{errors.description}</p>}
      <label htmlFor="solution">Предлагаемое решение <span className="optional">(необязательно)</span></label><textarea id="solution" value={solution} onChange={event => setSolution(event.target.value)} rows={3} maxLength={5000} />
      <label className="checkbox-label"><input type="checkbox" checked={attachment} onChange={event => setAttachment(event.target.checked)} />Добавить тестовое вложение</label>
      <p className="field-hint">Файл-заглушка sample-request.txt: сохраняются только название, тип и размер, содержимое не загружается.</p>
      {failure && <p role="alert" className="field-error">{failure}</p>}
      <button className="primary-button" disabled={busy} type="submit">{busy ? 'Отправка…' : 'Отправить обращение'}</button>
    </form>}
  </section>;
}
