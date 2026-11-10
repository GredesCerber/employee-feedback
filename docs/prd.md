<!-- hk:prd status: draft by: - at: - -->
# PRD: Система обратной связи и предложений сотрудников (ГК «Модус Трейд»)

> Черновик плана первого дня. Подробности: [tz-analysis.md](tz-analysis.md), рамки: [manifest.md](manifest.md). Не одобрен: `hk kickoff --apply` создаст задачи только после `status: approved` от капитана.

## Проблема и для кого

Сотрудники не имеют удобного канала, чтобы сообщать о проблемах и предлагать улучшения, а предложения теряются и остаются без видимого результата. Делаем систему, где обращение доходит до ответственного, статус и итог виден автору, а повторяющиеся проблемы видны руководителям.

## Цель первого дня

Агенты всех участников обсуждают суть ТЗ и то, что должно быть в продукте, и на выходе получается продуктовый PRD (`contracts/concept/product-prd.md`, задача T25). Ход: разбор и материалы (E1-E3) → позиции каждого агента (T7, T8, T14, T18) → перекрёстное обсуждение (T21-T24) → граница MVP (T19) → сборка PRD (T25) → сценарий демо (T20).

## Первый день: без кода

Весь первый день посвящён концепции. Задачи дают тексты, схемы, макеты и идеи, продуктовый код не пишется (`out_of_scope` в задачах). Позиции и идеи пишут все четверо по шаблону [ideas/TEMPLATE.md](ideas/TEMPLATE.md), каждый в своей зоне; капитан сводит их в T19 по правилу отклонения манифеста.

## Демо-путь

1. Подача обращения — R1
2. Автоназначение ответственного — R2
3. Статусы и уточнение — R3
4. Решение и мотивированный отказ — R4
5. Фильтры и просроченные — R6
6. Сводка и повторы — R7

## НЕ делаем

Реальные интеграции с 1С и Битрикс24, клиентские опросы и NPS в MVP, продуктовый код в первый день.

## Критерии жюри → как закрываем

| Критерий | Чем закрываем |
|---|---|
| Ценность и бизнес-задача (ТЗ п. 6) | T3, T5, T16, T19 |
| Работа на практике | T6, T9, T20 |
| Развитие и интеграция | T14, T15, T17 |

## Стек

Репозиторий создан со стеком web-node (`hk.config.json → stack`). В первый день стек не используется.

## Команда

```hk-team
GredesCerber: api, contracts, review   # капитан: бэкенд и ревью
punyzxc: web                           # Дамек: фронтенд
Ami-m1nzyi: design                     # Аминат: дизайн, сильные модели GPT
Wohorchik: research                    # Вадим: ресёрч и мелочи
```

## Эпики и задачи

```hk-epic
id: E1
title: Разбор ТЗ и данных
scenario: Команда одинаково понимает ТЗ, датасет, практики и открытые вопросы
demo: Показываем разбор датасета и список вопросов организаторам
```

```hk-epic
id: E2
title: Пользователи и интерфейс
scenario: Есть персоны, карта экранов и макеты, по которым можно провести сценарий демо
demo: Кликаем по макетам шагов 1-6
```

```hk-epic
id: E3
title: Процесс и техническая концепция
scenario: Описаны жизненный цикл обращения, роли, маршрутизация, интеграции и метрики
demo: Показываем диаграмму статусов и матрицу прав
```

```hk-epic
id: E4
title: Обсуждение и идеи команды
scenario: Агент каждого участника изложил суть ТЗ и состав продукта, прочитал позиции коллег и зафиксировал споры
demo: Показываем сводку позиций и спорных вопросов
```

```hk-epic
id: E5
title: Граница MVP и демо
scenario: Зафиксированы MVP и сценарий показа с честными ограничениями
demo: Проходим сценарий на 3 минуты
```

