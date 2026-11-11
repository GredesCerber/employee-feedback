// Каталоги интерфейса. Структура ru — образец: en и kk обязаны иметь те же ключи (проверяет тест).
// Множественное число задаётся формами по категориям Intl.PluralRules.

export type Plural = { one: string; few: string; many: string; other: string };

const ru = {
  nav: {
    myComplaints: 'Мои обращения',
    newComplaint: 'Новое обращение',
    queue: 'Очередь обращений',
    dashboard: 'Дашборд',
    summary: 'Сводка',
  },
  language: {
    label: 'Язык',
    ru: 'Русский',
    en: 'English',
    kk: 'Қазақша',
  },
  complaints: {
    count: { one: '{count} обращение', few: '{count} обращения', many: '{count} обращений', other: '{count} обращения' } as Plural,
  },
};

export type Messages = typeof ru;

const en: Messages = {
  nav: {
    myComplaints: 'My complaints',
    newComplaint: 'New complaint',
    queue: 'Complaint queue',
    dashboard: 'Dashboard',
    summary: 'Summary',
  },
  language: {
    label: 'Language',
    ru: 'Русский',
    en: 'English',
    kk: 'Қазақша',
  },
  complaints: {
    count: { one: '{count} complaint', few: '{count} complaints', many: '{count} complaints', other: '{count} complaints' },
  },
};

const kk: Messages = {
  nav: {
    myComplaints: 'Менің өтініштерім',
    newComplaint: 'Жаңа өтініш',
    queue: 'Өтініштер кезегі',
    dashboard: 'Дашборд',
    summary: 'Қорытынды',
  },
  language: {
    label: 'Тіл',
    ru: 'Русский',
    en: 'English',
    kk: 'Қазақша',
  },
  complaints: {
    count: { one: '{count} өтініш', few: '{count} өтініш', many: '{count} өтініш', other: '{count} өтініш' },
  },
};

export const catalogs: Record<'ru' | 'en' | 'kk', Messages> = { ru, en, kk };
