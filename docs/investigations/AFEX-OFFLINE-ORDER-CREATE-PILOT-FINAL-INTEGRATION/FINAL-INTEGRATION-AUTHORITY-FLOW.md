# مسار السلطة

1. `requireAuthorizationContext` يستدعي `requireVerifiedAuthContext` خادميًا.
2. النقل يشتق subject وAuth session وPOS actor session والموظف الفعلي والمستأجر والفرع ديناميكيًا لكل طلب، دون متغيرات UUID ثابتة.
3. أي استبدال account/tenant/branch/employee داخل envelope أوclaim يفشل قبل RPC، وأي استبدال device/generation يفشل داخل resolver/facade الموثوق.
4. envelope غير القابل للتغيير يربط الجهاز وأجيال bootstrap/enrollment/command/key/namespace، ويرفض النقل batch مختلط الأجهزة.
5. resolver يعيد نتيجة واحدة موضعية لكل claim وبحد 1000؛ المفقود أوالزائد أوالمكرر أوالمشوه يفشل مغلقًا.
6. acquisition ينفذ فقط للحالة المؤهلة `order.create`؛ Core V2 يبقى السلطة الوحيدة.
7. الإيصال لا يُقرأ إلا بعد تحقق Auth/POS جديد ثم فحص claim محلي وإعادة تحقق authority داخل facade.

لا يصل المتصفح إلى private functions أو`service_role` أوأي secret.
