# Жизненный цикл обращения

> Задача #108. Переходы взяты из `x-status-transitions` в `contracts/api.yaml`; приёмочный тест `tests/acceptance/108-diagrams.test.mjs` разбирает эту схему и сравнивает её с контрактом.

**Подпись:** Статусы обращения и разрешённые переходы между ними по контракту API.

```mermaid
stateDiagram-v2
  state "Новое" as new
  state "На рассмотрении" as in_review
  state "Ожидает уточнения" as awaiting_clarification
  state "В работе" as in_progress
  state "Реализовано" as implemented
  state "Отклонено" as rejected
  state "Закрыто" as closed

  [*] --> new: подача

  new --> in_review
  new --> awaiting_clarification
  new --> rejected

  in_review --> in_progress
  in_review --> awaiting_clarification
  in_review --> implemented
  in_review --> rejected
  in_review --> closed

  in_progress --> in_review
  in_progress --> awaiting_clarification
  in_progress --> implemented
  in_progress --> rejected
  in_progress --> closed

  awaiting_clarification --> in_review: ответ автора

  implemented --> [*]
  rejected --> [*]
  closed --> [*]
```

**Что сказать на слайде:** У обращения семь статусов, и три из них конечные: реализовано, отклонено и закрыто. Из уточнения обращение всегда возвращается на рассмотрение, а закрыть его можно только с записанным итогом, поэтому автор не остаётся без ответа.

## Пояснения

- Конечные статусы (`implemented`, `rejected`, `closed`) переходов не имеют.
- Из статуса «Новое» нельзя сразу перейти в «Реализовано» или «Закрыто»: сначала рассмотрение.
- «Ожидает уточнения» ведёт только в «На рассмотрении»: после ответа автора обращение возвращается руководителю.
- Итог (реализовано, отклонено, закрыто) записывается решением с объяснением (`POST /complaints/{complaintId}/decision`).
