'use strict';
// UI language. The Russian strings written in the code are the keys; English
// comes from the table below (wording follows the English Windows 7 Paint).
// P.T(s, vars) translates one string; static text in index.html is
// translated by walking the DOM, so it can be switched at runtime.
window.P = window.P || {};

(function (P) {
  const EN = {
    // ---- window, tabs, ribbon groups
    'Безымянный': 'Untitled',
    'Безымянный - Paint': 'Untitled - Paint',
    'Файл': 'File',
    'Главная': 'Home',
    'Вид': 'View',
    'Мультиплеер': 'Multiplayer',
    'Текст': 'Text',
    'Буфер обмена': 'Clipboard',
    'Изображение': 'Image',
    'Инструменты': 'Tools',
    'Фигуры': 'Shapes',
    'Цвета': 'Colors',
    'Масштаб': 'Zoom',
    'Показать или скрыть': 'Show or hide',
    'Экран': 'Display',
    'Шрифт': 'Font',
    'Фон': 'Background',
    'Лобби': 'Lobby',
    'Участники': 'Players',
    'Параметры': 'Options',
    'Диагностика': 'Diagnostics',
    'Язык': 'Language',

    // ---- ribbon buttons & tooltips
    'Вставить': 'Paste',
    'Вставить (Ctrl+V)': 'Paste (Ctrl+V)',
    'Вставить из': 'Paste from',
    'Вырезать': 'Cut',
    'Вырезать (Ctrl+X)': 'Cut (Ctrl+X)',
    'Копировать': 'Copy',
    'Копировать (Ctrl+C)': 'Copy (Ctrl+C)',
    'Выделить': 'Select',
    'Обрезать': 'Crop',
    'Обрезать (Ctrl+Shift+X)': 'Crop (Ctrl+Shift+X)',
    'Изменить размер': 'Resize',
    'Изменить размер и наклонить (Ctrl+W)': 'Resize and skew (Ctrl+W)',
    'Повернуть': 'Rotate',
    'Карандаш': 'Pencil',
    'Заливка цветом': 'Fill with color',
    'Ластик': 'Eraser',
    'Палитра': 'Color picker',
    'Кисти': 'Brushes',
    'Вверх': 'Up',
    'Вниз': 'Down',
    'Другие': 'More',
    'Контур': 'Outline',
    'Контур фигуры': 'Shape outline',
    'Заливка': 'Fill',
    'Заливка фигуры': 'Shape fill',
    'Толщина': 'Size',
    'Толщина (Ctrl+плюс, Ctrl+минус)': 'Size (Ctrl+plus, Ctrl+minus)',
    'Цвет': 'Color',
    'Изменение': 'Edit',
    'цветов': 'colors',
    'Изменение цветов': 'Edit colors',
    'Цвет 1 (основной)\nВыберите цвет на палитре; он используется для карандаша, кистей и контуров фигур.': 'Color 1 (foreground color)\nClick here and then select a color from the color palette. This color is used with the pencil and with brushes, as well as for shape outlines.',
    'Цвет 2 (фон)\nИспользуется для ластика и заливки фигур.': 'Color 2 (background color)\nThis color is used with the eraser and for shape fills.',
    'Увеличить': 'Zoom in',
    'Увеличить (Ctrl+PgUp)': 'Zoom in (Ctrl+PgUp)',
    'Уменьшить': 'Zoom out',
    'Уменьшить (Ctrl+PgDn)': 'Zoom out (Ctrl+PgDn)',
    'Линейки': 'Rulers',
    'Линии сетки': 'Gridlines',
    'Строка состояния': 'Status bar',
    'Во весь': 'Full',
    'экран': 'screen',
    'Во весь экран (F11)': 'Full screen (F11)',
    'Эскиз': 'Thumbnail',
    'Сохранить (Ctrl+S)': 'Save (Ctrl+S)',
    'Отменить (Ctrl+Z)': 'Undo (Ctrl+Z)',
    'Вернуть (Ctrl+Y)': 'Redo (Ctrl+Y)',
    'Настройка панели быстрого доступа': 'Customize Quick Access Toolbar',
    'Свернуть ленту (Ctrl+F1)': 'Minimize the ribbon (Ctrl+F1)',
    'Справка': 'Help',
    'Полужирный (Ctrl+B)': 'Bold (Ctrl+B)',
    'Курсив (Ctrl+I)': 'Italic (Ctrl+I)',
    'Подчеркнутый (Ctrl+U)': 'Underline (Ctrl+U)',
    'Зачеркнутый': 'Strikethrough',
    'Непрозрачный': 'Opaque',
    'Непрозрачный: фон текста заливается цветом 2': 'Opaque: the text background is filled with color 2',
    'Прозрачный': 'Transparent',

    // ---- multiplayer tab
    'Steam: подключение…': 'Steam: connecting…',
    'Steam: не подключен': 'Steam: not connected',
    'Не в лобби': 'Not in a lobby',
    'Создать': 'New',
    'лобби': 'lobby',
    'Создать лобби (публичное)': 'Create a lobby (public)',
    'Пригласить': 'Invite',
    'друзей': 'friends',
    'Пригласить друзей': 'Invite friends',
    'Пригласить друзей из списка друзей Steam': 'Invite friends from your Steam friend list',
    'Найти': 'Find',
    'Найти открытые лобби': 'Find open lobbies',
    'Войти по коду': 'Join by code',
    'Войти в лобби по коду': 'Join a lobby by its code',
    'Скопировать код': 'Copy code',
    'Скопировать код лобби в буфер обмена': 'Copy the lobby code to the clipboard',
    'Покинуть лобби': 'Leave lobby',
    'Курсоры игроков': 'Player cursors',
    'Имена у курсоров': 'Names on cursors',
    'Рисование вживую': 'Live drawing',
    'Журнал': 'Network',
    'сети': 'log',
    'Открыть папку с журналом сети (net.log) — пришлите его, если что-то работает не так': 'Open the folder with the network log (net.log) — send it if something goes wrong',
    'Подключение к лобби…': 'Connecting to the lobby…',
    'Загрузка холста хоста…': 'Loading the host\'s canvas…',
    'Загрузка холста хоста… {p}%': 'Loading the host\'s canvas… {p}%',
    'Отмена': 'Cancel',
    'Создайте лобби или подключитесь к другу.': 'Create a lobby or join a friend.',
    'Мультиплеер недоступен': 'Multiplayer is unavailable',
    'Мультиплеер недоступен.': 'Multiplayer is unavailable.',
    '(вы, хост)': '(you, host)',
    '(вы)': '(you)',
    '(хост)': '(host)',
    'нет связи': 'no connection',
    '{ms} мс': '{ms} ms',
    'Тест (вкладки): {name}': 'Test (tabs): {name}',
    'Хост лобби · {n} игр.': 'Lobby host · {n} players',
    'В лобби · {n} игр.': 'In a lobby · {n} players',
    'Подключение · {n} игр.': 'Connecting · {n} players',
    'Код лобби: {id}': 'Lobby code: {id}',
    'Публичное лобби': 'Public lobby',
    'Видно всем в «Найти лобби»': 'Visible to everyone in "Find lobby"',
    'Только для друзей': 'Friends only',
    'Друзья могут зайти через список друзей Steam': 'Friends can join from their Steam friends list',
    'Приватное': 'Private',
    'Только по приглашению или коду': 'By invitation or code only',

    // ---- status bar
    '{w} × {h}пкс': '{w} × {h}px',
    '{x}, {y}пкс': '{x}, {y}px',
    'Размер: {size}': 'Size: {size}',
    'Не в сети': 'Offline',
    'Steam недоступен': 'Steam unavailable',
    'Мультиплеер: нет': 'Multiplayer: off',
    'Хост · игроков: {n}': 'Host · players: {n}',
    'Нет связи с хостом…': 'No connection to the host…',
    'В лобби · игроков: {n}': 'In a lobby · players: {n}',
    'Синхронизация… · игроков: {n}': 'Syncing… · players: {n}',
    ' · пинг {ms} мс': ' · ping {ms} ms',
    'Код лобби: {id}\nПереотправлено: {a} · докачано дыр: {b} · пересинхронизаций: {c}': 'Lobby code: {id}\nResent: {a} · holes repaired: {b} · resyncs: {c}',
    '{n} байт': '{n} bytes',
    '{n} КБ': '{n} KB',
    '{n} МБ': '{n} MB',

    // ---- menus
    'Формы выделения': 'Selection shapes',
    'Прямоугольная область': 'Rectangular selection',
    'Произвольная область': 'Free-form selection',
    'Параметры выделения': 'Selection options',
    'Выделить все': 'Select all',
    'Обратить выделение': 'Invert selection',
    'Удалить': 'Delete',
    'Прозрачное выделение': 'Transparent selection',
    'Повернуть на 90° вправо': 'Rotate right 90°',
    'Повернуть на 90° влево': 'Rotate left 90°',
    'Повернуть на 180°': 'Rotate 180°',
    'Отразить по вертикали': 'Flip vertical',
    'Отразить по горизонтали': 'Flip horizontal',
    'Без контура': 'No outline',
    'Без заливки': 'No fill',
    'Сплошной цвет': 'Solid color',
    'Пастель': 'Crayon',
    'Маркер': 'Marker',
    'Масло': 'Oil',
    'Обычный карандаш': 'Natural pencil',
    'Акварель': 'Watercolor',
    'Отменить': 'Undo',
    'Вернуть': 'Redo',
    'Сохранить': 'Save',
    'Открыть': 'Open',
    'Свернуть ленту': 'Minimize the ribbon',
    'Обратить цвет': 'Invert color',

    // ---- brushes, shapes, palette
    'Кисть': 'Brush',
    'Каллиграфическая кисть 1': 'Calligraphy brush 1',
    'Каллиграфическая кисть 2': 'Calligraphy brush 2',
    'Распылитель': 'Airbrush',
    'Масляная кисть': 'Oil brush',
    'Линия': 'Line',
    'Кривая': 'Curve',
    'Овал': 'Oval',
    'Прямоугольник': 'Rectangle',
    'Скругленный прямоугольник': 'Rounded rectangle',
    'Многоугольник': 'Polygon',
    'Треугольник': 'Triangle',
    'Прямоугольный треугольник': 'Right triangle',
    'Ромб': 'Diamond',
    'Пятиугольник': 'Pentagon',
    'Шестиугольник': 'Hexagon',
    'Стрелка вправо': 'Right arrow',
    'Стрелка влево': 'Left arrow',
    'Стрелка вверх': 'Up arrow',
    'Стрелка вниз': 'Down arrow',
    'Четырехконечная звезда': 'Four-point star',
    'Пятиконечная звезда': 'Five-point star',
    'Шестиконечная звезда': 'Six-point star',
    'Скругленная прямоугольная выноска': 'Rounded rectangular callout',
    'Овальная выноска': 'Oval callout',
    'Выноска-облако': 'Cloud callout',
    'Сердце': 'Heart',
    'Молния': 'Lightning',
    'Черный': 'Black',
    'Серый 50%': 'Gray-50%',
    'Темно-красный': 'Dark red',
    'Красный': 'Red',
    'Оранжевый': 'Orange',
    'Желтый': 'Yellow',
    'Зеленый': 'Green',
    'Бирюзовый': 'Turquoise',
    'Индиго': 'Indigo',
    'Фиолетовый': 'Purple',
    'Белый': 'White',
    'Серый 25%': 'Gray-25%',
    'Коричневый': 'Brown',
    'Розовый': 'Rose',
    'Золотой': 'Gold',
    'Светло-желтый': 'Light yellow',
    'Лайм': 'Lime',
    'Светло-бирюзовый': 'Light turquoise',
    'Сизый': 'Blue-gray',
    'Лавандовый': 'Lavender',
    '{name}\nКрасный: {r}, зеленый: {g}, синий: {b}': '{name}\nRed: {r}, Green: {g}, Blue: {b}',
    'Красный: {r}, зеленый: {g}, синий: {b}': 'Red: {r}, Green: {g}, Blue: {b}',

    // ---- file menu
    'Последние изображения': 'Recent pictures',
    'Список пуст': 'The list is empty',
    'Сохранить как': 'Save as',
    'Сохранить копию документа': 'Save a copy of the document',
    'Изображение в формате PNG': 'PNG picture',
    'Сохранение фотографии или рисунка с высоким качеством.': 'Save a photograph or drawing with high quality.',
    'Изображение в формате JPEG': 'JPEG picture',
    'Сохранение фотографии со сжатием для интернета.': 'Save a photograph with compression for the web.',
    'Изображение в формате BMP': 'BMP picture',
    'Сохранение любого рисунка с высоким качеством.': 'Save any kind of picture with high quality.',
    'Изображение в формате GIF': 'GIF picture',
    'Не поддерживается в этой версии.': 'Not supported in this version.',
    'Другие форматы': 'Other formats',
    'Открыть диалоговое окно «Сохранить как» для выбора формата.': 'Open the Save As dialog box to select from all possible file types.',
    'Печать': 'Print',
    'Со сканера или камеры': 'From scanner or camera',
    'Отправить по электронной почте': 'Send in e-mail',
    'Сделать фоном рабочего стола': 'Set as desktop background',
    'Свойства': 'Properties',
    'О программе Paint': 'About Paint',
    'Выход': 'Exit',

    // ---- dialogs
    'Закрыть': 'Close',
    'ОК': 'OK',
    'Да': 'Yes',
    'Нет': 'No',
    'Не сохранять': 'Don\'t Save',
    'Изменение размеров и наклона': 'Resize and Skew',
    'По:': 'By:',
    'процентам': 'Percentage',
    'пикселям': 'Pixels',
    'По горизонтали:': 'Horizontal:',
    'По вертикали:': 'Vertical:',
    'Сохранить пропорции': 'Maintain aspect ratio',
    'Наклон (градусы)': 'Skew (Degrees)',
    'Введите положительное число.': 'Enter a positive number.',
    'Значение наклона должно быть от -89 до 89.': 'The skew value must be between -89 and 89.',
    'Слишком большой размер изображения.': 'The picture is too large.',
    'Свойства изображения': 'Image Properties',
    'Атрибуты файла': 'File attributes',
    'Последнее сохранение:': 'Last saved:',
    'Размер на диске:': 'Size on disk:',
    'Разрешение:': 'Resolution:',
    'Недоступно': 'Not available',
    '96 точек на дюйм': '96 DPI',
    'Единицы измерения': 'Units',
    'Дюймы': 'Inches',
    'Сантиметры': 'Centimeters',
    'Пиксели': 'Pixels',
    'Черно-белое': 'Black and white',
    'Цветное': 'Color',
    'Ширина:': 'Width:',
    'Высота:': 'Height:',
    'По умолчанию': 'Default',
    'Введите допустимый размер изображения.': 'Enter a valid picture size.',
    'Основные цвета:': 'Basic colors:',
    'Дополнительные цвета:': 'Custom colors:',
    'Определить цвет >>': 'Define Custom Colors >>',
    'Цвет|Заливка': 'Color|Solid',
    'Оттенок:': 'Hue:',
    'Контраст:': 'Sat:',
    'Яркость:': 'Lum:',
    'Красный:': 'Red:',
    'Зеленый:': 'Green:',
    'Синий:': 'Blue:',
    'Добавить в набор': 'Add to Custom Colors',
    'Paint · Мультиплеер': 'Paint · Multiplayer',
    'Версия {v}': 'Version {v}',
    'Клон Paint из Windows 7 с совместным рисованием по сети Steam.': 'A Windows 7 Paint clone with collaborative drawing over Steam.',
    'Сеть: Steamworks, AppID 480 (Spacewar), P2P через серверы Steam.': 'Network: Steamworks, AppID 480 (Spacewar), P2P through Steam servers.',
    'Хост лобби упорядочивает операции; у всех игроков холст одинаковый, отмена (Ctrl+Z) работает для своих действий.': 'The lobby host orders all actions, so every player has the same canvas; undo (Ctrl+Z) works on your own actions.',
    'Хост': 'Host',
    'Игроков': 'Players',
    'Код лобби': 'Lobby code',
    'Найти лобби': 'Find lobby',
    'Подключиться': 'Join',
    'Обновить': 'Refresh',
    'Поиск лобби…': 'Searching for lobbies…',
    'Ошибка: {e}': 'Error: {e}',
    'Найдено лобби: {n}': 'Lobbies found: {n}',
    ' (без фильтра Steam — показаны только ближайшие)': ' (no Steam filter — only nearby lobbies are shown)',
    'Открытых лобби Paint не найдено.<br>Создайте своё или попросите друга прислать код.': 'No open Paint lobbies found.<br>Create your own or ask a friend for a code.',
    'Лобби создано': 'Lobby created',
    'Лобби создано, вы — хост. Код лобби:': 'The lobby is created and you are the host. Lobby code:',
    'Как друг может подключиться:': 'How a friend can join:',
    '1. Друг запускает этот Paint (Steam должен быть запущен).': '1. Your friend starts this Paint (Steam must be running).',
    '2. Вы жмёте «Пригласить друзей» — друг принимает приглашение в Steam,': '2. You click "Invite friends" and your friend accepts the invitation in Steam,',
    '    либо друг жмёт «Войти по коду» и вводит код выше,': '    or your friend clicks "Join by code" and enters the code above,',
    '    либо «Найти лобби» (если лобби публичное).': '    or uses "Find lobby" (if the lobby is public).',

    // ---- messages
    'Сохранить изменения в «{name}»?': 'Do you want to save changes to {name}?',
    'Холст будет очищен у всех участников лобби. Продолжить?': 'The canvas will be cleared for everyone in the lobby. Continue?',
    'Изображение «{name}» заменит холст у всех участников лобби. Продолжить?': 'The picture "{name}" will replace the canvas for everyone in the lobby. Continue?',
    'Paint не удается прочитать этот файл.\nЭто недопустимый точечный рисунок, или его формат не поддерживается.': 'Paint cannot read this file.\nThis is not a valid bitmap file, or its format is not currently supported.',
    'Не удалось вставить изображение.': 'The picture could not be pasted.',
    'Вставляемое изображение больше холста.\nУвеличить холст, чтобы изображение поместилось?': 'The image you are pasting is larger than the canvas.\nWould you like the canvas to be enlarged?',
    'Не удается открыть файл:\n': 'Cannot open the file:\n',
    'Не удается сохранить файл:\n': 'Cannot save the file:\n',
    'Не удалось открыть оверлей Steam. Проверьте, что оверлей Steam включён (Steam → Настройки → В игре).': 'Could not open the Steam overlay. Make sure the Steam overlay is enabled (Steam → Settings → In Game).',
    'Журнал сети есть только в приложении (Paint.exe).': 'The network log is only available in the app (Paint.exe).',
    'Не удалось создать лобби.': 'Could not create the lobby.',
    'Не удалось подключиться.': 'Could not connect.',
    'Вы уже в лобби. Выйти из него и подключиться к другому?': 'You are already in a lobby. Leave it and join the other one?',
    'Ваш текущий рисунок будет заменён холстом хоста.\nСохранить его перед подключением?': 'Your current picture will be replaced with the host\'s canvas.\nSave it before joining?',
    'Введите код лобби (его можно скопировать у хоста на вкладке «Мультиплеер»):': 'Enter the lobby code (the host can copy it on the Multiplayer tab):',
    'Покинуть лобби? Текущий рисунок останется у вас.': 'Leave the lobby? You keep the current picture.',
    'Хост не отвечает. Попробуйте подключиться ещё раз.': 'The host is not responding. Try joining again.',
    'Сетевые пакеты Paint перехватывает другая программа на этом компьютере.\n\nСкорее всего, запущена игра на Steam AppID 480 (Spacewar или другая тестовая игра). Закройте её — иначе рисунки будут доходить с задержками и потерями.': 'Another program on this computer is taking Paint\'s network packets.\n\nMost likely a game that runs as Steam AppID 480 (Spacewar or another test game) is open. Close it, otherwise drawings will arrive late or get lost.',
    'Ошибка запуска: ': 'Startup error: ',
    'Не удалось прочитать изображение': 'Could not read the picture',
    'Лобби не найдено': 'Lobby not found',
    'Игрок': 'Player',
    'Вкладка {id}': 'Tab {id}',

    // ---- errors from the Steam layer (main process)
    'Модуль steamworks.js не загружен': 'The steamworks.js module is not loaded',
    'Steam не запущен или недоступен (': 'Steam is not running or unavailable (',
    'Steam не подключен': 'Steam is not connected',
    'Не удалось создать лобби: ': 'Could not create the lobby: ',
    'Неверный код лобби': 'Invalid lobby code',
    'Не удалось войти в лобби: ': 'Could not join the lobby: ',
    'Это лобби не от Paint (обычное лобби Spacewar).': 'This is not a Paint lobby (it is a regular Spacewar lobby).',
    'У хоста другая версия Paint. Обновитесь оба до одной версии.': 'The host has a different version of Paint. Both of you need the same version.',
    'Сначала создайте лобби': 'Create a lobby first',
    'Список друзей Steam недоступен': 'The Steam friend list is unavailable',
    'Steam не отправил приглашение': 'Steam did not send the invite',
    'Steam отключён (PAINT_NO_STEAM)': 'Steam is turned off (PAINT_NO_STEAM)',

    // ---- scaling (resampling)
    'Масштабирование': 'Scaling',
    'Режим масштабирования': 'Resampling',
    'Интерполяция:': 'Resample:',
    'По соседним пикселям (чёткие края)': 'Nearest Neighbor (hard edges)',
    'Билинейная': 'Bilinear',
    'Бикубическая (плавные градиенты)': 'Bicubic (smooth gradients)',
    '{n} пкс': '{n} px',

    // ---- invite friends
    'Оверлей Steam': 'Steam overlay',
    'Поиск друзей': 'Search friends',
    'Приглашение придёт другу в чат Steam. У друга должен быть запущен этот Paint — тогда он подключится сам.':
      'The invite arrives in your friend\'s Steam chat. If your friend has this Paint running, it joins by itself.',
    'В сети': 'Online',
    'Не беспокоить': 'Busy',
    'Нет на месте': 'Away',
    'Спит': 'Snooze',
    'Хочет обменяться': 'Looking to trade',
    'Хочет поиграть': 'Looking to play',
    'Невидимка': 'Invisible',
    'Уже в лобби': 'Already in the lobby',
    'Запустил Paint / Spacewar': 'Running Paint / Spacewar',
    'В игре': 'In a game',
    'Приглашён': 'Invited',
    'Никого не найдено.': 'Nobody found.',
    'Друзей в сети нет.': 'No friends online.',
    'Друзей в сети: {n} из {m}': 'Friends online: {n} of {m}'
  }

  // keys that may be followed by details (error text, a path …)
  const PREFIXES = Object.keys(EN).filter(k => /(: |\(|:\n)$/.test(k))

  const I = P.i18n = {}
  let lang = 'ru'
  try {
    const q = new URLSearchParams(location.search).get('lang')
    const saved = localStorage.getItem('mp-paint-lang')
    lang = q || saved || (/^(ru|uk|be|kk)/i.test(navigator.language || '') ? 'ru' : 'en')
  } catch (e) {}
  if (lang !== 'ru' && lang !== 'en') lang = 'en'
  document.documentElement.lang = lang

  I.lang = () => lang

  function T (s, vars) {
    if (s == null) return s
    let out = s
    if (lang === 'en') {
      if (EN[s] != null) out = EN[s]
      else {
        for (const p of PREFIXES) {
          if (s.startsWith(p)) { out = EN[p] + s.slice(p.length); break }
        }
      }
    }
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m)
    return out
  }
  P.T = T

  const CYR = /[А-Яа-яЁё]/
  const origText = new WeakMap()

  // Translate static text and tooltips under root; originals are remembered,
  // so this can run again after a language switch.
  I.translateDOM = function (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const tag = n.parentNode && n.parentNode.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'text') continue
      let orig = origText.get(n)
      if (orig == null) {
        if (!CYR.test(n.nodeValue)) continue
        orig = n.nodeValue
        origText.set(n, orig)
      }
      const trimmed = orig.trim()
      if (trimmed) n.nodeValue = orig.replace(trimmed, T(trimmed))
    }
    for (const el of root.querySelectorAll('[title]')) {
      if (el.dataset.titleRu == null) {
        if (!CYR.test(el.title)) continue
        el.dataset.titleRu = el.title
      }
      el.title = T(el.dataset.titleRu)
    }
  }

  I.setLang = function (l) {
    lang = l === 'en' ? 'en' : 'ru'
    document.documentElement.lang = lang
    try { localStorage.setItem('mp-paint-lang', lang) } catch (e) {}
    I.translateDOM(document.body)
  }

  // formats with the language's decimal separator
  I.num = v => lang === 'en' ? String(v) : String(v).replace('.', ',')
})(window.P)
