<!-- hk:prd status: approved by: GredesCerber at: 2026-11-10T12:36:20Z -->
# PRD: Система обратной связи и предложений сотрудников (ГК «Модус Трейд»)

> Черновик плана первого дня. Подробности: [tz-analysis.md](tz-analysis.md), рамки: [manifest.md](manifest.md). Не одобрен: `hk kickoff --apply` создаст задачи только после `status: approved` от капитана.

## Проблема и для кого

Сотрудники не имеют удобного канала, чтобы сообщать о проблемах и предлагать улучшения, а предложения теряются и остаются без видимого результата. Делаем систему, где обращение доходит до ответственного, статус и итог виден автору, а повторяющиеся проблемы видны руководителям.

## Цель первого дня

Агенты всех участников обсуждают суть ТЗ и то, что должно быть в продукте, и на выходе получается продуктовый PRD (`contracts/concept/product-prd.md`, задача T25). Ход: разбор и материалы (E1-E3) → позиции каждого агента (T7, T8, T14, T18) → перекрёстное обсуждение (T21-T24) → граница MVP (T19) → выбор стека (T32) → сборка PRD (T25) → сценарий демо (T20).

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
punyzxc: web                           # Дамекер: фронтенд
Ami-m1nzyi: design, e2e, infra         # Аминат: дизайн, тесты, запуск; сильные модели GPT
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

```hk-epic
id: E6
title: Бонус: углубление дизайна и подготовка к защите
scenario: Дизайн и защита прорабатываются глубже плана: больше данных, варианты UX, тексты, дизайн-система, вопросы жюри, питч
demo: Показываем варианты подачи, тексты интерфейса и репетицию вопросов жюри
```

```hk-epic
id: E7
title: Реализация MVP (код)
scenario: Работающий MVP на синтетических данных: подача, маршрутизация, статусы, фильтры, сводка, запуск и тест демо-пути
demo: Проходим 6 шагов демо в работающем приложении
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
title: Позиция фронтенда: суть ТЗ, состав продукта и идеи (Дамекер)
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
id: T32
title: Выбор стека и обоснование (после сбора идей)
epic: E5
area: api
tier: high
risk: med
after: [T19]
paths: [api/concept/stack-decision.md]
goal: Стек выбран осознанно после сбора идей, с обоснованием и оценкой влияния на сроки до 13 ноября 14:00
acceptance:
  - Given идеи команды (T7, T8, T14, T18), обсуждение (T21-T24) и граница MVP (T19) When сравниваю варианты (текущий web-node, бэкенд на FastAPI, только кликабельный прототип) Then в api/concept/stack-decision.md есть таблица: вариант, что даёт для демо, риски, влияние на сроки
  - Given сравнение When принимаю решение Then указаны выбранный вариант, причины, что делаем, если не успеем, и что нужно изменить в hk.config.json (это делает капитан)
out_of_scope: [код, реализация, правка hk.config.json]
req: [R11]
```

```hk-task
id: T25
title: Сборка продуктового PRD по итогам обсуждения
epic: E5
area: contracts
tier: high
risk: med
after: [T19, T32]
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

```hk-task
id: T26
title: Расширение синтетического датасета (+40 обращений)
epic: E6
area: design
tier: mid
paths: [design/demo/dataset-extra.md]
goal: Есть больше тестовых данных с редкими случаями для демо и аналитики
acceptance:
  - Given docs/dataset.md When придумываю новые обращения Then в design/demo/dataset-extra.md есть 40 вымышленных обращений в том же формате (A-021..A-060) с типом, категорией, приоритетом, статусом и условным ответственным
  - Given набор When проверяю охват Then есть отказы с объяснением, уточнения, просроченные и повторяющиеся темы, и нет реальных имён, сделок и данных компании
out_of_scope: [код, реализация]
req: [R1, R6, R7]
```

```hk-task
id: T27
title: Три альтернативных варианта подачи обращения
epic: E6
area: design
tier: mid
paths: [design/ideas/submit-variants.md]
goal: Выбран лучший вариант подачи обращения на основе сравнения трёх
acceptance:
  - Given сценарий подачи из docs/tz-analysis.md When описываю три UX-варианта Then в design/ideas/submit-variants.md у каждого есть схема шагов, плюсы, минусы и число действий пользователя
  - Given варианты When проверяю по манифесту Then выбран один с обоснованием и указана связь с R1
