# النقل الخادمي المحدود

المسار `POST /api/pos/offline-pilot` خادمي فقط، افتراضيًا 404 لأن `AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED` غير موجود/false. وحتى عند تفعيله لا يقبل النقل إلا إذا كانت متغيرات account/tenant/branch/device/employee الخمسة UUIDs مكتملة وتطابق السياق الخادمي الموثوق والـdevice داخل الطلب؛ أي غياب أوعدم تطابق يفشل مغلقًا قبل استدعاء facade. العمليات المغلقة:

- Online bootstrap.
- تسجيل/تفعيل الجهاز المدار.
- تسجيل الموظف واستبدال verifier الـPIN.
- نشر/قراءة snapshot المخزون.
- resolve + acquire لـ`order.create`.
- authority-first receipt lookup.
- logout والاستعادة للحساب نفسه.

الطلب الخارجي ذو مفاتيح دقيقة، والعمليات الأخرى مرفوضة. account/tenant/branch/employee تأتي من Auth + POS actor verification ولا تقبل من body كسلطة، ولا يسمح batch بأكثر من device واحد. بيانات المخزون تُقرأ خادميًا ضمن tenant/branch الموثوقين. لا provider، لا effects، ولا بيانات اعتماد تُعاد للمتصفح.
