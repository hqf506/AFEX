# مسار السلطة

1. `requireAuthorizationContext` يستدعي `requireVerifiedAuthContext` خادميًا.
2. النقل يطابق subject وAuth session وPOS actor session والموظف الفعلي والمستأجر والفرع.
3. أي استبدال من المتصفح يفشل قبل RPC.
4. envelope غير القابل للتغيير يربط الجهاز وأجيال bootstrap/enrollment/command/key/namespace.
5. resolver يعيد نتيجة واحدة موضعية لكل claim وبحد 1000؛ المفقود أوالزائد أوالمكرر أوالمشوه يفشل مغلقًا.
6. acquisition ينفذ فقط للحالة المؤهلة `order.create`؛ Core V2 يبقى السلطة الوحيدة.
7. الإيصال لا يُقرأ إلا بعد تحقق سلطة جديد.

لا يصل المتصفح إلى private functions أو`service_role` أوأي secret.