```hk-task
id: T1
title: Каркас концепции: утверждённый манифест и реестр требований
area: contracts
tier: high
risk: high
skeleton: true
paths: [docs/**, contracts/**]
goal: У команды есть утверждённые манифест, разбор ТЗ и общий сценарий демо, на которые ссылаются все остальные задачи
acceptance:
  - Given docs/manifest.md и docs/tz-analysis.md When капитан читает их вместе с ТЗ Then каждое требование R1-R13 имеет ссылку на пункт ТЗ
  - Given сценарий демо в docs/tz-analysis.md When любой участник открывает его Then по шагам понятно, какие экраны и данные нужны
tests: [e2e]
req: [R9, R12]
```

```hk-task
id: T2
title: Разбор датасета: темы, категории, роли, статусы
epic: E1
area: research
tier: mid
paths: [docs/research/dataset-analysis.md]
goal: Команда понимает, что именно лежит в 20 тестовых обращениях и какие категории, роли и статусы из них следуют
acceptance:
  - Given docs/dataset.md When разбираю все обращения A-001..A-020 Then в docs/research/dataset-analysis.md есть таблица по типам, категориям, приоритетам, статусам и условным ответственным
  - Given таблица When ищу повторяющиеся темы Then выделены минимум 3 группы похожих обращений с номерами A-0XX
req: [R1, R2, R6, R7]
```

```hk-task
id: T3
title: Обзор практик: как устроены системы идей и обратной связи
epic: E1
area: research
tier: mid
paths: [docs/research/practices.md]
goal: Команда знает, как это решают другие, и берёт лучшее для MVP без копирования
acceptance:
  - Given открытые источники When сравниваю 4-6 подходов (трекеры идей, helpdesk, порталы предложений) Then в docs/research/practices.md есть таблица: что делают, что берём, что не берём
  - Given обзор When читаю выводы Then для каждого вывода указано, как он влияет на MVP и на какое требование R*
req: [R9]
```

```hk-task
id: T4
title: Вопросы организаторам и реестр допущений
epic: E1
area: research
tier: low
paths: [docs/research/questions.md]
goal: Все неясности ТЗ собраны в один список с допущениями, пока ответов нет
acceptance:
  - Given docs/tz-analysis.md раздел 5 When дополняю его вопросами команды Then в docs/research/questions.md каждый вопрос имеет адресата и допущение
  - Given список When капитан читает его Then вопросы отсортированы по влиянию на MVP
req: [R12]
```

```hk-task
id: T5
title: Персоны и пользовательские сценарии
epic: E2
area: design
tier: mid
after: [T2]
paths: [design/personas/**]
goal: Для сотрудника, руководителя и администратора описаны цели, боли и сценарии
acceptance:
  - Given ТЗ п. 2.2 и датасет When описываю три персоны Then в design/personas/personas.md у каждой есть цель, боль и 2-3 сценария со ссылками на обращения A-0XX
  - Given сценарии When сверяю с манифестом Then каждый сценарий связан с R1-R7
req: [R9]
```

```hk-task
id: T6
title: Карта экранов и логика переходов
epic: E2
area: design
tier: mid
after: [T5]
paths: [design/flows/**]
goal: Есть схема экранов и переходов, по которой можно показать весь сценарий демо
acceptance:
  - Given сценарий демо When рисую карту экранов Then в design/flows/screen-map.md (диаграмма mermaid) есть экраны всех 6 шагов демо
  - Given карта When проверяю роли Then для каждого экрана указано, кто его видит
req: [R10, R5]
```

```hk-task
id: T7
title: Позиция дизайна: суть ТЗ, состав продукта и идеи (Аминат)
epic: E4
area: design
tier: mid
paths: [design/ideas/**]
goal: Агент дизайнера письменно изложил, в чём суть ТЗ и что должно быть в продукте, и предложил идеи, проверенные манифестом
acceptance:
  - Given docs/tz.md, docs/dataset.md и docs/manifest.md When описываю суть ТЗ Then в design/ideas/ami-m1nzyi-position.md есть разделы «Суть ТЗ в 5 предложениях», «Что должно быть в продукте» (список с R* и must/should/could) и «Чего быть не должно»
  - Given шаблон docs/ideas/TEMPLATE.md When оформляю идеи Then в design/ideas/ лежит минимум 3 файла вида ami-m1nzyi-<тема>.md с решением MVP или развитие
req: [R10]
```

