# دليل Admin/Dashboard Online-only

- Service Worker مسجل بنطاق `/pos/`، وnavigation fallback يقبل `/pos` فقط.
- كل `/api/` مستبعد من Service Worker.
- لا ملف تحت `app/admin` يستورد Offline bridge أوPilot transport أوPhase 3.
- لا Admin command outbox، replay، bootstrap package، أوPIN selector.
- `adminDashboardOfflineBehavior` ثابت false.

النتيجة: Admin/Dashboard خارج سلوك Offline بالكامل.
