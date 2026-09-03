# خطة التأهيل اليدوي المنضبط

## المتطلبات

حساب AFEX صالح مع tenant/branch/device/موظف مسجل ومخزون/طلبات اختبارية، دون أرقام أوعملاء أومزودات حقيقية. إبقاء WhatsApp والطباعة والإشعارات والدفع الخارجي معطلة.

## التسلسل

1. لا تضبط أي UUID ثابت. عيّن `AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED=true` على Preview فقط؛ المفتاح يتيح الميزة ولا يمنح authority.
2. سجّل الدخول Online بحساب منشأة صالح، ثم دع الخادم يشتق account/tenant/branch/POS actor من الجلسة الموثقة. يجب أن يفشل غياب المفتاح العالمي أوالجلسة/actor الصالحين مغلقًا.
3. Online login، POS actor، device registration/activation، employee enrollment، inventory publication، bootstrap.
4. افصل الشبكة، اختبر PIN الصحيح و5 إخفاقات والقفل، ثم restart بلا logout.
5. اختبر `order.create` بكل طرق الدفع الثمانية، zero/insufficient stock، pending/syncing وإعادة التشغيل.
6. أعد الشبكة: تحقق من account/actor، resolve، idempotent acquisition، stable receipt، ولا effect خارجي.
7. بحسابي منشأتين صالحين منفصلين، جرّب tenant/branch/device/employee/generation hostile mismatches وسبعة commands مؤجلة؛ يجب رفضها دون مشاركة cache/outbox.
8. نفّذ logout: PIN/order/switch/receipt تتوقف فورًا، والبيانات pending تبقى مشفرة؛ اختبر same-account recovery ورفض حساب مختلف.
9. للإيقاف العادي، عيّن `AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED=false`. لا تُحذف الأوامر المشفرة المعلّقة. ملف deactivation الطارئ يدوي فقط ولا يُنفّذ ضمن التأهيل الاعتيادي.

## التوقف والدليل

توقف عند اختلاف authority، malformed resolver، side effect، provider call، سالب مخزون، duplicate business object، أونجاح command غير `order.create`. احفظ timestamps، correlation IDs غير الحساسة، catalog ACL counts، command states والإيصالات المحجوبة؛ لا تحفظ PIN أوtoken أوpayload حساس.