```hk-task
id: T8
title: Позиция фронтенда: суть ТЗ, состав продукта и идеи (Дамек)
epic: E4
area: web
tier: mid
paths: [web/concept/ideas/**]
goal: Агент фронтенда письменно изложил, в чём суть ТЗ и что должно быть в продукте, и предложил идеи, проверенные манифестом
acceptance:
  - Given docs/tz.md, docs/dataset.md и docs/manifest.md When описываю суть ТЗ Then в web/concept/ideas/punyzxc-position.md есть разделы «Суть ТЗ в 5 предложениях», «Что должно быть в продукте» (список с R* и must/should/could) и «Чего быть не должно»
  - Given шаблон docs/ideas/TEMPLATE.md When оформляю идеи Then в web/concept/ideas/ лежит минимум 3 файла вида punyzxc-<тема>.md с решением MVP или развитие
req: [R10]
```

```hk-task
id: T9
title: Низкодетальные макеты ключевых экранов
epic: E2
area: web
tier: mid
after: [T6]
paths: [web/concept/wireframes/**]
goal: По карте экранов собраны макеты экранов демо без бизнес-логики
acceptance:
  - Given карта экранов T6 When рисую макеты Then в web/concept/wireframes/ есть макет для каждого из экранов шагов 1-6 демо (картинка или разметка без кода логики)
  - Given макеты When просматриваю переходы Then они совпадают с картой экранов
out_of_scope: [рабочий код, бэкенд]
req: [R10]
```

```hk-task
id: T10
title: Выбор подхода к прототипу и структуре фронтенда
epic: E2
area: web
tier: mid
paths: [web/concept/prototype-approach.md]
goal: Команда решила, как будет устроен интерактивный прототип и что в нём настоящее, а что имитация
acceptance:
  - Given стек репозитория (web-node) When описываю подход Then в web/concept/prototype-approach.md указаны библиотеки, структура и список реального и имитируемого
  - Given подход When сверяю с R12 Then есть честная таблица «реализовано, имитация, план»
req: [R10, R12]
```

```hk-task
id: T11
title: Модель данных и жизненный цикл обращения
epic: E3
area: api
tier: mid
after: [T2]
paths: [api/concept/domain.md]
goal: Описаны сущности, статусы и допустимые переходы обращения
acceptance:
  - Given датасет и ТЗ When проектирую модель Then в api/concept/domain.md есть сущности (обращение, комментарий, категория, пользователь, решение) и их поля
  - Given статусы из датасета When рисую жизненный цикл Then в том же файле диаграмма mermaid с переходами и условиями, включая отказ и уточнение
req: [R2, R3, R4]
```

```hk-task
id: T12
title: Роли, права, конфиденциальность и анонимность
epic: E3
area: api
tier: mid
paths: [api/concept/access.md]
goal: Описано, кто что видит и может, и как работает анонимная подача
acceptance:
  - Given три роли из ТЗ When составляю матрицу Then в api/concept/access.md таблица действие × роль (создать, видеть, править, обработать)
  - Given анонимная подача When описываю её Then указаны назначение, ограничения и влияние на уточнения и уведомления
req: [R5]
```

```hk-task
id: T13
title: Правила маршрутизации и выявление повторяющихся обращений
epic: E3
area: research
tier: mid
after: [T11]
paths: [docs/research/routing.md]
goal: Описано, как обращение находит ответственного и как система замечает повторы
acceptance:
  - Given категории из датасета When описываю правила Then в docs/research/routing.md есть таблица категория → ответственная роль и запасной вариант без назначенного
  - Given повторяющиеся темы из T2 When описываю обнаружение Then указан простой способ (категория и ключевые слова) и пример на 2 обращениях
req: [R2, R7]
```

