/**
 * «Что нового» (/updates): the history of the updates of Loader3D for signed-in users, newest first.
 *
 * Every change users can notice adds a line here in the same pull request, with the date of the deploy:
 * a new release at the top, or one more change in today's release. Texts are for users — what they can do
 * now, not how it was built. A change that only makes sense with tiers (TIERS_ENABLED) is marked `tiers`.
 *
 * Which releases a user has not seen is kept in the account (`Settings.updatesSeen`, the id of the newest
 * release they saw); releases from before the account was created are never «new» for it.
 */

export type ChangeKind = 'new' | 'improved' | 'fixed';

export interface Change {
  kind: ChangeKind;
  text: string;
  /** Shown only with tiers on: the tariffs, their limits and payment. */
  tiers?: boolean;
}

export interface Release {
  /** The date, «2026-11-21»; a second release on the same day — «2026-11-21.2». Ids sort like the releases. */
  id: string;
  title: string;
  changes: readonly Change[];
}

export const CHANGE_KINDS: Record<ChangeKind, { label: string; filter: string }> = {
  new: { label: 'Новое', filter: 'Новое' },
  improved: { label: 'Улучшение', filter: 'Улучшения' },
  fixed: { label: 'Исправление', filter: 'Исправления' },
};

export const RELEASES: readonly Release[] = [
  {
    id: '2026-11-24.2',
    title: 'Нагрузка на оси',
    changes: [
      {
        kind: 'new',
        text: 'Нагрузка на оси прямо в редакторе: сколько приходится на переднюю и ведущую ось тягача, на оси полуприцепа, грузовика и прицепа, сколько допустимо и где перегруз. Значок «Оси» под сценой краснеет, как только какая-то ось перегружена.',
      },
      {
        kind: 'new',
        text: 'Данные своей машины: число осей, где они стоят, порожняя масса и допустимая нагрузка — по кнопке «Нагрузка на оси» в карточке транспорта. Они сохраняются в схеме.',
      },
      { kind: 'improved', text: 'В PDF-отчёте — таблица нагрузок на оси, а о перегрузе предупреждает первая страница.' },
      {
        kind: 'improved',
        text: 'Оси у шаблонов — как у настоящих машин: еврофура, мега и рефрижератор с тягачом 4×2, сцепка, контейнеровозы 20′ и 40′, грузовик и фургон. Колёса в 3D стоят там же, где оси в расчёте, а меняются вместе с ними.',
      },
      { kind: 'improved', text: 'Под сценой у каждой оси видна её нагрузка и допустимое, с полоской заполнения — как у кузова.' },
      { kind: 'improved', text: 'Приложение по умолчанию светлое; тёмную тему можно включить в шапке или в аккаунте.' },
      { kind: 'fixed', text: 'Оси нельзя поставить туда, где их не бывает: рулевая — под кабиной, остальные — под кузовом и не друг на друге.' },
      { kind: 'fixed', text: 'Схема из калькулятора получает оси выбранной машины — такие же, как у её шаблона в редакторе.' },
      {
        kind: 'improved',
        text: '«Попробовать в 3D» в калькуляторе нагрузки на оси открывает схему с вашим грузом по группам и с данными вашего тягача и полуприцепа — «Нагрузка на оси» в редакторе показывает те же цифры, что и калькулятор.',
      },
      {
        kind: 'fixed',
        text: 'Ссылка, которая создаёт схему из калькулятора или демо, открытая не из Loader3D, сначала спрашивает, добавлять ли схему в ваш аккаунт.',
      },
      {
        kind: 'improved',
        text: 'Новая главная страница: светлая, с переключателем на тёмную, а шаги «от заявки до схемы» листаются прокруткой.',
      },
    ],
  },
  {
    id: '2026-11-24',
    title: 'Демо редактора на главной',
    changes: [
      {
        kind: 'new',
        text: 'На главной странице появилось демо редактора: с компьютера коллеги и партнёры могут без регистрации перетащить груз, разложить кузов автозагрузкой и сделать PDF. Если потом зарегистрируются, схема из демо сохранится в их аккаунте.',
      },
    ],
  },
  {
    id: '2026-11-23.2',
    title: 'Бесплатные калькуляторы',
    changes: [
      {
        kind: 'new',
        text: 'На сайте появились бесплатные калькуляторы: сколько паллет встанет в еврофуру, контейнер и газель, погрузочные метры (LDM), нагрузка на оси, объём груза и размеры кузовов. Их можно открыть без входа и поделиться ссылкой с коллегой.',
      },
      {
        kind: 'new',
        text: 'Кнопка «Попробовать в 3D» в калькуляторе создаёт схему с тем же кузовом и грузом: паллеты уже стоят в кузове так, как их посчитал калькулятор.',
      },
    ],
  },
  {
    id: '2026-11-23',
    title: 'Оплата «Pro» в аккаунте',
    changes: [
      {
        kind: 'new',
        text: '«Pro» можно оплатить прямо в аккаунте по СБП — на месяц или сразу на год. Тариф подключается сразу после оплаты, без заявок и ожидания.',
        tiers: true,
      },
    ],
  },
  {
    id: '2026-11-22',
    title: 'Тариф обновляется сразу',
    changes: [
      {
        kind: 'fixed',
        text: 'Тариф в приложении меняется сразу, без перезагрузки страницы: когда заканчивается срок «Pro» и когда оплата прошла в другой вкладке.',
        tiers: true,
      },
      { kind: 'fixed', text: 'Бессрочный «Pro» больше не предлагается продлить: оплата не сократит его до месяца.', tiers: true },
    ],
  },
  {
    id: '2026-11-21',
    title: 'История обновлений и плавный редактор',
    changes: [
      { kind: 'new', text: 'Раздел «Что нового»: здесь видно, как меняется Loader3D, а о свежих обновлениях напомнит отметка в шапке.' },
      { kind: 'improved', text: 'Камера вращается плавно, без подтормаживаний.' },
      { kind: 'improved', text: 'Список грузов быстрее откликается на правки: перерисовываются только изменённые строки.' },
      { kind: 'fixed', text: 'Открытая вкладка больше не остаётся на старой версии сайта после обновления.' },
      { kind: 'fixed', text: 'Шапка приложения больше не теснится на планшетах и небольших ноутбуках: всё помещается в одну строку.' },
    ],
  },
  {
    id: '2026-11-20',
    title: 'Аккаунт в новом виде',
    changes: [
      { kind: 'new', text: 'Страница «Тариф и оплата»: текущий тариф, его срок и сколько из лимитов уже занято.', tiers: true },
      { kind: 'improved', text: 'Аккаунт стал списком настроек: профиль, пароль, устройства и тема — каждое в своём разделе.' },
      { kind: 'improved', text: 'Смена пароля и удаление аккаунта подтверждаются кодом из письма: одного пароля для этого мало.' },
      { kind: 'improved', text: 'Перед выходом из аккаунта сайт спрашивает подтверждение.' },
      { kind: 'fixed', text: 'Колёса машин больше не наезжают друг на друга: оси расставляются по длине кузова.' },
    ],
  },
  {
    id: '2026-11-19',
    title: 'Письма с нашего адреса',
    changes: [
      { kind: 'improved', text: 'Письма с кодами подтверждения приходят с собственного почтового сервера Loader3D.' },
      { kind: 'new', text: 'Поддержка на связи по адресу support@loader3d.pro и в Telegram.' },
    ],
  },
  {
    id: '2026-11-16',
    title: 'Режимы отображения',
    changes: [
      { kind: 'new', text: 'Готовые режимы отображения — «Только рёбра» и другие — и окно настроек с живым образцом машины.' },
      { kind: 'new', text: 'Забытый пароль можно восстановить по коду из письма.' },
      { kind: 'improved', text: 'Настройки отображения открываются быстрее, кнопка для них появилась на панели камеры.' },
      { kind: 'improved', text: 'Число попыток входа ограничено: подобрать пароль к аккаунту не получится.' },
    ],
  },
  {
    id: '2026-11-15',
    title: 'Тёмная тема и подробные машины',
    changes: [
      { kind: 'new', text: 'Светлая и тёмная темы — переключатель в шапке, выбор сохраняется в аккаунте.' },
      { kind: 'new', text: 'Подробные машины: европейская кабина, настоящие колёса, оборудование прицепа.' },
      { kind: 'new', text: 'Свободная длина от последнего груза до задних дверей видна прямо в сцене.' },
      { kind: 'new', text: 'На карточках схем — настоящие превью погрузки.' },
      { kind: 'improved', text: 'Панель грузов можно спрятать и вернуть, на больших экранах она шире.' },
      { kind: 'improved', text: 'Email подтверждается шестизначным кодом из письма.' },
      { kind: 'fixed', text: 'Детали машин больше не висят в воздухе.' },
    ],
  },
  {
    id: '2026-11-07',
    title: 'Закреплённые грузы и «мосты»',
    changes: [
      { kind: 'new', text: 'Закреплённый груз не сдвинуть ни мышью, ни автозагрузкой — как и то, на чём он стоит.' },
      { kind: 'new', text: 'Режим просмотра: схему можно вращать и разглядывать, не боясь случайно сдвинуть груз.' },
      { kind: 'new', text: '«Мосты»: груз можно положить на два других и задвинуть под него ещё один.' },
      { kind: 'improved', text: 'Настройки отображения хранятся в аккаунте и одинаковы на всех устройствах.' },
      { kind: 'new', text: 'Тарифы «Старт», «Pro» и «Индивидуальный».', tiers: true },
    ],
  },
  {
    id: '2026-10-26',
    title: 'Длина загрузки в сцене',
    changes: [
      { kind: 'new', text: 'Длина загрузки каждого кузова показана прямо в 3D-сцене.' },
      { kind: 'fixed', text: 'Вход больше не слетает, когда сайт открыт в нескольких вкладках.' },
    ],
  },
  {
    id: '2026-10-20',
    title: 'Несколько машин и рентген',
    changes: [
      { kind: 'new', text: 'Несколько машин в одной схеме — с общим доком или своим у каждой.' },
      { kind: 'new', text: 'Грузы можно кантовать: класть на бок и ставить на торец.' },
      { kind: 'new', text: 'Рентген: грузы, закрывающие выбранный, становятся прозрачными.' },
    ],
  },
  {
    id: '2026-10-19',
    title: 'План погрузки в PDF',
    changes: [{ kind: 'new', text: 'План погрузки выгружается в PDF: виды сбоку и сверху, список грузов и порядок погрузки по шагам.' }],
  },
  {
    id: '2026-10-17',
    title: 'Первая версия Loader3D',
    changes: [
      { kind: 'new', text: 'Аккаунты: схемы сохраняются на сервере и открываются с любого устройства.' },
      { kind: 'new', text: 'Вес грузов и грузоподъёмность кузова, центр тяжести и нагрузка в строке статистики.' },
      { kind: 'new', text: 'Автозагрузка раскладывает грузы из дока по кузову сама.' },
    ],
  },
];

/** The releases a user can see: without the tier changes when tiers are off, without releases left empty. */
export function visibleReleases(releases: readonly Release[], tiers: boolean): Release[] {
  return releases
    .map((r) => (tiers ? r : { ...r, changes: r.changes.filter((c) => !c.tiers) }))
    .filter((r) => r.changes.length > 0);
}

/**
 * The releases newer than the one the user saw last (`seen`, '' — none yet) and than the day the account
 * was created (`createdAt`, ISO): what the user does not know about yet.
 */
export function unseenReleases(releases: readonly Release[], seen: string, createdAt: string): Release[] {
  const created = createdAt.slice(0, 10);
  const mark = seen > created ? seen : created;
  return releases.filter((r) => r.id > mark);
}

/** The calendar date of a release: «21 ноября 2026». */
export function releaseDate(id: string): string {
  const [y, m, d] = id.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «21 ноября» — the date without the year, for the strip above the plans. */
export function shortReleaseDate(id: string): string {
  const [y, m, d] = id.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
