# Preflight — за 1–3 дня до хакатона

## Правила
- [ ] Прочитаны правила события: ИИ разрешён? нужно раскрытие? можно ли заранее готовый код?
- [ ] Заполнен `events/event.json`: время старта/конца, `team_members` (GitHub-логины только участников команды)

## Аккаунты и доступы (делают люди, не агенты)
- [ ] Хостинг фронта и бэка, БД, auth-сервис — аккаунты созданы, кто-то из команды имеет доступ
- [ ] Ключи API (LLM, спонсоры) — в общем менеджере паролей, **не в репо**
- [ ] GitHub-организация, у всех участников есть права, Actions включены
- [ ] Репо настроено: `hk github setup` (посмотреть план) → `hk github setup --apply` — защита `main`, переменная `HK_HARNESS`, метки
- [ ] CI может поставить harness: в настройках пакета `@gredescerber/hackathon-harness` (GitHub → Packages → Package settings → Manage Actions access) добавлен репо продукта с доступом Read. Репо не у владельца пакета → секрет `HK_PACKAGES_TOKEN` (PAT с `read:packages`)
- [ ] На тестовом PR появляется статус `hk-guard`: `pending` без ревью, `success` после `hk pr review <n> --verdict approve` от другого агента

## Машины
- [ ] У каждого: `hk doctor` зелёный (node, git, gh авторизован, claude/codex установлены)
- [ ] Windows: `git config --global core.longpaths true` (иначе git падает на длинных путях worktree и `node_modules`)
- [ ] Codex: проект помечен как trusted (иначе он не прочитает `.codex/config.toml`)
- [ ] Claude Code: плагин ECC установлен
- [ ] Проверены лимиты подписок и есть запасные API-ключи

## Сеть и фолбэки
- [ ] У 2+ человек мобильный интернет для раздачи
- [ ] План «что показываем, если всё упало»: записанное видео демо

## Роли людей
- [ ] Product lead (критерии приёмки, скоуп), Architect (контракты), Fleet operator (воркеры, разблокировка, `hk:pause`), Demo owner (демо, E2E, питч)
