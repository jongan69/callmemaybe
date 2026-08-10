export type RegionDefinition = {
  countryCode: string;
  countryName: string;
  callingCode: string;
  locales: readonly string[];
};

export const SUPPORTED_LOCALES = [
  "en",
  "hi",
  "ar",
  "vi",
  "de",
  "ja",
  "fr",
  "es",
  "pt",
  "pl",
  "bn",
  "th",
] as const;

export const REGION_DEFINITIONS: readonly RegionDefinition[] = [
  {
    countryCode: "US",
    countryName: "United States",
    callingCode: "+1",
    locales: ["en", "es"],
  },
  {
    countryCode: "SG",
    countryName: "Singapore",
    callingCode: "+65",
    locales: ["en"],
  },
  {
    countryCode: "MY",
    countryName: "Malaysia",
    callingCode: "+60",
    locales: ["en"],
  },
  {
    countryCode: "IN",
    countryName: "India",
    callingCode: "+91",
    locales: ["en", "hi", "bn"],
  },
  {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    callingCode: "+971",
    locales: ["ar", "en"],
  },
  {
    countryCode: "AU",
    countryName: "Australia",
    callingCode: "+61",
    locales: ["en"],
  },
  {
    countryCode: "CA",
    countryName: "Canada",
    callingCode: "+1",
    locales: ["en", "fr"],
  },
  {
    countryCode: "GB",
    countryName: "United Kingdom",
    callingCode: "+44",
    locales: ["en"],
  },
  {
    countryCode: "VN",
    countryName: "Vietnam",
    callingCode: "+84",
    locales: ["vi"],
  },
  {
    countryCode: "DE",
    countryName: "Germany",
    callingCode: "+49",
    locales: ["de"],
  },
  {
    countryCode: "JP",
    countryName: "Japan",
    callingCode: "+81",
    locales: ["ja"],
  },
  {
    countryCode: "FR",
    countryName: "France",
    callingCode: "+33",
    locales: ["fr"],
  },
  {
    countryCode: "MX",
    countryName: "Mexico",
    callingCode: "+52",
    locales: ["es"],
  },
  {
    countryCode: "BR",
    countryName: "Brazil",
    callingCode: "+55",
    locales: ["pt"],
  },
  {
    countryCode: "ID",
    countryName: "Indonesia",
    callingCode: "+62",
    locales: ["en"],
  },
  {
    countryCode: "PH",
    countryName: "Philippines",
    callingCode: "+63",
    locales: ["en"],
  },
  {
    countryCode: "KE",
    countryName: "Kenya",
    callingCode: "+254",
    locales: ["en"],
  },
  {
    countryCode: "NL",
    countryName: "Netherlands",
    callingCode: "+31",
    locales: ["en"],
  },
  {
    countryCode: "PL",
    countryName: "Poland",
    callingCode: "+48",
    locales: ["pl"],
  },
  {
    countryCode: "BD",
    countryName: "Bangladesh",
    callingCode: "+880",
    locales: ["bn", "en"],
  },
  {
    countryCode: "NG",
    countryName: "Nigeria",
    callingCode: "+234",
    locales: ["en"],
  },
  {
    countryCode: "OM",
    countryName: "Oman",
    callingCode: "+968",
    locales: ["ar", "en"],
  },
  {
    countryCode: "TH",
    countryName: "Thailand",
    callingCode: "+66",
    locales: ["th"],
  },
  {
    countryCode: "NA",
    countryName: "Namibia",
    callingCode: "+264",
    locales: ["en"],
  },
  {
    countryCode: "CM",
    countryName: "Cameroon",
    callingCode: "+237",
    locales: ["fr", "en"],
  },
  {
    countryCode: "MZ",
    countryName: "Mozambique",
    callingCode: "+258",
    locales: ["pt"],
  },
  {
    countryCode: "SA",
    countryName: "Saudi Arabia",
    callingCode: "+966",
    locales: ["ar", "en"],
  },
  {
    countryCode: "FI",
    countryName: "Finland",
    callingCode: "+358",
    locales: ["en"],
  },
] as const;

export const CONSENT_TEXT_VERSION = "2.1";
export const CALL_SCRIPT_VERSION = "2.0";

