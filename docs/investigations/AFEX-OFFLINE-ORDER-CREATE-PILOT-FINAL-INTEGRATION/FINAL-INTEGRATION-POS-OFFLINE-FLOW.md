# تدفق POS دون اتصال

- تسجيل الحساب الرسمي يبقى Online فقط.
- PIN يختار موظفًا مسجلًا مسبقًا؛ حد الفشل 5، ولا ينشئ Auth أوtenant/branch/device/DEK authority.
- restart دون logout يحافظ على الحزمة المشفرة ويطلب PIN.
- checkout الفعلي يستدعي Pilot disposition داخل فرع `navigator.onLine === false`.
- مفتاح الخادم العالمي لا يمنح authority؛ كل bootstrap/sync يعيد اشتقاق منشأة وPOS actor موثقين، ولا توجد هوية عميل ثابتة في environment.
- لا يقبل Pilot إلا `order.create` وطرق الدفع الثمانية كإقرار موظف، مع provider state غير متحقق.
- المخزون المحلي = confirmed - pending - syncing، ومحصور عند الصفر ولا يسمح بالسالب.
- logout الصريح يقفل الأعمال المحلية فورًا ويحفظ pending مشفرًا لاستعادة الحساب نفسه Online.
