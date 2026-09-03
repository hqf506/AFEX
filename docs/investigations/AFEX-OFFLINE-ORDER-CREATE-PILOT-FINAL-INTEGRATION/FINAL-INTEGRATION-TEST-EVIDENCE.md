# دليل الاختبارات

## البوابات المنفذة Offline

- المجموعة الكاملة `tests/pos-offline-*.test.mjs`: **170/170 PASS**، فشل 0.
- اختبار التكامل النهائي المركّز: **18/18 PASS**، ويتضمن غياب متغيرات UUID الخمسة، اشتقاق سلطة منشأتين مستقلتين، رفض tenant/branch/device/employee substitutions، والتحقق الجديد قبل receipt lookup.
- Core V2 order integration: **37/37 PASS**، فشل 0.
- Core V2 acquisition observability: **PASS**.
- TypeScript (`tsc --noEmit`): **PASS**.
- ESLint للنطاق المعدل: **PASS**، أخطاء 0 وتحذيرات 0.
- JSON ضمن Final Integration والحزمة المرجعية المرتبطة: **19/19 PASS** في بوابة التصحيح المركزة.
- SQL package manifest: **54/54 PASS** (54 ملفًا مشمولًا من 54، عدا manifest نفسه).
- Foundation DAG: **22 nodes / 21 edges / 0 cycles / 0 missing nodes**.
- طرق الدفع: **8/8** متميزة ومحفوظة.
- database dispatch allowlist: **`order.create` فقط**؛ الأوامر السبعة الأخرى محجوبة.
- الأعلام الحساسة/المعاملاتية: **12/12 false**.
- Activation static inventory: **13 owned functions / 12 bounded `service_role` facades**.
- هويات ملفات التنفيذ المركزة: **7/7 PASS**.
- `git diff --check`: **PASS**.
- Production build: **PASS** باستخدام قيم compile-only غير شبكية داخل process فقط؛ لم يُنشأ ملف `.env` ولم يُستخدم إعداد Production ولم يحدث اتصال DB.
- فحص الأسرار داخل نطاق المرحلة: **0 findings**.
- staged paths قبل بوابة التسليم: **0**؛ branch/HEAD ثابتان؛ upstream ahead/behind: **0/0**.

التغطية تشمل global default-off gate، منشأتين مستقلتين دون UUID allowlist، Online bootstrap gate، Auth/POS session mismatch، tenant/branch isolation، device/generation/revocation، employee/PIN/lock/logout/restart/recovery، حد 25 موظفًا وجهازًا فعالًا واحدًا لكل فرع، طرق الدفع الثماني، inventory zero/insufficient/frontier، idempotency والتعارض، authority-first receipt، malformed resolver، Admin boundary، وجميع الأعلام الحساسة false.

## قيد أداة ثابت غير مانع

لم يتوفر PostgreSQL-compatible parser مثبت محليًا، ولم تُثبت أي حزمة امتثالًا للقيود. التصنيف المحدود هو `POSTGRESQL_COMPATIBLE_PARSER_UNAVAILABLE`. عُوض ذلك فقط بفحوص SQL البنيوية والهوية والـDAG والـmanifest؛ لا يُدّعى parser PASS ولا runtime qualification.

لم يُشغّل Harness أوSQL أوDocker أوDB أوProvider، ولم تُنفذ أي كتابة أعمال. استُخدمت شبكة Vercel لقراءة إعداد Preview وتشغيل بوابات النشر فقط؛ متغيرا Supabase العامّان المطلوبان للبناء غير موجودين في Preview، وأعلام Pilot الستة كلها unset. لم يحدث اتصال Supabase/DB.