/**
 * A region must use either a counsel-approved fixed IANA zone (appropriate for
 * a single-zone calling policy) or a conservative UTC window proven to be
 * inside the allowed local window for every recipient covered by the policy.
 * Client- or merchant-supplied zones are never trusted for quiet-hour checks.
 */
export function resolveRegionPolicyTimeZone(strategy: string): string | null {
  const separator = strategy.indexOf(":");
  if (separator < 1) return null;
  const mode = strategy.slice(0, separator);
  const timeZone = strategy.slice(separator + 1);
  if (!new Set(["fixed", "conservative"]).has(mode) || !timeZone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return null;
  }
}

const CONSENT_TEXTS: Record<string, string> = {
  en: "I ask {store} to call me with an AI support assistant about this order. Supported subjects are order status and tracking, address changes, cancellation or return requests, item problems, and product help. This consent allows up to two attempts within seven days, at least 24 hours apart. The call is processed by an AI service and may be transcribed temporarily to provide support. I can revoke consent at any time from my signed-in customer account or order-status page.",
  hi: "मैं {store} से इस ऑर्डर के बारे में AI सहायता सहायक द्वारा मुझे कॉल करने का अनुरोध करता/करती हूँ। विषयों में ऑर्डर स्थिति और ट्रैकिंग, पता बदलाव, रद्दीकरण या वापसी अनुरोध, वस्तु संबंधी समस्याएँ और उत्पाद सहायता शामिल हैं। यह सहमति सात दिनों में अधिकतम दो प्रयासों की अनुमति देती है, जिनके बीच कम से कम 24 घंटे होंगे। सहायता प्रदान करने के लिए कॉल को AI सेवा द्वारा संसाधित किया जाता है और अस्थायी रूप से प्रतिलेखित किया जा सकता है। मैं अपने साइन-इन किए हुए ग्राहक खाते या ऑर्डर-स्थिति पृष्ठ से किसी भी समय सहमति वापस ले सकता/सकती हूँ।",
  ar: "أطلب من {store} الاتصال بي عبر مساعد دعم يعمل بالذكاء الاصطناعي بشأن هذا الطلب. تشمل الموضوعات حالة الطلب وتتبعه، وتغيير العنوان، وطلبات الإلغاء أو الإرجاع، ومشكلات المنتجات، والمساعدة بشأن المنتج. تسمح هذه الموافقة بمحاولتين كحد أقصى خلال سبعة أيام، بفاصل لا يقل عن 24 ساعة. تتم معالجة المكالمة بواسطة خدمة ذكاء اصطناعي وقد تُنسخ مؤقتًا لتقديم الدعم. يمكنني سحب الموافقة في أي وقت من حساب العميل المسجل أو صفحة حالة الطلب.",
  vi: "Tôi yêu cầu {store} gọi cho tôi bằng trợ lý hỗ trợ AI về đơn hàng này. Các chủ đề gồm trạng thái và theo dõi đơn hàng, thay đổi địa chỉ, yêu cầu hủy hoặc trả hàng, vấn đề về sản phẩm và hỗ trợ sản phẩm. Sự đồng ý này cho phép tối đa hai lần gọi trong bảy ngày, cách nhau ít nhất 24 giờ. Cuộc gọi được dịch vụ AI xử lý và có thể được phiên âm tạm thời để hỗ trợ. Tôi có thể rút lại sự đồng ý bất cứ lúc nào trong tài khoản khách hàng đã đăng nhập hoặc trang trạng thái đơn hàng.",
  de: "Ich bitte {store}, mich wegen dieser Bestellung mit einem KI-Supportassistenten anzurufen. Unterstützte Themen sind Bestellstatus und Sendungsverfolgung, Adressänderungen, Stornierungs- oder Rückgabeanfragen, Artikelprobleme und Produkthilfe. Diese Einwilligung erlaubt höchstens zwei Versuche innerhalb von sieben Tagen mit mindestens 24 Stunden Abstand. Der Anruf wird von einem KI-Dienst verarbeitet und kann zur Unterstützung vorübergehend transkribiert werden. Ich kann meine Einwilligung jederzeit in meinem angemeldeten Kundenkonto oder auf der Bestellstatusseite widerrufen.",
  ja: "この注文について、{store}からAIサポートアシスタントによる電話を受けることに同意します。対象は、注文状況と追跡、住所変更、キャンセルまたは返品の依頼、商品上の問題、商品サポートです。この同意では、7日以内に24時間以上の間隔を空けて最大2回の発信が許可されます。サポート提供のため、通話はAIサービスで処理され、一時的に文字起こしされる場合があります。サインイン済みのお客様アカウントまたは注文状況ページからいつでも同意を撤回できます。",
  fr: "Je demande à {store} de m’appeler au sujet de cette commande avec un assistant d’assistance IA. Les sujets pris en charge sont l’état et le suivi de la commande, les changements d’adresse, les demandes d’annulation ou de retour, les problèmes d’articles et l’aide sur les produits. Ce consentement autorise au maximum deux tentatives en sept jours, espacées d’au moins 24 heures. L’appel est traité par un service d’IA et peut être transcrit temporairement afin de fournir l’assistance. Je peux retirer mon consentement à tout moment depuis mon compte client connecté ou la page d’état de la commande.",
  es: "Solicito que {store} me llame mediante un asistente de soporte con IA sobre este pedido. Los temas admitidos son el estado y seguimiento del pedido, cambios de dirección, solicitudes de cancelación o devolución, problemas con artículos y ayuda sobre productos. Este consentimiento permite hasta dos intentos en siete días, con al menos 24 horas entre ellos. La llamada es procesada por un servicio de IA y puede transcribirse temporalmente para prestar soporte. Puedo retirar mi consentimiento en cualquier momento desde mi cuenta de cliente o la página de estado del pedido.",
  pt: "Solicito que a {store} me ligue por meio de um assistente de suporte com IA sobre este pedido. Os assuntos cobertos são status e rastreamento do pedido, alterações de endereço, solicitações de cancelamento ou devolução, problemas com itens e ajuda sobre produtos. Este consentimento permite até duas tentativas em sete dias, com pelo menos 24 horas entre elas. A chamada é processada por um serviço de IA e pode ser transcrita temporariamente para prestar suporte. Posso retirar o consentimento a qualquer momento na minha conta de cliente autenticada ou na página de status do pedido.",
  pl: "Proszę {store} o telefon dotyczący tego zamówienia przy użyciu asystenta wsparcia AI. Obsługiwane tematy to status i śledzenie zamówienia, zmiany adresu, prośby o anulowanie lub zwrot, problemy z produktami i pomoc dotycząca produktów. Ta zgoda pozwala na maksymalnie dwie próby w ciągu siedmiu dni, w odstępie co najmniej 24 godzin. Połączenie jest przetwarzane przez usługę AI i może być tymczasowo transkrybowane w celu udzielenia pomocy. Mogę wycofać zgodę w dowolnym momencie w zalogowanym koncie klienta lub na stronie statusu zamówienia.",
  bn: "আমি এই অর্ডার সম্পর্কে AI সহায়তা সহকারীর মাধ্যমে আমাকে কল করার জন্য {store}-কে অনুরোধ করছি। বিষয়গুলোর মধ্যে রয়েছে অর্ডারের অবস্থা ও ট্র্যাকিং, ঠিকানা পরিবর্তন, বাতিল বা ফেরতের অনুরোধ, পণ্যের সমস্যা এবং পণ্য সহায়তা। এই সম্মতি সাত দিনের মধ্যে সর্বোচ্চ দুটি প্রচেষ্টার অনুমতি দেয়, যার মধ্যে অন্তত ২৪ ঘণ্টা বিরতি থাকবে। সহায়তা দেওয়ার জন্য কলটি AI পরিষেবা দ্বারা প্রক্রিয়া করা হয় এবং সাময়িকভাবে প্রতিলিপি করা হতে পারে। আমি সাইন-ইন করা গ্রাহক অ্যাকাউন্ট বা অর্ডার-স্ট্যাটাস পৃষ্ঠা থেকে যেকোনো সময় সম্মতি প্রত্যাহার করতে পারি।",
  th: "ฉันขอให้ {store} โทรหาฉันเกี่ยวกับคำสั่งซื้อนี้โดยใช้ผู้ช่วยสนับสนุน AI หัวข้อที่รองรับ ได้แก่ สถานะและการติดตามคำสั่งซื้อ การเปลี่ยนที่อยู่ คำขอยกเลิกหรือคืนสินค้า ปัญหาเกี่ยวกับสินค้า และความช่วยเหลือด้านสินค้า ความยินยอมนี้อนุญาตให้โทรได้ไม่เกินสองครั้งภายในเจ็ดวัน โดยแต่ละครั้งห่างกันอย่างน้อย 24 ชั่วโมง สายจะได้รับการประมวลผลโดยบริการ AI และอาจถอดเสียงชั่วคราวเพื่อให้การสนับสนุน ฉันสามารถถอนความยินยอมได้ทุกเมื่อจากบัญชีลูกค้าที่ลงชื่อเข้าใช้หรือหน้าสถานะคำสั่งซื้อ",
};

