# تدفق POS دون اتصال

- تسجيل الحساب الرسمي يبقى Online فقط.
- PIN يختار موظفًا مسجلًا مسبقًا؛ حد الفشل 5، ولا ينشئ Auth أوtenant/branch/device/DEK authority.
- restart دون logout يحافظ على الحزمة المشفرة ويطلب PIN.
- checkout الفعلي يستدعي Pilot disposition داخل فرع `navigator.onLine === false`.
- مع الأعلام الحالية false يبقى السلوك الحالي كما هو ولا يحدث اعتراض أوdispatch.
- عند الاعتماد اللاحق، لا يقبل Pilot إلا `order.create` وطرق الدفع الثمانية كإقرار موظف، مع provider state غير متحقق.
- المخزون المحلي = confirmed - pending - syncing، ومحصور عند الصفر ولا يسمح بالسالب.
- logout الصريح يقفل الأعمال المحلية فورًا ويحفظ pending مشفرًا لاستعادة الحساب نفسه Online.
