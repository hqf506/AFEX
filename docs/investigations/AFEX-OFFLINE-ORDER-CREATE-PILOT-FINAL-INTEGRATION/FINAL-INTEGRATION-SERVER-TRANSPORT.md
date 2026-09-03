# النقل الخادمي المحدود

المسار `POST /api/pos/offline-pilot` خادمي فقط، افتراضيًا 404 لأن `AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED` غير موجود/false. هذا هو مفتاح الإتاحة التشغيلي الوحيد ولا يمنح أي سلطة. عند تفعيله يُشتق account/tenant/branch/employee/Auth session/POS actor session من السياق الخادمي المتحقق لكل طلب، بينما يتحقق resolver/facade من ملكية الجهاز والأجيال والحالة غير الملغاة. لا توجد متغيرات UUID ثابتة، وأي عدم تطابق يفشل مغلقًا. العمليات المغلقة:

- Online bootstrap.
- تسجيل/تفعيل الجهاز المدار.
- تسجيل الموظف واستبدال verifier الـPIN.
- نشر/قراءة snapshot المخزون.
- resolve + acquire لـ`order.create`.
- authority-first receipt lookup.
- logout والاستعادة للحساب نفسه.

الطلب الخارجي ذو مفاتيح دقيقة، والعمليات الأخرى مرفوضة. account/tenant/branch/employee تأتي من Auth + POS actor verification ولا تقبل من body كسلطة، ولا يسمح batch بأكثر من device واحد. claims الخاصة بالمخزون والإيصالات تُطابق السياق الموثوق قبل facade، وتعيد facades التحقق الذري من device/generations/frontier/idempotency. بيانات المخزون تُقرأ خادميًا ضمن tenant/branch الموثوقين. لا provider، لا effects، ولا بيانات اعتماد تُعاد للمتصفح.