export function normalizeSupportedLocale(locale: string): string {
  const language = locale.toLowerCase().split("-")[0];
  return language in CONSENT_TEXTS ? language : "en";
}

export function consentText(locale: string, storeName: string): string {
  return CONSENT_TEXTS[normalizeSupportedLocale(locale)].replace(
    "{store}",
    storeName,
  );
}

const CALL_LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ar: "Arabic",
  vi: "Vietnamese",
  de: "German",
  ja: "Japanese",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  pl: "Polish",
  bn: "Bengali",
  th: "Thai",
};

const CALL_OPENINGS: Record<string, string> = {
  en: "Hello, I am an AI support assistant calling on behalf of {store}. This call is about support for your order and may be transcribed temporarily to provide that support.",
  hi: "नमस्ते, मैं {store} की ओर से कॉल करने वाला एक AI सहायता सहायक हूँ। यह कॉल आपके ऑर्डर की सहायता के बारे में है और सहायता प्रदान करने के लिए अस्थायी रूप से प्रतिलेखित की जा सकती है।",
  ar: "مرحبًا، أنا مساعد دعم يعمل بالذكاء الاصطناعي وأتصل نيابةً عن {store}. تتعلق هذه المكالمة بدعم طلبك وقد تُنسخ مؤقتًا لتقديم هذا الدعم.",
  vi: "Xin chào, tôi là trợ lý hỗ trợ AI gọi thay mặt cho {store}. Cuộc gọi này nhằm hỗ trợ đơn hàng của bạn và có thể được phiên âm tạm thời để cung cấp hỗ trợ đó.",
  de: "Hallo, ich bin ein KI-Supportassistent und rufe im Namen von {store} an. Dieser Anruf betrifft die Unterstützung zu Ihrer Bestellung und kann dafür vorübergehend transkribiert werden.",
  ja: "こんにちは。{store}に代わってお電話しているAIサポートアシスタントです。この通話はご注文のサポートに関するもので、サポート提供のため一時的に文字起こしされる場合があります。",
  fr: "Bonjour, je suis un assistant d’assistance IA qui appelle au nom de {store}. Cet appel concerne l’assistance pour votre commande et peut être transcrit temporairement afin de fournir cette assistance.",
  es: "Hola, soy un asistente de soporte con IA que llama en nombre de {store}. Esta llamada se refiere al soporte de tu pedido y puede transcribirse temporalmente para prestarlo.",
  pt: "Olá, sou um assistente de suporte com IA ligando em nome da {store}. Esta chamada trata do suporte ao seu pedido e pode ser transcrita temporariamente para prestar esse suporte.",
  pl: "Dzień dobry, jestem asystentem wsparcia AI i dzwonię w imieniu {store}. Ta rozmowa dotyczy pomocy w sprawie zamówienia i może być tymczasowo transkrybowana w celu jej udzielenia.",
  bn: "হ্যালো, আমি {store}-এর পক্ষ থেকে কল করা একজন AI সহায়তা সহকারী। এই কলটি আপনার অর্ডার-সংক্রান্ত সহায়তার জন্য এবং সেই সহায়তা দিতে সাময়িকভাবে প্রতিলিপি করা হতে পারে।",
  th: "สวัสดี ฉันเป็นผู้ช่วยสนับสนุน AI ที่โทรในนามของ {store} สายนี้เกี่ยวกับการช่วยเหลือคำสั่งซื้อของคุณและอาจถูกถอดเสียงชั่วคราวเพื่อให้การสนับสนุนดังกล่าว",
};

export function localizedCallOpening(locale: string, storeName: string) {
  const normalized = normalizeSupportedLocale(locale);
  return {
    locale: normalized,
    languageName: CALL_LANGUAGE_NAMES[normalized],
    opening: CALL_OPENINGS[normalized].replace("{store}", storeName),
    version: CALL_SCRIPT_VERSION,
  };
}
