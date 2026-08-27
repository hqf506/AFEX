# خطة التأهيل اليدوي المنضبط

## المتطلبات

حساب/tenant/branch/device/موظفان/مخزون/طلبات AFEX اختبارية معزولة، دون أرقام أوعملاء أومزودات حقيقية. إبقاء WhatsApp والطباعة والإشعارات والدفع الخارجي معطلة.

## التسلسل

1. اترك الأعلام الحساسة الاثني عشر false دائمًا. عيّن أولًا متغيرات scope الخمسة على UUIDs لنطاق الاختبار المعزول فقط: account ثم tenant ثم branch ثم managed device ثم pre-enrolled employee.
2. بعد مراجعة القيم الخمس، عيّن `AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED=true` للنطاق التجريبي فقط. غياب أي قيمة أوعدم تطابقها يجب أن يفشل مغلقًا.
3. Online login، POS actor، device registration/activation، employee enrollment، inventory publication، bootstrap.
4. افصل الشبكة، اختبر PIN الصحيح و5 إخفاقات والقفل، ثم restart بلا logout.
5. اختبر `order.create` بكل طرق الدفع الثمانية، zero/insufficient stock، pending/syncing وإعادة التشغيل.
6. أعد الشبكة: تحقق من account/actor، resolve، idempotent acquisition، stable receipt، ولا effect خارجي.
7. جرّب scope/device/generation hostile mismatches وسبعة commands مؤجلة؛ يجب رفضها.
8. نفّذ logout: PIN/order/switch/receipt تتوقف فورًا، والبيانات pending تبقى مشفرة؛ اختبر same-account recovery ورفض حساب مختلف.
9. للإيقاف العادي، عيّن `AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED=false` أولًا ثم أزل متغيرات scope الخمسة. لا تُحذف الأوامر المشفرة المعلّقة. ملف deactivation الطارئ يدوي فقط ولا يُنفّذ ضمن التأهيل الاعتيادي.

## التوقف والدليل

توقف عند اختلاف authority، malformed resolver، side effect، provider call، سالب مخزون، duplicate business object، أونجاح command غير `order.create`. احفظ timestamps، correlation IDs غير الحساسة، catalog ACL counts، command states والإيصالات المحجوبة؛ لا تحفظ PIN أوtoken أوpayload حساس.
