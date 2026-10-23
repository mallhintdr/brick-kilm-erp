// Guided tours, one per lesson of the written guide. Each step: target (what to highlight), route (page to
// open first), title/text (en + ur), and an optional action done when Next is pressed: 'click' the target,
// 'clickFirst' an actionTarget, 'close' an open panel, or 'route' to another page.
// next/nextUr rename the Next button for that step.
const S = (target, route, title, titleUr, text, textUr, extra = {}) => ({ target, route, title, titleUr, text, textUr, ...extra });
const C = (n) => `#main > div > :nth-child(${n})`; // the n-th block of the page
const TAB = (n) => `#main [role=tab]:nth-child(${n})`;

export const TOUR_GROUPS = [
  ['start', 'Start Here', 'شروع'], ['daily', 'Every Day', 'روزانہ'], ['kiln', 'The Kiln', 'بھٹہ'],
  ['money', 'People and Money', 'مزدور اور پیسہ'], ['reports', 'Checking and Reports', 'جانچ اور رپورٹس'], ['admin', 'Admin', 'انتظام'],
];

export const TOURS = [
  // ---------------- Start here ----------------
  { id: 'start', group: 'start', title: 'Getting Started', titleUr: 'شروعات', steps: [
    S('[data-tour="logo"]', '/home', 'Welcome to Bhatta Manager', 'بھٹہ منیجر میں خوش آمدید',
      'This tour shows you around. Tap the logo any time to come back to Home.', 'یہ دورہ ایپ دکھائے گا۔ لوگو دبانے سے ہمیشہ ہوم پر واپس آئیں گے۔'),
    S('[data-tour="today"]', '/home', 'Today at a glance', 'آج ایک نظر میں',
      'Bricks moulded today, where the fire is, cash today and how many daily entries are still missing.', 'آج کی پتھائی، آگ کس لائن میں، آج کی نقدی، اور کتنے روزانہ اندراج باقی ہیں۔'),
    S('[data-tour="stock"]', '/home', 'Stock', 'اسٹاک',
      'Awwal, Doem, Khangar, green bricks in the field and in the kiln, fired bricks in the kiln and coal left.', 'اول، دوم، کھنگر، میدان اور بھٹے کی کچی اینٹ، بھٹے میں پکی اینٹ اور باقی کوئلہ۔'),
    S('[data-tour="group-secToday"]', '/home', 'Five sections', 'پانچ حصے',
      'Pages are grouped: Today, Kiln, People, Money, Reports. Less-used pages sit under More.', 'صفحے پانچ حصوں میں ہیں: آج، بھٹہ، مزدور، پیسہ، رپورٹس۔ باقی "مزید" میں ہیں۔'),
    S('[data-tour="lang"]', null, 'Language', 'زبان', 'Switch between Urdu and English. The app remembers your choice.', 'اردو اور انگریزی بدلیں۔ ایپ انتخاب یاد رکھتی ہے۔'),
    S('[data-tour="help"]', null, 'Help and tours', 'مدد اور دورے', 'Tap ? any time to start any tour or read the full guide.', '? دبا کر کوئی بھی دورہ یا مکمل رہنما کھولیں۔'),
    S('[data-tour="logout"]', null, 'Log out', 'باہر نکلیں', 'The red button with your name logs you out. Entries are saved before that.', 'آپ کے نام والا سرخ بٹن لاگ آؤٹ کرتا ہے۔ اندراج پہلے ہی محفوظ ہوتے ہیں۔'),
    S('[data-tour="fab"]', null, 'The + button', '+ بٹن',
      'Add any entry from any page. Next opens it.', 'کسی بھی صفحے سے کوئی بھی اندراج۔ اگلا دبائیں، یہ کھلے گا۔', { action: 'click', next: 'Open it', nextUr: 'کھولیں' }),
    S('[data-tour="sheet"]', null, 'Quick forms', 'فوری فارم',
      'Moulding, loading, firing, nikasi, dasti, peshgi, sale, payment, purchase, attendance. Next closes this menu.', 'پتھائی، بھرائی، جلائی، نکاسی، دستی، پیشگی، فروخت، وصولی، خریداری، حاضری۔ اگلا اسے بند کرے گا۔', { action: 'close' }),
    S('[data-tour="tab/daily"]', null, 'Daily Entry', 'روزانہ اندراج',
      'The munshi’s main screen. Take the Practice Day tour next.', 'منشی کی اصل سکرین۔ اگلا "مشق کا دن" دورہ دیکھیں۔'),
  ] },
  { id: 'practice', group: 'start', title: 'Practice Day', titleUr: 'مشق کا دن', steps: [
    S('[data-tour="day-card"]', '/daily', 'Start on Daily Entry', 'روزانہ اندراج سے شروع',
      'Check the date is today. The bar shows what is done and what is missing.', 'تاریخ آج کی ہو۔ پٹی بتاتی ہے کیا مکمل ہے اور کیا باقی۔'),
    S(C(1), '/attendance', 'Mark attendance', 'حاضری لگائیں',
      'Here the munshi taps P, A, L or ½ for each worker every morning and saves.', 'یہاں منشی ہر صبح ہر مزدور کے لیے ح، غ، چ یا ½ دبا کر محفوظ کرتا ہے۔'),
    S('[data-tour="add-moulding"]', '/daily', 'Add moulding', 'پتھائی شامل کریں',
      'Back on Daily Entry, + on the Moulding block opens the form. Next opens it.', 'روزانہ اندراج میں پتھائی کا + فارم کھولتا ہے۔ اگلا دبائیں۔', { action: 'click', next: 'Press +', nextUr: '+ دبائیں' }),
    S('[data-tour="sheet"]', null, 'Fill and save', 'بھریں اور محفوظ کریں',
      'Pick a moulder, type 5000, Save. The entry appears with its time. (This tour closes without saving.)', 'پتھیر چنیں، 5000 لکھیں، محفوظ کریں۔ اندراج وقت کے ساتھ نظر آئے گا۔ (یہ دورہ بغیر محفوظ کیے بند ہو گا)', { action: 'close' }),
    S('[data-tour="block-moulding"]', '/daily', 'Correct a mistake', 'غلطی درست کریں',
      'Tap ✏ on an entry to change it, 🗑 to delete it. Wages follow automatically.', 'اندراج پر ✏ سے بدلیں، 🗑 سے حذف۔ مزدوری خود درست ہو جاتی ہے۔'),
    S('[data-tour="worker-card"]', '/daily', 'Give dasti', 'دستی دیں',
      'Pick a worker on the Worker Day Card and save their dasti, for example 500.', 'مزدور کا دن میں مزدور چنیں اور دستی، مثلاً 500، محفوظ کریں۔'),
    S('[data-tour="kiln-plan"]', '/kiln-board', 'See it on the kiln', 'بھٹے پر دیکھیں', 'Firing entries move the red line on the Kiln Board.', 'جلائی کے اندراج بھٹہ بورڈ پر سرخ لائن آگے لے جاتے ہیں۔'),
    S(C(3), '/roznamcha', 'Everything in Roznamcha', 'سب روزنامچہ میں', 'Every entry of the day, in time order. Practice entries can be deleted from Daily Entry.', 'دن کا ہر اندراج وقت کے ساتھ۔ مشق کے اندراج روزانہ اندراج سے حذف کریں۔'),
  ] },
  { id: 'setup', group: 'start', title: 'First-Time Setup (Owner)', titleUr: 'پہلی ترتیب (مالک)', steps: [
    S(C(1), '/settings', 'Rates and limits', 'ریٹ اور حدیں', 'Enter wage rates, peshgi cuts per 1,000, brick prices and peshgi limits; press the green Save next to each.', 'مزدوری کے ریٹ، فی ہزار پیشگی کٹوتی، اینٹ کی قیمت اور پیشگی کی حد لکھیں؛ ہر ایک کے ساتھ سبز محفوظ دبائیں۔'),
    S(C(3), '/settings', 'Opening stock', 'ابتدائی اسٹاک', 'What was physically at the kiln on day one. Without it, stock and coal can go below zero.', 'پہلے دن بھٹے پر موجود مال۔ اس کے بغیر اسٹاک اور کوئلہ منفی ہو سکتے ہیں۔'),
    S(C(4), '/settings', 'Kiln location', 'بھٹے کا مقام', 'Tap the kiln on the map or use your location at the kiln. Weather comes from here.', 'نقشے پر بھٹہ دبائیں یا بھٹے پر اپنا مقام استعمال کریں۔ موسم یہیں سے آتا ہے۔'),
    S(C(5), '/settings', 'Your own lists', 'اپنی فہرستیں', 'Add worker categories, purchase items, customer types and payment modes.', 'مزدوروں کی قسمیں، خریداری کی اشیاء، گاہک کی قسمیں اور ادائیگی کے طریقے شامل کریں۔'),
    S(C(1), '/users', 'Staff logins', 'عملے کے لاگ اِن', 'Create the munshi and accountant here.', 'یہاں منشی اور اکاؤنٹنٹ بنائیں۔'),
    S('[data-tour="worker-form"]', '/workers', 'Workers', 'مزدور', 'Add every worker with their opening peshgi.', 'ہر مزدور ابتدائی پیشگی کے ساتھ درج کریں۔'),
  ] },

  // ---------------- Every day ----------------
  { id: 'daily', group: 'daily', title: 'Daily Entry', titleUr: 'روزانہ اندراج', steps: [
    S('[data-tour="day-card"]', '/daily', 'Choose the day', 'دن چنیں', 'Use ‹ › or tap the date. Every entry you add here gets this date.', '‹ › یا تاریخ دبائیں۔ یہاں کا ہر اندراج اسی تاریخ کا ہو گا۔'),
    S('[data-tour="day-progress"]', '/daily', 'Is the day complete?', 'کیا دن مکمل ہے؟', 'Green is done, amber is missing: attendance, moulding, two firing shifts, loading.', 'سبز مکمل، پیلا باقی: حاضری، پتھائی، دو جلائی شفٹیں، بھرائی۔'),
    S('[data-tour="block-moulding"]', '/daily', 'One block per kind of work', 'ہر کام کا الگ خانہ', 'Entries show with their time. ✏ corrects, 🗑 deletes; wages follow.', 'اندراج وقت کے ساتھ۔ ✏ درست، 🗑 حذف؛ مزدوری خود درست۔'),
    S('[data-tour="add-moulding"]', '/daily', 'Add', 'شامل کریں', 'Each block has its own +. Next presses it.', 'ہر خانے کا اپنا + ہے۔ اگلا اسے دبائے گا۔', { action: 'click', next: 'Press +', nextUr: '+ دبائیں' }),
    S('[data-tour="sheet"]', null, 'The form', 'فارم', 'The date is already the chosen day. Fill the boxes and save.', 'تاریخ پہلے سے چنا ہوا دن ہے۔ خانے بھر کر محفوظ کریں۔'),
    S('[data-tour="save-next"]', null, 'Save & Next', 'محفوظ کر کے اگلا', 'Saves and stays open for the next worker. Next closes this example.', 'محفوظ کر کے اگلے مزدور کے لیے کھلا رہتا ہے۔ اگلا یہ مثال بند کرے گا۔', { action: 'close' }),
    S('[data-tour="block-firing"]', '/daily', 'Firing shifts', 'جلائی کی شفٹیں', 'Two shifts a day are expected; each moves the fire on the Kiln Board.', 'روز دو شفٹیں؛ ہر شفٹ بھٹہ بورڈ پر آگ آگے لے جاتی ہے۔'),
    S('[data-tour="close-day"]', '/daily', 'Close the day', 'دن بند کریں', 'When complete and cash matches, the owner closes the day.', 'مکمل اور نقدی درست ہو تو مالک دن بند کرتا ہے۔'),
  ] },
  { id: 'quick', group: 'daily', title: 'Quick Forms and the + Button', titleUr: 'فوری فارم اور + بٹن', steps: [
    S('[data-tour="fab"]', '/home', 'The + button', '+ بٹن', 'Opens all quick forms from any page. Next opens it.', 'ہر صفحے سے فوری فارم۔ اگلا دبائیں۔', { action: 'click', next: 'Open', nextUr: 'کھولیں' }),
    S('[data-tour="menu-bharai"]', null, 'Loading form', 'بھرائی فارم', 'Chooses the next empty line for you. Next opens it.', 'اگلی خالی لائن خود چنتا ہے۔ اگلا اسے کھولے گا۔', { action: 'click' }),
    S('[data-tour="sheet"]', null, 'Only what is needed', 'صرف ضروری خانے', 'Line, bricks, loader, date. Save & Next moves to the next empty line with the same loader.', 'لائن، اینٹیں، بھرائی والا، تاریخ۔ "محفوظ کر کے اگلا" اسی بھرائی والے کے ساتھ اگلی خالی لائن کھولتا ہے۔', { action: 'close' }),
    S('[data-tour="fab"]', null, 'Firing, nikasi, money', 'جلائی، نکاسی، پیسہ', 'Firing picks the line on fire and the time; Nikasi starts and finishes in one save; Dasti, Peshgi, Sale, Payment and Purchase work the same way.', 'جلائی میں آگ والی لائن اور وقت خود؛ نکاسی ایک بار میں مکمل؛ دستی، پیشگی، فروخت، وصولی اور خریداری بھی ایسے ہی۔'),
  ] },
  { id: 'workercard', group: 'daily', title: 'Worker Day Card', titleUr: 'مزدور کا دن', steps: [
    S('[data-tour="worker-card"]', '/daily', 'One worker, one card', 'ایک مزدور، ایک کارڈ', 'Pick a worker, then mark attendance, enter their bricks, dasti and peshgi here. Their entries today and peshgi balance show on the card.', 'مزدور چنیں، پھر حاضری، اینٹیں، دستی اور پیشگی یہیں۔ آج کے اندراج اور پیشگی بقایا کارڈ پر نظر آتے ہیں۔'),
  ] },
  { id: 'attendance', group: 'daily', title: 'Attendance', titleUr: 'حاضری', steps: [
    S(C(1), '/attendance', 'Date and filters', 'تاریخ اور فلٹر', 'Check the date; filter by category or name. Mark All Present fills everyone.', 'تاریخ دیکھیں؛ قسم یا نام سے فلٹر کریں۔ "سب حاضر" سب کو حاضر کرتا ہے۔'),
    S(C(2), '/attendance', 'Today’s count', 'آج کی گنتی', 'Present, absent, leave and half day for the chosen date.', 'چنی تاریخ کے حاضر، غیر حاضر، چھٹی اور آدھا دن۔'),
    S(C(3), '/attendance', 'Mark each worker', 'ہر مزدور', 'Tap P, A, L or ½, then Save at the top or ✓ at the row end. Tap a name for their record.', 'ح، غ، چ یا ½ دبائیں، پھر اوپر محفوظ یا قطار کے آخر میں ✓۔ نام دبا کر ریکارڈ دیکھیں۔'),
  ] },
  { id: 'moulding', group: 'daily', title: 'Moulding (Pathai)', titleUr: 'پتھائی', steps: [
    S(C(1), '/moulding', 'Totals', 'کل', 'Total moulded and net accepted after breakage.', 'کل پتھائی اور ٹوٹ پھوٹ کے بعد خالص۔'),
    S(C(3), '/moulding', 'Single entry', 'ایک اندراج', 'Moulder, date, bricks, breakage % and quality. Net count = bricks − breakage; wages are paid on it.', 'پتھیر، تاریخ، اینٹیں، ٹوٹ پھوٹ % اور معیار۔ خالص = اینٹیں − ٹوٹ پھوٹ؛ مزدوری اسی پر۔'),
    S(C(4), '/moulding', 'The list', 'فہرست', 'Every moulding entry. ✏ corrects one and its wages.', 'ہر پتھائی اندراج۔ ✏ سے درستگی، مزدوری ساتھ۔'),
  ] },
  { id: 'weekly', group: 'daily', title: 'Weekly Entry Grid', titleUr: 'ہفتہ وار اندراج', steps: [
    S(C(1), '/weekly', 'Choose the work', 'کام چنیں', 'Moulding, Loading or Unloading.', 'پتھائی، بھرائی یا نکاسی۔'),
    S(C(2), '/weekly', 'Fill the week', 'ہفتہ بھریں', 'Pick the week (Saturday to Friday), type each worker’s count under each day, then Save Whole Week. Green cells are already saved.', 'ہفتہ چنیں (ہفتہ تا جمعہ)، ہر مزدور کی ہر دن کی تعداد لکھیں، پھر پورا ہفتہ محفوظ کریں۔ سبز خانے پہلے سے محفوظ ہیں۔'),
  ] },

  // ---------------- The kiln ----------------
  { id: 'kiln', group: 'kiln', title: 'Kiln Board', titleUr: 'بھٹہ بورڈ', steps: [
    S('[data-tour="kiln-legend"]', '/kiln-board', 'Lines in each state', 'ہر حالت میں لائنیں',
      'Green unfired, red firing, gold cooling, light yellow ready to unload, blue unloading, grey empty.', 'سبز کچی، سرخ جل رہی، سنہری ٹھنڈی، ہلکی پیلی تیار، نیلی نکاسی، سلیٹی خالی۔'),
    S('[data-tour="kiln-plan"]', '/kiln-board', 'The kiln plan', 'بھٹے کا نقشہ',
      'Line 1 is at the top; lines run counter-clockwise to 240. The date inside shows when the stage began. Next opens line 5.', 'لائن 1 اوپر؛ گھڑی کی الٹی سمت 240 تک۔ اندر کی تاریخ مرحلہ شروع ہونے کی۔ اگلا لائن 5 کھولے گا۔',
      { action: 'clickFirst', actionTarget: '[data-index="5"]', next: 'Open a line', nextUr: 'لائن کھولیں' }),
    S('[data-tour="stage-bar"]', null, 'Stage buttons', 'مرحلہ بٹن', 'Loading › Preheating › Firing › Cooling › Unloading. Only the next allowed step can be pressed.', 'بھرائی › پری ہیٹنگ › جلائی › ٹھنڈا › نکاسی۔ صرف اگلا مرحلہ۔', { action: 'route', actionRoute: '/kiln-board' }),
    S('[data-tour="kiln-list"]', '/kiln-board', 'Every line as a list', 'ہر لائن فہرست میں', 'Type in the filter boxes to search; tap a row to open that line.', 'فلٹر میں لکھ کر تلاش؛ قطار دبا کر لائن کھولیں۔'),
  ] },
  { id: 'loading', group: 'kiln', title: 'Loading (Bharai)', titleUr: 'بھرائی', steps: [
    S(C(1), '/loading', 'Weekly loading', 'ہفتہ وار بھرائی', 'Enter a whole week of loading per worker here when it comes in a notebook.', 'کاپی سے پورا ہفتہ ہر مزدور کی بھرائی یہاں۔'),
    S('[data-tour="kiln-plan"]', '/loading', 'Tap an empty line', 'خالی لائن دبائیں', 'Grey lines are empty. Next opens line 5 to load it.', 'سلیٹی لائنیں خالی ہیں۔ اگلا لائن 5 کھولے گا۔', { action: 'clickFirst', actionTarget: '[data-index="5"]' }),
    S('[data-tour="stage-bar"]', null, 'Load the line', 'لائن بھریں', 'Below the stage buttons: loader, bricks and date, then Save Line Bharai. The next line opens with the same loader.', 'مرحلہ بٹنوں کے نیچے: بھرائی والا، اینٹیں، تاریخ، پھر لائن بھرائی محفوظ۔ اگلی لائن اسی کے ساتھ کھلتی ہے۔'),
  ] },
  { id: 'firing', group: 'kiln', title: 'Firing (Jalai)', titleUr: 'جلائی', steps: [
    S(C(1), '/firing', 'Latest readings', 'تازہ ریڈنگ', 'Latest temperature and total coal logged.', 'آخری درجہ حرارت اور کل کوئلہ۔'),
    S('[data-tour="firing-form"]', '/firing', 'Log a shift', 'شفٹ درج کریں', 'Fireman, day or night, line, date, time, coal kg and temperature, then Log Entry.', 'فائرمین، دن یا رات، لائن، تاریخ، وقت، کوئلہ اور درجہ حرارت، پھر اندراج کریں۔'),
    S(C(3), '/firing', 'Pick the line on the plan', 'نقشے پر لائن', 'Tap a line here to choose it for the log. The fire follows the latest entry.', 'یہاں لائن دبا کر چنیں۔ آگ آخری اندراج کے ساتھ چلتی ہے۔'),
    S(C(4), '/firing', 'All firing logs', 'تمام جلائی', 'Every shift; ✏ corrects coal, temperature or shift.', 'ہر شفٹ؛ ✏ سے کوئلہ، درجہ حرارت یا شفٹ درست۔'),
  ] },
  { id: 'nikasi', group: 'kiln', title: 'Unloading (Nikasi)', titleUr: 'نکاسی', steps: [
    S(C(1), '/unloading', 'Weekly nikasi', 'ہفتہ وار نکاسی', 'Enter a week of nikasi per worker by grade.', 'ہر مزدور کی ہفتہ وار نکاسی گریڈ کے ساتھ۔'),
    S('[data-tour="kiln-plan"]', '/unloading', 'Ready lines', 'تیار لائنیں', 'Light yellow lines are ready. Open one, choose the unloader and Assign; it turns blue. When empty, enter Awwal, Doem, Khangar, Broken and Save Counts.', 'ہلکی پیلی لائنیں تیار ہیں۔ کھولیں، نکاسی والا چنیں؛ لائن نیلی ہو جاتی ہے۔ خالی ہونے پر اول، دوم، کھنگر، ٹوٹی لکھ کر محفوظ کریں۔'),
  ] },

  // ---------------- People and money ----------------
  { id: 'workers', group: 'money', title: 'Workers', titleUr: 'مزدور', steps: [
    S(C(1), '/workers', 'Totals', 'کل', 'Workers, unregistered workers and signed contracts.', 'مزدور، غیر رجسٹرڈ اور دستخط شدہ معاہدے۔'),
    S('[data-tour="worker-form"]', '/workers', 'Add a worker', 'مزدور شامل کریں', 'Name, father name, CNIC, date of birth, category, mobile, opening peshgi and daily bricks are required. Reference / Jamadar groups them.', 'نام، ولدیت، شناختی کارڈ، تاریخ پیدائش، قسم، موبائل، ابتدائی پیشگی اور روزانہ اینٹیں لازمی۔ حوالہ / جمعدار سے گروپ۔'),
    S(C(3), '/workers', 'The list', 'فہرست', 'Mobile, peshgi balance and daily bricks for counter-checking. ✏ edits a worker.', 'تصدیق کے لیے موبائل، پیشگی بقایا اور روزانہ اینٹیں۔ ✏ سے ترمیم۔'),
  ] },
  { id: 'peshgi', group: 'money', title: 'Peshgi and Recovery', titleUr: 'پیشگی اور وصولی', steps: [
    S(C(1), '/peshgi', 'Give or recover', 'دیں یا واپس لیں', 'Pick the worker, see outstanding peshgi, type amount and date, then Give Advance or Record Recovery. Print Slip gives their statement.', 'مزدور چنیں، بقایا دیکھیں، رقم اور تاریخ لکھیں، پھر پیشگی دیں یا وصولی۔ پرچی پرنٹ سے حساب۔'),
    S(C(2), '/peshgi', 'Ledger history', 'کھاتے کی تاریخ', 'Every advance, recovery and wage entry for that worker.', 'اس مزدور کی ہر پیشگی، وصولی اور مزدوری۔'),
  ] },
  { id: 'thursday', group: 'money', title: 'Dasti and Thursday Settlement', titleUr: 'دستی اور جمعرات کا حساب', steps: [
    S(C(1), '/kharchi', 'Dasti during the week', 'ہفتے میں دستی', 'Cash a worker takes before Thursday.', 'جمعرات سے پہلے لی گئی نقدی۔'),
    S('[data-tour="propose"]', '/kharchi', 'Propose', 'تجویز', 'Choose category and week, then Propose: wages − peshgi cut − dasti = cash to pay.', 'قسم اور ہفتہ چنیں، پھر تجویز: مزدوری − پیشگی کٹوتی − دستی = نقدی۔'),
    S(C(4), '/kharchi', 'Print slips', 'پرچیاں', 'After Save and Settle, print one slip per worker from Recent Settlements.', 'محفوظ کرنے کے بعد حالیہ ادائیگیوں سے ہر مزدور کی پرچی پرنٹ کریں۔'),
  ] },
  { id: 'khata', group: 'money', title: 'Khata', titleUr: 'کھاتہ', steps: [
    S(C(1), '/khata', 'Worker Khata', 'مزدوروں کا کھاتہ', 'Any worker’s full khata from day one: naam, jama and baqaya.', 'کسی بھی مزدور کا پہلے دن سے مکمل کھاتہ: نام، جمع، بقایا۔'),
    S(C(2), '/khata', 'Party Accounts', 'دیگر کھاتے', 'Everyone else: mistri, tractor, coal and soil suppliers, diesel.', 'باقی سب: مستری، ٹریکٹر، کوئلہ اور مٹی کے سپلائر، ڈیزل۔'),
  ] },
  { id: 'parties', group: 'money', title: 'Party Accounts', titleUr: 'دیگر کھاتے', steps: [
    S(C(2), '/parties', 'Summary', 'خلاصہ', 'Totals for all parties; choose a person for theirs.', 'سب کا خلاصہ؛ کسی ایک کا خلاصہ نام چن کر۔'),
    S(TAB(2), '/parties', 'Add an entry', 'نیا اندراج', 'Work Bill and Rent are Jama (owed to them); Payment Made and Advance are Naam. Next opens the form.', 'کام کا بل اور کرایہ جمع؛ ادائیگی اور پیشگی نام۔ اگلا فارم کھولے گا۔', { action: 'click' }),
    S(C(2), null, 'The form', 'فارم', 'Names appear as you type. Purchases from Inventory arrive here by themselves.', 'لکھتے ہوئے نام سامنے آتے ہیں۔ خریداری یہاں خود آتی ہے۔'),
    S(TAB(3), '/parties', 'All entries', 'تمام اندراجات', 'Each party’s running balance; edit in the row.', 'ہر پارٹی کا بقایا؛ قطار میں ترمیم۔'),
    S(TAB(4), '/parties', 'Report and PDF', 'رپورٹ اور پی ڈی ایف', 'One party or everyone for a date range, with Export PDF.', 'ایک یا سب پارٹیاں، تاریخوں کے ساتھ، پی ڈی ایف۔'),
  ] },
  { id: 'sales', group: 'money', title: 'Sales, Bookings and Challans', titleUr: 'فروخت، بکنگ اور چالان', steps: [
    S(C(1), '/sales', 'What is owed to you', 'وصولی باقی', 'Total receivable and how long it has been due.', 'کل وصولی اور کتنی پرانی۔'),
    S('[data-tour="sales-tabs"]', '/sales', 'Four jobs', 'چار کام', 'New Invoice, Booking, Record Payment, New Customer.', 'نیا بل، بکنگ، وصولی، نیا گاہک۔'),
    S('[data-tour="invoice-form"]', '/sales', 'Delivery with challan', 'چالان کے ساتھ ترسیل', 'Customer, grade, quantity, vehicle, driver, destination, freight. Saving opens the challan to print or WhatsApp.', 'گاہک، گریڈ، تعداد، گاڑی، ڈرائیور، منزل، کرایہ۔ محفوظ کرنے پر چالان: پرنٹ یا WhatsApp۔'),
    S(`[data-tour="sales-tabs"] [role=tab]:nth-child(2)`, '/sales', 'Bookings (parchi)', 'بکنگ (پرچی)', 'Book bricks with an advance; deliveries reduce what is left. Next opens it.', 'ایڈوانس کے ساتھ بکنگ؛ ہر ترسیل باقی کم کرتی ہے۔ اگلا کھولے گا۔', { action: 'click' }),
    S(C(2), null, 'Booking list', 'بکنگ فہرست', 'Booked, lifted, remaining and advance for each booking.', 'ہر بکنگ کی بک، اٹھائی، باقی اور ایڈوانس۔'),
    S(C(3), '/sales', 'All sales', 'تمام فروخت', 'Every bill with its status; the printer icon reprints the challan.', 'ہر بل اور حالت؛ پرنٹر نشان سے چالان دوبارہ۔'),
  ] },
  { id: 'purchases', group: 'money', title: 'Purchases (Maal Aaya)', titleUr: 'خریداری (مال آیا)', steps: [
    S(C(1), '/inventory', 'Enter a purchase', 'خریداری درج کریں', 'Item, supplier (same spelling every time), quantity and rate. Coal: tonnes, vehicle and freight; other items: description.', 'چیز، سپلائر (ہر بار ایک ہجے)، مقدار اور ریٹ۔ کوئلہ: ٹن، گاڑی، کرایہ؛ باقی: تفصیل۔'),
    S(C(2), '/inventory', 'Recent purchases', 'حالیہ خریداری', 'Each one also posts to the supplier in Party Accounts. Payments go there as Payment Made.', 'ہر خریداری سپلائر کے کھاتے میں بھی جاتی ہے۔ ادائیگی وہاں "ادائیگی کی"۔'),
  ] },
  { id: 'cash', group: 'money', title: 'Cash Book and Cash Count', titleUr: 'کیش بک اور نقدی گنتی', steps: [
    S(C(1), '/cashbook', 'Pick the day', 'دن چنیں', 'Every cash movement of that day.', 'اس دن کی ہر نقدی۔'),
    S(C(2), '/cashbook', 'Opening, in, out, closing', 'ابتدائی، آمد، خرچ، اختتامی', 'At the end of the day type the cash counted in hand: green means it matches, red shows the difference.', 'دن کے آخر میں ہاتھ کی نقدی لکھیں: سبز = درست، سرخ = فرق۔'),
    S(C(3), '/cashbook', 'Money in and out', 'آمد اور خرچ', 'Income and expense details; today’s can be corrected with ✏.', 'آمد اور خرچ کی تفصیل؛ آج کی ✏ سے درست۔'),
  ] },
  { id: 'personal', group: 'money', title: 'Personal Finance (Owner)', titleUr: 'ذاتی حساب (مالک)', steps: [
    S(C(2), '/personal', 'Private book', 'نجی کھاتہ', 'The owner’s own money, kept apart from the kiln. It works like Party Accounts: add, list with balances, report and PDF.', 'مالک کا اپنا پیسہ، بھٹے سے الگ۔ دیگر کھاتوں کی طرح: اندراج، بقایا، رپورٹ اور پی ڈی ایف۔'),
  ] },

  // ---------------- Checking and reports ----------------
  { id: 'roznamcha', group: 'reports', title: 'Roznamcha', titleUr: 'روزنامچہ', steps: [
    S(C(1), '/roznamcha', 'Pick a date', 'تاریخ چنیں', 'Everything done on that day.', 'اس دن کا سب کام۔'),
    S(C(2), '/roznamcha', 'Day summary', 'دن کا خلاصہ', 'How many of each kind of entry.', 'ہر قسم کے کتنے اندراج۔'),
    S(C(3), '/roznamcha', 'In time order', 'وقت کے ساتھ', 'Filter by type or detail.', 'قسم یا تفصیل سے فلٹر۔'),
  ] },
  { id: 'owner', group: 'reports', title: 'Owner Summary', titleUr: 'مالک کا خلاصہ', steps: [
    S('#main section:nth-of-type(1)', '/owner', 'Cash needed Thursday', 'جمعرات کو نقدی', 'This week’s wages minus dasti, per worker.', 'اس ہفتے کی مزدوری − دستی، ہر مزدور۔'),
    S('#main section:nth-of-type(2)', '/owner', 'Cost per 1,000 bricks', 'لاگت فی ہزار', 'Labour plus other costs over 30 days, divided by bricks unloaded.', '30 دن کی مزدوری اور دیگر خرچ ÷ نکاسی کی اینٹیں۔'),
    S('#main section:nth-of-type(3)', '/owner', 'We owe', 'ہمیں دینا ہے', 'Every supplier or party with an open balance.', 'ہر سپلائر یا پارٹی کا بقایا۔'),
    S('#main section:nth-of-type(4)', '/owner', 'Jamadar groups', 'جمعدار گروپ', 'Workers and peshgi under each jamadar. The WhatsApp button at the top sends a day summary.', 'ہر جمعدار کے مزدور اور پیشگی۔ اوپر WhatsApp بٹن دن کا خلاصہ بھیجتا ہے۔'),
  ] },
  { id: 'health', group: 'reports', title: 'Health Check', titleUr: 'صحت جانچ', steps: [
    S(C(1), '/health', 'Figures that look wrong', 'غلط لگتے اعداد', 'Missing opening stock, negative coal or bricks, missing attendance, lines waiting long, purchases without a supplier. Tap one to fix it.', 'ابتدائی اسٹاک نہیں، منفی کوئلہ یا اینٹ، حاضری نہیں، دیر سے تیار لائنیں، بغیر سپلائر خریداری۔ دبا کر درست کریں۔'),
  ] },
  { id: 'insights', group: 'reports', title: 'Insights', titleUr: 'انسائٹس', steps: [
    S(C(1), '/insights', 'Choose the period', 'مدت چنیں', '1 Day (yesterday), 7 to 365 days, or custom. Cards and charts follow it.', '1 دن (کل) سے 365 دن یا اپنی مرضی۔ کارڈ اور گراف اسی کے مطابق۔'),
    S(C(2), '/insights', 'Stock and kiln figures', 'اسٹاک اور بھٹہ', 'Moulding, loading, lines fired, kiln situation, nikasi, sales, coal and stock.', 'پتھائی، بھرائی، جلی لائنیں، بھٹے کی صورتحال، نکاسی، فروخت، کوئلہ، اسٹاک۔'),
    S(C(3), '/insights', 'Production and money', 'پیداوار اور پیسہ', 'Quality, finance and risk for the period.', 'معیار، مالیات اور خطرہ۔'),
    S(C(4), '/insights', 'Charts', 'گراف', 'Daily Avg on the left, Trend on the right; tick the legend boxes to show or hide.', 'بائیں روزانہ اوسط، دائیں رجحان؛ نیچے کے خانوں سے دکھائیں یا چھپائیں۔'),
  ] },
  { id: 'reports', group: 'reports', title: 'Reports and Printing', titleUr: 'رپورٹس اور پرنٹ', steps: [
    S(C(1), '/reports', 'Choose period and parts', 'مدت اور حصے', 'Tick what to include, then Print / PDF and choose Save as PDF.', 'شامل حصے چنیں، پھر پرنٹ / پی ڈی ایف اور Save as PDF۔'),
    S(C(3), '/reports', 'Period summary', 'مدت کا خلاصہ', 'Headline figures for the period.', 'مدت کے اہم اعداد۔'),
    S(C(7), '/reports', 'Detailed tables', 'تفصیلی جدول', 'One table per part, each with filters and totals.', 'ہر حصے کا جدول، فلٹر اور کل کے ساتھ۔'),
  ] },
  { id: 'corrections', group: 'reports', title: 'Corrections and History', titleUr: 'درستگی اور ریکارڈ', steps: [
    S(C(1), '/corrections', 'Corrections & Erase', 'درستگی اور حذف', 'Loading and nikasi records by date; wages are reversed automatically. Daily Entry is the easiest place for most corrections.', 'تاریخ سے بھرائی اور نکاسی؛ مزدوری خود واپس۔ زیادہ تر درستگی روزانہ اندراج میں آسان ہے۔'),
    S(C(2), '/activity', 'All entries', 'تمام اندراجات', 'Every entry over time, filtered by kind and date.', 'وقت کے ساتھ ہر اندراج، قسم اور تاریخ سے فلٹر۔'),
  ] },
  { id: 'weather', group: 'reports', title: 'Weather', titleUr: 'موسم', steps: [
    S(C(1), '/weather', 'Forecast', 'پیشگوئی', 'Today hour by hour, or 3, 7, 15 days. ↻ refreshes.', 'آج گھنٹہ وار، یا 3، 7، 15 دن۔ ↻ تازہ کرتا ہے۔'),
    S(C(2), '/weather', 'Kiln advice', 'بھٹے کے مشورے', 'Cover kachi bricks before rain, watch wind and heat, good drying days.', 'بارش سے پہلے کچی اینٹ ڈھانپیں، ہوا اور گرمی، اچھی سکھائی کے دن۔'),
  ] },

  // ---------------- Admin ----------------
  { id: 'settings', group: 'admin', title: 'Settings in Detail', titleUr: 'ترتیبات', steps: [
    S(C(1), '/settings', 'Rates, limits and prices', 'ریٹ، حدیں، قیمتیں', 'Each has its own Save and Reset. Hot lines behind the fire decides when cooling lines become Ready.', 'ہر ایک کا اپنا محفوظ اور ری سیٹ۔ آگ کے پیچھے گرم لائنیں طے کرتی ہیں کب لائن تیار ہو۔'),
    S(C(2), '/settings', 'Government rates', 'سرکاری ریٹ', 'For record only; no effect on wages, warning switch off.', 'صرف ریکارڈ؛ مزدوری پر اثر نہیں، انتباہ بند۔'),
    S(C(5), '/settings', 'Manage types', 'اقسام', 'Worker categories, purchase items, customer types, payment modes.', 'مزدوروں کی قسمیں، خریداری اشیاء، گاہک کی قسم، ادائیگی کے طریقے۔'),
  ] },
  { id: 'users', group: 'admin', title: 'Users and Permissions', titleUr: 'صارفین اور اجازتیں', steps: [
    S(C(1), '/users', 'New user', 'نیا صارف', 'Username, password and role: owner, accountant, munshi, mistri or viewer.', 'صارف نام، پاس ورڈ اور کردار: مالک، اکاؤنٹنٹ، منشی، مستری یا ویور۔'),
    S(C(2), '/users', 'Permissions', 'اجازتیں', 'Change a role here; Permissions fine-tunes view, add, edit and delete.', 'یہاں کردار بدلیں؛ اجازتوں سے دیکھنا، شامل، ترمیم، حذف۔'),
  ] },
  { id: 'closeday', group: 'admin', title: 'Closing a Day', titleUr: 'دن بند کرنا', steps: [
    S('[data-tour="day-progress"]', '/daily', 'Day complete?', 'دن مکمل؟', 'All checks green and the cash count matches.', 'سب نشان سبز اور نقدی گنتی درست۔'),
    S('[data-tour="close-day"]', '/daily', 'Close or reopen', 'بند یا دوبارہ کھولیں', 'Close Day locks this day and earlier for staff. Reopen Day to fix something, then close again.', 'دن بند کرنے سے یہ اور پچھلے دن عملے کے لیے بند۔ درستگی کے لیے دوبارہ کھولیں، پھر بند کریں۔'),
  ] },
  { id: 'help', group: 'admin', title: 'Backups, Updates and Help', titleUr: 'بیک اپ، اپڈیٹ اور مدد', steps: [
    S('[data-tour="help"]', '/home', 'Backups and updates', 'بیک اپ اور اپڈیٹ', 'The database is backed up every night at 11:59 pm; the server commands are in the written guide (? › Read the full guide), with answers to common problems.', 'ہر رات 11:59 پر ڈیٹا کا بیک اپ؛ سرور کے احکامات اور عام مسائل کے حل تحریری رہنما میں ہیں (? › مکمل رہنما)۔'),
  ] },
];