```hk-task
id: T14
title: Позиция бэкенда: суть ТЗ, состав продукта и идеи (капитан)
epic: E4
area: api
tier: mid
paths: [api/concept/ideas/**]
goal: Агент бэкенда письменно изложил, в чём суть ТЗ и что должно быть в продукте, и предложил идеи, проверенные манифестом
acceptance:
  - Given docs/tz.md, docs/dataset.md и docs/manifest.md When описываю суть ТЗ Then в api/concept/ideas/gredescerber-position.md есть разделы «Суть ТЗ в 5 предложениях», «Что должно быть в продукте» (список с R* и must/should/could) и «Чего быть не должно»
  - Given шаблон docs/ideas/TEMPLATE.md When оформляю идеи Then в api/concept/ideas/ лежит минимум 3 файла вида gredescerber-<тема>.md с решением MVP или развитие
req: [R11]
```

```hk-task
id: T15
title: Интеграции 1С УТ и Битрикс24: описание без реализации
epic: E3
area: research
tier: mid
paths: [docs/research/integrations.md]
goal: Описано, зачем, какие данные и в какую сторону обменивались бы с корпоративными системами
acceptance:
  - Given ТЗ п. 1.2 и 3.4 When описываю интеграции Then в docs/research/integrations.md для каждой есть цель, состав и направление данных и что нужно уточнить
  - Given описание When проверяю по манифесту Then явно сказано, что в MVP это имитация
req: [R11]
```

```hk-task
id: T16
title: Метрики успеха и проверка полезности решения
epic: E3
area: research
tier: mid
paths: [docs/research/metrics.md]
goal: Определено, как поймём, что решение полезно
acceptance:
  - Given показатели из ТЗ п. 2.7 When расписываю метрики Then в docs/research/metrics.md есть определение, формула и пример на синтетических данных для доли рассмотренных, времени до первого ответа и доли с результатом
  - Given метрики When описываю проверку Then есть план пилота: кто, сколько и что измеряем
req: [R7, R9]
```

```hk-task
id: T17
title: Эскиз API-ресурсов без реализации
epic: E3
area: contracts
tier: mid
after: [T11, T12]
paths: [contracts/concept/**]
goal: Есть эскиз ресурсов и операций, чтобы фронт и бэк говорили на одном языке позже
acceptance:
  - Given модель данных T11 и права T12 When описываю ресурсы Then в contracts/concept/api-sketch.md перечислены ресурсы, операции и роли, которым они доступны
  - Given эскиз When проверяю по сценарию демо Then каждый шаг демо покрыт хотя бы одной операцией
req: [R11]
```

```hk-task
id: T18
title: Позиция ресёрча: суть ТЗ, состав продукта и идеи (Вадим)
epic: E4
area: research
tier: low
paths: [docs/research/ideas/**]
goal: Агент ресёрча письменно изложил, в чём суть ТЗ и что должно быть в продукте, и предложил идеи, проверенные манифестом
acceptance:
  - Given docs/tz.md, docs/dataset.md и docs/manifest.md When описываю суть ТЗ Then в docs/research/ideas/wohorchik-position.md есть разделы «Суть ТЗ в 5 предложениях», «Что должно быть в продукте» (список с R* и must/should/could) и «Чего быть не должно»
  - Given шаблон docs/ideas/TEMPLATE.md When оформляю идеи Then в docs/research/ideas/ лежит минимум 3 файла вида wohorchik-<тема>.md с решением MVP или развитие
req: [R13]
```

```hk-task
id: T21
title: Обсуждение позиций коллег: дизайна
epic: E4
area: design
tier: mid
after: [T7, T8, T14, T18]
paths: [design/ideas/discussion-ami-m1nzyi.md]
goal: Агент дизайна прочитал позиции остальных троих и зафиксировал согласия, споры и вопросы
acceptance:
  - Given три чужие позиции When читаю их Then в design/ideas/discussion-ami-m1nzyi.md по каждой указано, с чем согласен, с чем нет и почему, со ссылками на R* и пункты ТЗ
  - Given споры When формулирую их Then каждый спор сведён к вопросу с вариантами ответа для решения капитана
req: [R9]
```

