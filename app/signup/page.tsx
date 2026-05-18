'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type SignupFormState = {
  tenantName: string
  username: string
  password: string
  confirmPassword: string
  firstName: string
  lastName: string
  phone: string
  email: string
  branchName: string
}

const initialFormState: SignupFormState = {
  tenantName: '',
  username: '',
  password: '',
  confirmPassword: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  branchName: '',
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const englishUsernamePattern = /^[a-z0-9._-]+$/
const arabicLettersPattern = /[\u0600-\u06FF]/
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%]).{8,}$/
const benefits = ['إنشاء فوري', 'متعدد الفروع', 'جاهز لنقطة البيع']
const steps = ['إنشاء المنشأة', 'إضافة الفرع', 'الدخول للنظام']
const passwordRequirements = [
  'على الأقل 8 أحرف',
  'حرف كبير واحد على الأقل (A-Z)',
  'حرف صغير واحد على الأقل (a-z)',
  'رقم واحد على الأقل (0-9)',
  'رمز واحد على الأقل من هذه الرموز: @#$%',
]

type FieldAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
type LegalModalType = 'terms' | 'privacy'

const legalDocuments: Record<
  LegalModalType,
  {
    title: string
    content: string[]
  }
> = {
  terms: {
    title: 'شروط الاستخدام',
    content: [
      'شروط الاستخدام - AFEX',
      'تحدد شروط الاستخدام هذه، والتي تشمل أيضًا سياسة الخصوصية وسياسة ملفات تعريف الارتباط وملحق معالجة البيانات وشروط تكامل الأطراف الثالثة ("الشروط") الأحكام والشروط الخاصة باستخدامك للخدمات المقدمة من شركة Five Galaxies Commerce Ltd. من خلال النقر على "قبول" أو استخدام أي من الخدمات، فإنك تقر بأنك قرأت هذه الشروط وفهمتها ووافقت عليها نيابةً عن أي شخص أو جهة تستخدم الخدمات لصالحها.',
      'إذا كنت لا توافق على أي من هذه الشروط، فلا ينبغي لك استخدام الخدمات. جميع الحقوق غير الممنوحة صراحةً في هذه الشروط محفوظة لشركة AFEX Commerce.',
      'قد نقوم بتعديل هذه الشروط من وقت لآخر من خلال نشر التحديثات على الموقع الإلكتروني. ننصحك بمراجعة الشروط بشكل دوري للاطلاع على أي تحديثات أو تغييرات قد تؤثر عليك، وإذا لم توافق على هذه التعديلات، فيجب عليك التوقف عن استخدام الخدمات.',
      'تم تحديث شروط الاستخدام هذه بتاريخ 28 نوفمبر 2023.',
      'التعريفات',
      '"العميل" يعني الشخص أو الجهة التي تسجل لاستخدام الخدمة من خلال إنشاء حساب AFEX.',
      '"المستخدم المصرح له" يعني أي شخص أو جهة يصرح لها العميل باستخدام الخدمة نيابةً عنه.',
      '"البيانات الشخصية" تعني أي بيانات تتعلق بشخص طبيعي محدد أو يمكن التعرف عليه.',
      '"البيانات الحساسة" تعني أي بيانات تكشف عن الأصل العرقي أو الآراء السياسية أو المعتقدات الدينية أو البيانات الصحية أو الجنائية وغيرها.',
      '"نحن" أو "AFEX Commerce" تعني شركة AFEX Commerce Ltd.',
      '"الخدمات" تعني منتجات وخدمات نقاط البيع وإدارة المخزون الخاصة بـ AFEX، وأي ميزات أو تقنيات أو وظائف مرتبطة بها.',
      '"أنت" يعني العميل، ويشمل المستخدمين المصرح لهم حيثما يسمح السياق بذلك.',
      'معلومات الحساب',
      'لاستخدام خدماتنا بشكل قانوني، يجب أن تكون قد بلغت الحد الأدنى للعمر المحدد في بلد إقامتك لتقديم خدمات مجتمع المعلومات.',
      'أنت توافق على تقديم معلومات دقيقة وحديثة وكاملة عن الحساب، وتحديثها باستمرار عند الحاجة.',
      'استخدام حسابك',
      'تمنحك AFEX Commerce ترخيصًا محدودًا وغير حصري وغير قابل للتحويل وقابل للإلغاء لاستخدام الخدمات بما يتوافق مع أعمال العميل وهذه الشروط.',
      'أنت مسؤول عن أي نشاط يتم عبر حسابك، بما في ذلك الأنشطة التي يقوم بها المستخدمون المصرح لهم.',
      'إلغاء الحسابات',
      'يجوز لنا تعليق أو إلغاء حسابك في أي وقت بإشعار خطي. كما يجوز الإلغاء الفوري إذا خالفت هذه الشروط أو القوانين المعمول بها.',
      'يمكنك إلغاء حسابك في أي وقت عبر إرسال بريد إلكتروني إلى privacy@AFEX.com.',
      'الرسوم والضرائب',
      'الرسوم الخاصة بالخدمات موضحة على الموقع الإلكتروني وقد تخضع للتغيير. الرسوم غير قابلة للاسترداد ما لم ينص القانون على خلاف ذلك.',
      'قد يتم تطبيق رسوم بنكية إضافية من قبل البنك الخاص بك عند الدفع.',
      'ترقية أو تخفيض الحساب',
      'يمكنك ترقية أو تخفيض حسابك في أي وقت أثناء تسجيل الدخول إلى حسابك.',
      'قد يؤدي تخفيض الحساب إلى فقدان بعض المحتوى أو الميزات أو السعة.',
      'حدود الخطط والاستخدام المعقول',
      'تتوفر الخدمات ضمن باقات وخطط مختلفة تحدد عدد المتاجر والموظفين والميزات المتاحة.',
      'يجوز لنا مطالبتك بالترقية إذا تجاوزت حدود خطتك الحالية.',
      'إخلاء المسؤولية عن الضمانات',
      'يتم استخدام الخدمات على مسؤوليتك الخاصة، ويتم تقديمها "كما هي" و"حسب التوفر" دون أي ضمانات صريحة أو ضمنية.',
      'إخلاء المسؤولية',
      'أنت تتحمل المسؤولية الكاملة عن استخدام الخدمات، ولن تتحمل AFEX Commerce أي مسؤولية عن أي أضرار غير مباشرة أو خسائر في الأرباح أو البيانات.',
      'مسؤوليتك عن استخدام الخدمات',
      'أنت مسؤول عن الحفاظ على أمان حسابك وكلمة المرور الخاصة بك.',
      'عدم الاستخدام غير القانوني أو الضار',
      'يجب ألا تستخدم الخدمات لأي غرض غير قانوني أو ضار أو ينتهك حقوق الملكية الفكرية أو يؤثر على أنظمة الخدمة.',
      'سياسة الاستخدام المعقول',
      'يجب استخدام الخدمات بطريقة معقولة. وقد نقوم بفرض قيود إذا تسبب استخدامك في التأثير على أداء الخدمات.',
      'الاستخدام السليم',
      'يحظر استخدام الخدمات في أي نشاط غير قانوني أو مسيء أو ينتهك خصوصية الآخرين أو يجمع البيانات بطرق غير مصرح بها.',
      'الملكية الفكرية',
      'جميع الحقوق المتعلقة بالمحتوى والبرمجيات والتصميمات الخاصة بالخدمات محفوظة لشركة AFEX Commerce.',
      'حماية البيانات',
      'نحن نطبق إجراءات تقنية وتنظيمية مناسبة لحماية البيانات المدخلة إلى الخدمات.',
      'حذف البيانات',
      'سيتم حذف البيانات المقدمة من قبلك بعد 30 يومًا من إنهاء الحساب أو انتهاء الشروط، ما لم يتطلب القانون الاحتفاظ بها لفترة أطول.',
      'القانون الحاكم',
      'تخضع هذه الشروط للقانون الإنجليزي وتختص المحاكم الإنجليزية بالنظر في أي نزاعات.',
      'أحكام عامة',
      'قد نعمل مع شركاء وموزعين وأطراف ثالثة لتقديم الخدمات أو الترويج لها. إذا تم اعتبار أي بند غير قانوني أو غير قابل للتنفيذ، تبقى بقية البنود سارية المفعول.',
    ],
  },
  privacy: {
    title: 'سياسة الخصوصية',
    content: [
      'سياسة الخصوصية',
      'توضح سياسة الخصوصية هذه كيفية قيام شركة AFEX Commerce Ltd ("AFEX Commerce" أو "نحن") والشركات التابعة لها بجمع معلوماتك واستخدامها والإفصاح عنها ونقلها وحمايتها وتخزينها ومعالجتها عند استخدام خدماتنا.',
      'تلتزم AFEX Commerce بحماية الخصوصية والمعالجة الآمنة للبيانات الشخصية الخاصة بعملائها بشفافية تامة، كما تلتزم بالامتثال الكامل للائحة العامة لحماية البيانات للاتحاد الأوروبي (GDPR) والتشريعات المعمول بها في إنجلترا.',
      'تم تحديث سياسة الخصوصية هذه بتاريخ 28 نوفمبر 2023.',
      'التعريفات',
      '"الخدمات" تعني منتجات وخدمات نقاط البيع وإدارة المخزون الخاصة بـ AFEX، وأي ميزات أو تقنيات أو وظائف مرتبطة بها، بما في ذلك تطبيقات AFEX POS وAFEX Dashboard وAFEX KDS وAFEX CDS والموقع الإلكتروني AFEX.com.',
      '"العميل" أو "التاجر" يعني الشخص أو الجهة التي تسجل لاستخدام الخدمة عبر إنشاء حساب AFEX.',
      '"أنت" يعني العميل، ويشمل المستخدمين المصرح لهم حسب السياق.',
      'تحديد مسؤول معالجة البيانات',
      'وفقًا لقوانين الخصوصية الأوروبية، تعمل AFEX Commerce كـ "متحكم بالبيانات" أو "معالج بيانات" حسب نوع البيانات الشخصية المعالجة.',
      'بشكل عام، تعتبر AFEX Commerce متحكمًا ببيانات العملاء والتجار، ومعالجًا لبيانات المستهلكين والموظفين حيث يكون العميل هو المتحكم الرئيسي.',
      'أنواع البيانات الشخصية التي يتم جمعها',
      'نقوم بجمع عدة أنواع من البيانات الشخصية، مثل: الاسم الأول والأخير، رقم الهوية، البريد الإلكتروني، العنوان، رقم الهاتف، بيانات النشاط التجاري والمعاملات.',
      'كما نقوم بجمع معلومات تخص العملاء والتجار والمستهلكين والموظفين وزوار الموقع والتطبيقات.',
      'كيفية جمع المعلومات',
      'نقوم بجمع المعلومات عند إنشاء حساب، تعديل الملف الشخصي، الاشتراك بالخدمات، التواصل مع الدعم الفني، إجراء عمليات الدفع، المشاركة في الاستبيانات أو المناقشات.',
      'كما نقوم بجمع بيانات تلقائية مثل عنوان IP، نوع المتصفح، بيانات الجهاز، ملفات تعريف الارتباط (Cookies).',
      'الأساس القانوني لمعالجة البيانات',
      'نقوم بمعالجة بياناتك عندما يكون ذلك ضروريًا لتقديم الخدمات، الامتثال للالتزامات القانونية، حماية المصالح المشروعة، أو بناءً على موافقتك.',
      'كيفية استخدام معلوماتك الشخصية',
      'قد نستخدم معلوماتك من أجل تمكينك من استخدام الخدمات، تحسين الخدمات وتطوير منتجات جديدة، إرسال الإشعارات والتنبيهات، التسويق والعروض الترويجية بموافقتك، ومنع الاحتيال والأنشطة غير القانونية.',
      'مشاركة المعلومات والإفصاح عنها',
      'قد نشارك معلوماتك مع مزودي الخدمات والشركاء، الجهات الحكومية عند الطلب القانوني، الجهات ذات العلاقة أثناء عمليات الدمج أو الاستحواذ، وشركات مجموعة Teya عند الحاجة التشغيلية.',
      'حقوقك المتعلقة بالخصوصية',
      'وفقًا للائحة GDPR، لديك حق الوصول إلى بياناتك، طلب حذف البيانات، الاعتراض على المعالجة، تقييد المعالجة، نقل البيانات، والاعتراض على القرارات الآلية.',
      'يمكنك ممارسة هذه الحقوق عبر البريد الإلكتروني: privacy@AFEX.com',
      'نقل البيانات دوليًا',
      'قد يتم نقل بياناتك إلى دول خارج بلد إقامتك، بما في ذلك دول خارج الاتحاد الأوروبي، مع تطبيق الضمانات المناسبة لحماية بياناتك.',
      'مدة الاحتفاظ بالبيانات',
      'نحتفظ ببياناتك فقط طالما كان ذلك ضروريًا لتقديم الخدمات أو للامتثال للقوانين المعمول بها.',
      'استخدام الأطفال للخدمات',
      'الخدمات غير موجهة للأفراد دون سن 16 عامًا، ولا نقوم بجمع بيانات شخصية للأطفال عن قصد.',
      'الأمان',
      'نطبق إجراءات تقنية وتنظيمية مناسبة لحماية بياناتك من الوصول غير المصرح به أو الاستخدام غير القانوني.',
      'تحديثات سياسة الخصوصية',
      'نحتفظ بالحق في تعديل سياسة الخصوصية هذه من وقت لآخر، وسيتم نشر أي تحديثات على موقعنا الإلكتروني.',
      'معلومات إضافية',
      'إذا كان لديك أي استفسارات حول سياسة الخصوصية أو ممارسات الخصوصية الخاصة بـ AFEX Commerce، يمكنك التواصل معنا عبر: dpo@AFEX.com',
      'العنوان: AFEX Commerce Ltd. 41 Lothbury, London, EC2R 7HF, United Kingdom',
    ],
  },
}

function getApiErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') {
    return 'تعذر إنشاء المنشأة. حاول مرة أخرى.'
  }

  const response = value as { error?: unknown; details?: unknown }
  const details =
    typeof response.details === 'string' ? response.details.trim() : ''
  const error = typeof response.error === 'string' ? response.error.trim() : ''

  return details || error || 'تعذر إنشاء المنشأة. حاول مرة أخرى.'
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function AvailableCheckIcon() {
  return (
    <span className="pointer-events-none absolute left-3 top-[38px] flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/20 text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.22)]">
      <svg
        viewBox="0 0 14 14"
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
      >
        <path
          d="m3.5 7.2 2.2 2.2 4.8-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function AvailabilityDropdown({
  message,
  onSuggestionClick,
  suggestions = [],
}: {
  message: string
  onSuggestionClick?: (suggestion: string) => void
  suggestions?: string[]
}) {
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-full rounded-2xl border border-cyan-300/15 bg-[#07111f]/95 px-3 py-2.5 text-right shadow-[0_18px_70px_rgba(0,0,0,0.42),0_0_34px_rgba(34,211,238,0.12)] backdrop-blur-xl">
      <p className="text-[11px] font-black text-rose-100">{message}</p>
      {suggestions.length > 0 ? (
        <>
          <p className="mt-2 text-[11px] font-black text-cyan-100/80">
            اقتراحات متاحة
          </p>
          <div className="mt-2 grid max-h-28 gap-1.5 overflow-hidden">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestionClick?.(suggestion)}
                className="w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-left text-xs font-black text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.08)] transition hover:border-cyan-200/45 hover:bg-cyan-300/18"
                dir="ltr"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function LegalDocumentModal({
  document,
  onClose,
}: {
  document: (typeof legalDocuments)[LegalModalType]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020713]/75 px-4 py-6 backdrop-blur-sm">
      <div
        className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-cyan-300/18 bg-[#07111f]/95 text-right shadow-[0_30px_120px_rgba(0,0,0,0.55),0_0_45px_rgba(34,211,238,0.12)]"
        dir="rtl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs font-black tracking-[0.28em] text-cyan-200/70">
              AFEX LEGAL
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">
              {document.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-lg font-black text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/18"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-sm leading-8 text-slate-200">
          <div className="space-y-4">
            {document.content.map((paragraph, index) => (
              <p
                key={`${document.title}-${index}`}
                className={
                  index === 0 || paragraph.length < 35
                    ? 'font-black text-cyan-100'
                    : 'text-slate-200'
                }
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState<SignupFormState>(initialFormState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [legalModal, setLegalModal] = useState<LegalModalType | null>(null)
  const [success, setSuccess] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [tenantNameSuggestions, setTenantNameSuggestions] = useState<string[]>([])
  const [tenantNameAvailability, setTenantNameAvailability] =
    useState<FieldAvailability>('idle')
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([])
  const [usernameAvailability, setUsernameAvailability] =
    useState<FieldAvailability>('idle')
  const [emailAvailability, setEmailAvailability] =
    useState<FieldAvailability>('idle')
  const [phoneAvailability, setPhoneAvailability] =
    useState<FieldAvailability>('idle')
  const normalizedTenantName = form.tenantName.trim()
  const normalizedUsername = form.username.trim().toLowerCase()
  const normalizedEmail = form.email.trim().toLowerCase()
  const normalizedPhone = normalizePhone(form.phone)
  const isTenantNameFormatValid = normalizedTenantName.length > 1
  const isUsernameFormatValid =
    normalizedUsername.length > 0 &&
    !arabicLettersPattern.test(normalizedUsername) &&
    englishUsernamePattern.test(normalizedUsername)
  const isEmailFormatValid = emailPattern.test(normalizedEmail)
  const isPhoneFormatValid = normalizedPhone.length >= 9
  const showTenantNameAvailableCheck =
    isTenantNameFormatValid &&
    tenantNameAvailability === 'available' &&
    tenantNameSuggestions.length === 0
  const showUsernameAvailableCheck =
    isUsernameFormatValid &&
    usernameAvailability === 'available' &&
    usernameSuggestions.length === 0
  const showEmailAvailableCheck =
    isEmailFormatValid && emailAvailability === 'available'
  const showPhoneAvailableCheck =
    isPhoneFormatValid && phoneAvailability === 'available'
  const showTenantNameTakenDropdown =
    isTenantNameFormatValid && tenantNameAvailability === 'taken'
  const showUsernameTakenDropdown =
    isUsernameFormatValid && usernameAvailability === 'taken'
  const showEmailTakenDropdown =
    isEmailFormatValid && emailAvailability === 'taken'
  const showPhoneTakenDropdown =
    isPhoneFormatValid && phoneAvailability === 'taken'

  function updateField(field: keyof SignupFormState, value: string) {
    if (field === 'tenantName') {
      setTenantNameSuggestions([])
      setTenantNameAvailability('idle')
    }

    if (field === 'username') {
      setUsernameSuggestions([])
      setUsernameAvailability('idle')
    }

    if (field === 'email') {
      setEmailAvailability('idle')
    }

    if (field === 'phone') {
      setPhoneAvailability('idle')
    }

    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  useEffect(() => {
    if (!normalizedUsername || !isUsernameFormatValid) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      try {
        setUsernameAvailability('checking')
        const response = await fetch('/api/auth/check-username', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: normalizedUsername }),
        })
        const result = await response.json().catch(() => null)

        if (cancelled) {
          return
        }

        if (!response.ok || !result?.ok) {
          if (response.status === 409) {
            setUsernameAvailability('taken')
            setUsernameSuggestions([])
            return
          }

          setUsernameAvailability('idle')
          return
        }

        const suggestions = Array.isArray(result.suggestions)
          ? result.suggestions.filter(
              (suggestion: unknown): suggestion is string =>
                typeof suggestion === 'string'
            )
          : []

        setUsernameAvailability(result.exists ? 'taken' : 'available')
        setUsernameSuggestions(result.exists ? suggestions : [])
      } catch {
        if (!cancelled) {
          setUsernameAvailability('idle')
        }
      }
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isUsernameFormatValid, normalizedUsername])

  useEffect(() => {
    if (!normalizedTenantName || !isTenantNameFormatValid) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      try {
        setTenantNameAvailability('checking')
        const response = await fetch('/api/auth/check-username', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tenantName: normalizedTenantName }),
        })
        const result = await response.json().catch(() => null)

        if (cancelled) {
          return
        }

        const check = result?.checks?.tenantName

        if (!response.ok || !result?.ok || !check) {
          setTenantNameAvailability('idle')
          return
        }

        const suggestions = Array.isArray(check.suggestions)
          ? check.suggestions.filter(
              (suggestion: unknown): suggestion is string =>
                typeof suggestion === 'string'
            )
          : []

        setTenantNameAvailability(check.exists ? 'taken' : 'available')
        setTenantNameSuggestions(check.exists ? suggestions : [])
      } catch {
        if (!cancelled) {
          setTenantNameAvailability('idle')
        }
      }
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isTenantNameFormatValid, normalizedTenantName])

  useEffect(() => {
    if (!normalizedEmail || !isEmailFormatValid) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      try {
        setEmailAvailability('checking')
        const response = await fetch('/api/auth/check-username', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: normalizedEmail }),
        })
        const result = await response.json().catch(() => null)

        if (cancelled) {
          return
        }

        const check = result?.checks?.email

        if (!response.ok || !result?.ok || !check) {
          setEmailAvailability('idle')
          return
        }

        setEmailAvailability(check.exists ? 'taken' : 'available')
      } catch {
        if (!cancelled) {
          setEmailAvailability('idle')
        }
      }
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isEmailFormatValid, normalizedEmail])

  useEffect(() => {
    if (!normalizedPhone || !isPhoneFormatValid) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      try {
        setPhoneAvailability('checking')
        const response = await fetch('/api/auth/check-username', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: normalizedPhone }),
        })
        const result = await response.json().catch(() => null)

        if (cancelled) {
          return
        }

        const check = result?.checks?.phone

        if (!response.ok || !result?.ok || !check) {
          setPhoneAvailability('idle')
          return
        }

        setPhoneAvailability(check.exists ? 'taken' : 'available')
      } catch {
        if (!cancelled) {
          setPhoneAvailability('idle')
        }
      }
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isPhoneFormatValid, normalizedPhone])

  function validateForm() {
    const tenantName = form.tenantName.trim()
    const username = form.username.trim().toLowerCase()
    const password = form.password
    const confirmPassword = form.confirmPassword
    const firstName = form.firstName.trim()
    const lastName = form.lastName.trim()
    const fullName = lastName ? `${firstName} ${lastName}` : firstName
    const phone = form.phone.trim()
    const email = form.email.trim().toLowerCase()
    const branchName = form.branchName.trim()

    if (!tenantName) {
      throw new Error('اسم المؤسسة / الشركة مطلوب')
    }

    if (!username) {
      throw new Error('اسم المستخدم مطلوب')
    }

    if (arabicLettersPattern.test(username) || !englishUsernamePattern.test(username)) {
      throw new Error('اسم المستخدم يجب أن يكون باللغة الإنجليزية فقط')
    }

    if (!email || !emailPattern.test(email)) {
      throw new Error('البريد الإلكتروني مطلوب ويجب أن يكون صحيحًا')
    }

    if (!phone) {
      throw new Error('رقم الجوال مطلوب')
    }

    if (!firstName) {
      throw new Error('الاسم الأول مطلوب')
    }

    if (!password || !confirmPassword) {
      throw new Error('كلمة المرور وتأكيد كلمة المرور مطلوبان')
    }

    if (arabicLettersPattern.test(password)) {
      throw new Error('كلمة المرور يجب أن تكون باللغة الإنجليزية')
    }

    if (!strongPasswordPattern.test(password)) {
      throw new Error('يجب الالتزام بتعليمات كلمة المرور لحماية بياناتك')
    }

    if (password !== confirmPassword) {
      throw new Error('كلمة المرور وتأكيدها غير متطابقين')
    }

    if (!termsAccepted) {
      throw new Error('يجب الموافقة على شروط الاستخدام وسياسة الخصوصية')
    }

    return {
      tenantName,
      username,
      password,
      fullName,
      phone,
      email,
      branchName,
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setLoading(true)
      setError('')
      setSuccess('')
      setUsernameSuggestions([])

      const payload = validateForm()
      const response = await fetch('/api/onboarding/create-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json().catch(() => null)

      if (process.env.NODE_ENV !== 'production') {
        console.info('[signup] create tenant response', {
          username: payload.username,
          ok: response.ok,
          status: response.status,
          available: response.ok,
          hasSuggestions: Array.isArray(result?.suggestions),
        })
      }

      if (!response.ok || !result?.success) {
        const suggestions = Array.isArray(result?.suggestions)
          ? result.suggestions.filter(
              (suggestion: unknown): suggestion is string =>
                typeof suggestion === 'string'
            )
          : []

        if (response.status === 409 && suggestions.length > 0) {
          setUsernameSuggestions(suggestions)
          setUsernameAvailability('taken')
          throw new Error('اسم المستخدم مستخدم بالفعل')
        }

        throw new Error(getApiErrorMessage(result))
      }

      setSuccess('تم إنشاء الحساب بنجاح. سيتم تحويلك إلى الصفحة الرئيسية خلال ثانيتين.')

      window.setTimeout(() => {
        router.replace('/')
      }, 2000)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'تعذر إنشاء المنشأة. حاول مرة أخرى.'
      )
    } finally {
      setLoading(false)
    }
  }

  const fieldClass =
    'h-12 w-full rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-white/[0.09] focus:ring-4 focus:ring-cyan-300/10'
  const labelClass = 'mb-2 block text-sm font-bold text-slate-200'

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030714] px-4 py-8 text-white sm:px-6 lg:px-8"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute left-[-10rem] bottom-[-10rem] h-[32rem] w-[32rem] rounded-full bg-emerald-400/16 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:76px_76px] opacity-25" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="order-1 rounded-[30px] border border-white/12 bg-white/[0.055] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:p-8 lg:order-none">
            <div className="mb-6 text-center">
              <div className="mb-4 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
                ابدأ منشأتك الآن
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
                إنشاء حساب جديد
              </h1>
              <p className="mt-2 text-sm text-slate-400">AFEX</p>
            </div>

            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100 shadow-[0_0_35px_rgba(251,113,133,0.08)]">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mb-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 shadow-[0_0_35px_rgba(52,211,153,0.08)]">
                {success}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="relative z-30 block">
                  <span className={labelClass}>اسم المؤسسة / الشركة *</span>
                  <input
                    type="text"
                    value={form.tenantName}
                    onChange={(event) =>
                      updateField('tenantName', event.target.value)
                    }
                    className={`${fieldClass} pl-11`}
                    placeholder="مثال: Leather Fix"
                    autoComplete="organization"
                    required
                  />
                  {showTenantNameAvailableCheck ? <AvailableCheckIcon /> : null}
                  {showTenantNameTakenDropdown ? (
                    <AvailabilityDropdown
                      message="اسم المؤسسة مستخدم بالفعل"
                      suggestions={tenantNameSuggestions}
                      onSuggestionClick={(suggestion) =>
                        updateField('tenantName', suggestion)
                      }
                    />
                  ) : null}
                </label>

                <label className="relative z-20 block">
                  <span className={labelClass}>اسم المستخدم *</span>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(event) =>
                      updateField('username', event.target.value)
                    }
                    className={`${fieldClass} pl-11 text-left`}
                    placeholder="owner"
                    autoComplete="username"
                    autoCapitalize="none"
                    inputMode="text"
                    lang="en"
                    pattern="[A-Za-z0-9._-]+"
                    required
                    spellCheck={false}
                    dir="ltr"
                  />
                  {showUsernameAvailableCheck ? <AvailableCheckIcon /> : null}
                  {showUsernameTakenDropdown ? (
                    <div className="absolute right-0 top-full z-50 mt-2 w-full rounded-2xl border border-cyan-300/15 bg-[#07111f]/95 px-3 py-2.5 text-right shadow-[0_18px_70px_rgba(0,0,0,0.42),0_0_34px_rgba(34,211,238,0.12)] backdrop-blur-xl">
                      <p className="text-[11px] font-black text-rose-100">
                        اسم المستخدم مستخدم بالفعل
                      </p>
                      <p className="text-[11px] font-black text-cyan-100/80">
                        اقتراحات متاحة
                      </p>
                      <div className="mt-2 grid max-h-28 gap-1.5 overflow-hidden">
                        {usernameSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => updateField('username', suggestion)}
                            className="w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-left text-xs font-black text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.08)] transition hover:border-cyan-200/45 hover:bg-cyan-300/18"
                            dir="ltr"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </label>

                <label className="relative z-20 block">
                  <span className={labelClass}>البريد الإلكتروني *</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    className={`${fieldClass} pl-11 text-left`}
                    placeholder="owner@example.com"
                    autoComplete="email"
                    required
                    dir="ltr"
                  />
                  {showEmailAvailableCheck ? <AvailableCheckIcon /> : null}
                  {showEmailTakenDropdown ? (
                    <AvailabilityDropdown message="البريد الإلكتروني مستخدم بالفعل" />
                  ) : null}
                </label>

                <label className="relative z-20 block">
                  <span className={labelClass}>رقم الجوال *</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    className={`${fieldClass} pl-11 text-left`}
                    placeholder="05xxxxxxxx"
                    autoComplete="tel"
                    required
                    dir="ltr"
                  />
                  {showPhoneAvailableCheck ? <AvailableCheckIcon /> : null}
                  {showPhoneTakenDropdown ? (
                    <AvailabilityDropdown message="رقم الجوال مستخدم بالفعل" />
                  ) : null}
                </label>

                <label className="block">
                  <span className={labelClass}>الاسم الأول *</span>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(event) =>
                      updateField('firstName', event.target.value)
                    }
                    className={fieldClass}
                    placeholder="مثال: فيصل"
                    autoComplete="given-name"
                    required
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>الاسم الأخير</span>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(event) =>
                      updateField('lastName', event.target.value)
                    }
                    className={fieldClass}
                    placeholder="مثال: أحمد"
                    autoComplete="family-name"
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>
                    كلمة المرور *
                    <span className="group relative mr-2 inline-flex align-middle">
                      <span
                        className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-xs font-black text-cyan-200"
                        aria-label="متطلبات كلمة المرور"
                      >
                        i
                      </span>
                      <span className="pointer-events-none absolute bottom-full right-0 z-30 mb-3 w-72 rounded-2xl border border-cyan-300/20 bg-[#07111f] p-4 text-right text-xs font-bold text-slate-200 opacity-0 shadow-[0_18px_70px_rgba(0,0,0,0.45),0_0_35px_rgba(34,211,238,0.12)] transition duration-150 group-hover:opacity-100">
                        <span className="mb-3 block text-sm font-black text-cyan-200">
                          متطلبات كلمة المرور
                        </span>
                        <span className="space-y-2">
                          {passwordRequirements.map((requirement) => (
                            <span
                              key={requirement}
                              className="flex items-center gap-2"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                              <span>{requirement}</span>
                            </span>
                          ))}
                        </span>
                      </span>
                    </span>
                  </span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      updateField('password', event.target.value)
                    }
                    className={`${fieldClass} text-left`}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    inputMode="text"
                    lang="en"
                    required
                    spellCheck={false}
                    dir="ltr"
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>تأكيد كلمة المرور *</span>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) =>
                      updateField('confirmPassword', event.target.value)
                    }
                    className={`${fieldClass} text-left`}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    inputMode="text"
                    lang="en"
                    required
                    spellCheck={false}
                    dir="ltr"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className={labelClass}>اسم الفرع</span>
                  <input
                    type="text"
                    value={form.branchName}
                    onChange={(event) =>
                      updateField('branchName', event.target.value)
                    }
                    className={fieldClass}
                    placeholder="اختياري، مثال: الفرع الرئيسي"
                    autoComplete="organization-title"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-cyan-300/18 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-slate-200">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-cyan-300/35 bg-[#07111f] text-cyan-300 accent-cyan-300"
                  />
                  <span className="leading-7">
                    أوافق على{' '}
                    <button
                      type="button"
                      onClick={() => setLegalModal('terms')}
                      className="font-black text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-cyan-100"
                    >
                      شروط الاستخدام
                    </button>{' '}
                    و{' '}
                    <button
                      type="button"
                      onClick={() => setLegalModal('privacy')}
                      className="font-black text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-cyan-100"
                    >
                      سياسة الخصوصية
                    </button>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-[52px] w-full rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-base font-black text-slate-950 shadow-[0_20px_60px_rgba(45,212,191,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(45,212,191,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'جارٍ إنشاء المنشأة...' : 'إنشاء المنشأة'}
              </button>

              <Link
                href="/"
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-black text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-300/15"
              >
                العودة إلى القائمة الرئيسية
              </Link>
            </form>

            <p className="mt-5 text-center text-sm text-slate-400">
              لديك حساب بالفعل؟{' '}
              <Link
                href="/login"
                className="font-black text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-cyan-100"
              >
                تسجيل الدخول
              </Link>
            </p>
          </section>

          <section className="relative overflow-hidden rounded-[30px] border border-white/12 bg-white/[0.045] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-8">
            <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-cyan-300/14 blur-3xl" />
            <div className="absolute -bottom-16 right-10 h-52 w-52 rounded-full bg-emerald-300/12 blur-3xl" />

            <div className="relative flex h-full flex-col justify-between gap-8">
              <div>
                <Image
                  src="/brand/afex-logo.png"
                  alt="AFEX"
                  width={720}
                  height={260}
                  priority
                  className="mb-7 h-20 w-auto object-contain drop-shadow-[0_0_24px_rgba(45,212,191,0.24)]"
                />

                <h2 className="text-3xl font-black leading-tight text-white md:text-4xl">
                  ابدأ منشأتك على النظام خلال دقائق.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-8 text-slate-300 md:text-base">
                  أنشئ حساب المنشأة والمستخدم الرئيسي والفرع الأول تلقائيًا، ثم
                  ابدأ بإدارة المبيعات والفواتير من مكان واحد.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {benefits.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-3 text-sm font-bold text-slate-200"
                    >
                      <span className="mb-2 block h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.9)]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[26px] border border-cyan-300/25 bg-[#07111f]/85 p-4 shadow-[0_0_55px_rgba(34,211,238,0.12)]">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-cyan-200/70">ONBOARDING</p>
                    <p className="mt-1 text-sm font-black text-white">
                      خطوات الانطلاق
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-200">
                    سريع
                  </span>
                </div>

                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div
                      key={step}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.045] p-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-l from-cyan-300 to-emerald-300 text-sm font-black text-slate-950">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-black text-white">{step}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          يتم تجهيزها تلقائيًا ضمن تدفق الإنشاء.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      {legalModal ? (
        <LegalDocumentModal
          document={legalDocuments[legalModal]}
          onClose={() => setLegalModal(null)}
        />
      ) : null}
    </main>
  )
}