out_of_scope: [код, реализация]
req: [R1, R10]
```

```hk-task
id: T28
title: Тексты интерфейса на русском для всех экранов
epic: E6
area: design
tier: mid
after: [T6]
paths: [design/ui-copy/**]
goal: Для каждого экрана демо есть готовые тексты кнопок, подсказок, ошибок и пустых состояний
acceptance:
  - Given карта экранов T6 When пишу тексты Then в design/ui-copy/ui-copy.md для каждого экрана есть заголовки, кнопки, подсказки, сообщения об ошибках и пустое состояние
  - Given тексты When проверяю тон Then они единообразны и понятны сотруднику без обучения
out_of_scope: [код, реализация]
req: [R10]
```

```hk-task
id: T29
title: Набросок дизайн-системы
epic: E6
area: design
tier: mid
after: [T6]
paths: [design/system/**]
goal: Описаны палитра, типографика и компоненты, по которым можно собирать экраны
acceptance:
  - Given карта экранов T6 When описываю систему Then в design/system/design-system.md есть палитра, шрифты, отступы и список компонентов (форма, карточка, статус, фильтр, таблица)
  - Given компоненты When проверяю по экранам Then каждый экран демо собирается из описанных компонентов
out_of_scope: [код, реализация]
req: [R10]
```

```hk-task
id: T30
title: Вопросы жюри и ответы по ТЗ (проверка MVP на прочность)
epic: E6
area: design
tier: mid
paths: [design/demo/jury-qa.md]
goal: Команда заранее знает слабые места решения и ответы на каверзные вопросы
acceptance:
  - Given docs/tz.md и docs/manifest.md When пишу вопросы жюри Then в design/demo/jury-qa.md есть 30 вопросов с ответами и ссылками на пункты ТЗ
  - Given вопросы When сортирую по риску Then отмечены 5 самых опасных вопросов и честные ответы, где мы пока слабы
out_of_scope: [код, реализация]
req: [R9, R12]
```

```hk-task
id: T31
title: Текст питча на 3 минуты и тексты слайдов
epic: E6
area: design
tier: mid
after: [T6]
paths: [design/demo/pitch.md]
goal: Готов черновик выступления по структуре ТЗ
acceptance:
  - Given разбор ТЗ и сценарий демо When пишу питч Then в design/demo/pitch.md есть текст на 3 минуты с разметкой по шагам демо и слайдам
  - Given питч When проверяю по ТЗ п. 6 Then на три ключевых вопроса ТЗ есть явный ответ
out_of_scope: [код, реализация]
req: [R9, R12]
```

```hk-task
id: T33
title: Контракт API обращений (OpenAPI)
epic: E7
area: contracts
tier: mid
paths: [contracts/api.yaml]
goal: Фронт и бэк договорились об API до реализации
acceptance:
  - Given требования R1-R7 When описываю ресурсы Then в contracts/api.yaml валидный OpenAPI с обращениями (создать, получить, список с фильтрами), комментариями, сменой статуса, решением и сводкой
  - Given контракт When проверяю сценарий демо Then каждый из 6 шагов покрыт хотя бы одной операцией, а роли и коды ошибок описаны
tests: [contract]
req: [R1, R2, R3, R4, R5, R6, R7]
```

```hk-task
id: T34
title: Каркас API (Fastify, TypeScript)
epic: E7
area: api
tier: mid
paths: [api/**]
goal: Пустой API собирается, запускается и отвечает на /health
acceptance:
  - Given чистый репозиторий When запускаю npm --prefix api run test Then тесты проходят и есть тест /health
  - Given запущенный API When делаю GET /health Then получаю 200 и версию
out_of_scope: [бизнес-логика обращений]
tests: [unit]
req: [R11]
```

```hk-task
id: T35
title: Хранилище и загрузка синтетических данных
epic: E7
area: api
tier: mid
after: [T34]
paths: [api/**]
goal: API хранит обращения и стартует с демо-данными из датасета
acceptance:
  - Given docs/dataset.md When запускаю загрузку seed Then в хранилище 20 обращений A-001..A-020 с типом, категорией, приоритетом, статусом и ответственным
  - Given перезапуск API When читаю список Then данные на месте или seed повторяется идемпотентно
out_of_scope: [реальные данные]
tests: [unit]
req: [R1, R12]
```

```hk-task
id: T36
title: Подача обращения и маршрутизация по категории
epic: E7
area: api
tier: mid
after: [T33, T35]
paths: [api/**]
goal: Обращение регистрируется и получает ответственного по правилам с запасным вариантом
acceptance:
  - Given валидное обращение When POST /complaints Then 201, номер обращения и статус Новое
  - Given категория с правилом When обращение создано Then назначен ответственный по таблице маршрутизации
  - Given категория без правила When обращение создано Then оно попадает в очередь без ответственного и остаётся видимым руководителю
tests: [unit, contract]
req: [R1, R2]
```

```hk-task
id: T37
title: Статусы, комментарии, уточнения и решение
epic: E7
area: api
tier: mid
after: [T36]
paths: [api/**]
goal: Обращение проходит жизненный цикл с историей, уточнением и мотивированным отказом
acceptance:
  - Given обращение When меняю статус по допустимому переходу Then запись в истории с автором и временем
  - Given недопустимый переход When меняю статус Then 409 с понятной причиной
  - Given запрос уточнения When автор отвечает Then комментарии сохраняются по порядку, а решение или отказ требуют текста объяснения
tests: [unit, contract]
req: [R3, R4]
```

```hk-task
id: T38
title: Список, фильтры, просрочка и сводка
epic: E7
area: api
tier: mid
after: [T36]
paths: [api/**]
goal: Руководитель находит обращения, администратор видит сводку
acceptance:
  - Given набор обращений When фильтрую по подразделению, категории, статусу и сроку Then получаю только подходящие, просроченные помечены
  - Given seed-данные When запрашиваю сводку Then вижу число по типам, долю закрытых, среднее время первого ответа и повторяющиеся темы по категориям
tests: [unit, contract]
req: [R6, R7]
```

```hk-task
id: T39
title: Каркас фронтенда (Vite, React, TypeScript)
epic: E7
area: web
tier: mid
after: [T33]
paths: [web/**]
goal: Фронтенд собирается, имеет роутинг, роли и клиент API
acceptance:
  - Given чистый репозиторий When запускаю npm --prefix web run test Then тесты проходят
  - Given запущенный фронтенд When переключаю роль сотрудник, руководитель, администратор Then меняется набор пунктов меню
out_of_scope: [бизнес-экраны]
tests: [unit]
req: [R5, R10]
```

```hk-task
id: T40
title: Подача обращения, «Мои обращения» и карточка автора
epic: E7
area: web
tier: mid
after: [T39, T36]
paths: [web/**]
goal: Автор подаёт обращение, видит статус и итог
acceptance:
  - Given форма подачи When заполняю тип, категорию и описание Then вижу подтверждение и номер обращения
  - Given мои обращения When открываю карточку Then вижу статус, следующий шаг, историю и итог, включая мотивированный отказ
tests: [unit]
req: [R1, R3, R4, R10]
```

```hk-task
id: T41
title: Очередь руководителя: назначение, статусы, комментарии
epic: E7
area: web
tier: mid
after: [T39, T37, T38]
paths: [web/**]
goal: Руководитель обрабатывает обращения из одной очереди
acceptance:
  - Given очередь When фильтрую по подразделению, категории, статусу и сроку Then вижу подходящие обращения, просроченные помечены текстом и датой
  - Given обращение без ответственного When назначаю его Then оно переходит в обычную очередь, а в истории есть запись
  - Given обращение When запрашиваю уточнение или закрываю решением или отказом Then автор видит результат в своей карточке
tests: [unit]
req: [R2, R3, R4, R6, R10]
```

```hk-task
id: T42
title: Сводка администратора
epic: E7
area: web
tier: mid
after: [T39, T38]
paths: [web/**]
goal: Администратор видит аналитику по обращениям
acceptance:
  - Given seed-данные When открываю сводку Then вижу обращения по типам, долю закрытых и среднее время первого ответа
  - Given повторяющиеся темы When смотрю сводку Then они сгруппированы по категории с числом обращений
tests: [unit]
req: [R7, R10]
```

```hk-task
id: T43
title: Сквозной тест демо-пути
epic: E7
area: e2e
tier: mid
after: [T40, T41, T42]
paths: [tests/e2e/**]
goal: Все 6 шагов демо автоматически проходятся на синтетических данных
acceptance:
  - Given запущенные API и фронтенд When прохожу подачу, назначение, уточнение, решение, фильтры и сводку Then все шаги проходят без ручных действий
  - Given тест When запускаю npm run e2e Then результат воспроизводим на чистой машине по инструкции
tests: [e2e]
req: [R12]
```

```hk-task
id: T44
title: Запуск и деплой: docker-compose и инструкция
epic: E7
area: infra
tier: mid
after: [T40, T41]
paths: [docker-compose.yml, infra/**]
goal: Решение запускается одной командой и может быть выложено на хостинг
acceptance:
  - Given чистая машина с Docker When запускаю docker compose up Then открываются фронтенд и API с демо-данными
  - Given README When следую инструкции Then есть шаги запуска, демо-логины ролей и описание реализованного, имитации и планов
tests: [e2e]
req: [R11, R12]
```