```hk-task
id: T22
title: Обсуждение позиций коллег: фронтенда
epic: E4
area: web
tier: mid
after: [T7, T8, T14, T18]
paths: [web/concept/ideas/discussion-punyzxc.md]
goal: Агент фронтенда прочитал позиции остальных троих и зафиксировал согласия, споры и вопросы
acceptance:
  - Given три чужие позиции When читаю их Then в web/concept/ideas/discussion-punyzxc.md по каждой указано, с чем согласен, с чем нет и почему, со ссылками на R* и пункты ТЗ
  - Given споры When формулирую их Then каждый спор сведён к вопросу с вариантами ответа для решения капитана
req: [R9]
```

```hk-task
id: T23
title: Обсуждение позиций коллег: бэкенда
epic: E4
area: api
tier: mid
after: [T7, T8, T14, T18]
paths: [api/concept/ideas/discussion-gredescerber.md]
goal: Агент бэкенда прочитал позиции остальных троих и зафиксировал согласия, споры и вопросы
acceptance:
  - Given три чужие позиции When читаю их Then в api/concept/ideas/discussion-gredescerber.md по каждой указано, с чем согласен, с чем нет и почему, со ссылками на R* и пункты ТЗ
  - Given споры When формулирую их Then каждый спор сведён к вопросу с вариантами ответа для решения капитана
req: [R9]
```

```hk-task
id: T24
title: Обсуждение позиций коллег: ресёрча
epic: E4
area: research
tier: mid
after: [T7, T8, T14, T18]
paths: [docs/research/ideas/discussion-wohorchik.md]
goal: Агент ресёрча прочитал позиции остальных троих и зафиксировал согласия, споры и вопросы
acceptance:
  - Given три чужие позиции When читаю их Then в docs/research/ideas/discussion-wohorchik.md по каждой указано, с чем согласен, с чем нет и почему, со ссылками на R* и пункты ТЗ
  - Given споры When формулирую их Then каждый спор сведён к вопросу с вариантами ответа для решения капитана
req: [R9]
```

```hk-task
id: T19
title: Сводка идей и граница MVP
epic: E5
area: contracts
tier: high
risk: med
after: [T21, T22, T23, T24, T13, T17]
paths: [contracts/concept/mvp-scope.md]
goal: Капитан свёл идеи всех, применил правило отклонения и зафиксировал границу MVP
acceptance:
  - Given позиции T7, T8, T14, T18 и обсуждения T21-T24 When применяю правило отклонения из манифеста Then в contracts/concept/mvp-scope.md три списка: MVP, развитие, отклонено, у каждой идеи причина
  - Given границу MVP When проверяю по ТЗ Then все must-требования R1-R5, R9-R12 покрыты
req: [R9]
```

```hk-task
id: T25
title: Сборка продуктового PRD по итогам обсуждения
epic: E5
area: contracts
tier: high
risk: med
after: [T19]
paths: [contracts/concept/product-prd.md]
goal: Из позиций, обсуждения и границы MVP собран продуктовый PRD, согласованный с ТЗ
acceptance:
  - Given позиции T7, T8, T14, T18 и обсуждения T21-T24 When собираю PRD Then в contracts/concept/product-prd.md есть разделы: проблема, пользователи, сценарии, функции с приоритетами, MVP и развитие, допущения, метрики, риски
  - Given PRD When сверяю с docs/manifest.md и ТЗ Then каждая функция ссылается на R* и пункт ТЗ, а все решённые споры перечислены с итогом
  - Given PRD When проверяю обязательные результаты ТЗ п. 4.1 Then все шесть пунктов покрыты или явно отнесены к следующему дню
out_of_scope: [код, реализация]
req: [R9, R10, R11, R12]
```

```hk-task
id: T20
title: Сценарий демо и честные ограничения
epic: E5
area: design
tier: mid
after: [T25, T9]
paths: [design/demo/**]
goal: Готов сценарий показа на 3 минуты с разметкой «реализовано, имитация, план»
acceptance:
  - Given граница MVP T19 When пишу сценарий Then в design/demo/demo-script.md есть шаги, реплики и данные из датасета для каждого шага
  - Given сценарий When проверяю по R12 Then каждая функция помечена как реализованная, имитация или план
req: [R12]
```
