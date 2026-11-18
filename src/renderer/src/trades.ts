import type { LanguageCode } from "./preferences";
import { type TradeId, wordsLanguage } from "./trade-names";

/**
 * Ready starter jobs for each line of work, in English, Hindi and Bengali. Only Home loads
 * this file, so the words for every trade stay out of the first screen's bundle.
 */

/** The kind of coworker a job suits best; Home sends the job to a coworker with that role. */
export type JobRole = "content" | "accounts" | "sales" | "support" | "research" | "ops";

export interface StarterJob {
  id: string;
  role: JobRole;
  /** Short words on the tile. */
  title: string;
  /** What is sent to the coworker. Ends by asking for missing details, so nothing is made up. */
  prompt: string;
}

type Words = { title: string; prompt: string };
type JobText = Record<"en" | "hi" | "bn", Words>;

interface JobSpec {
  id: string;
  role: JobRole;
  text: JobText;
}

const ASK_EN = " Ask me for any detail you need before you start.";
const ASK_HI = " शुरू करने से पहले जो भी जानकारी चाहिए, मुझसे पूछ लें।";
const ASK_BN = " শুরু করার আগে যা তথ্য দরকার, আমাকে জিজ্ঞেস করুন।";

function job(
  id: string,
  role: JobRole,
  en: [string, string],
  hi: [string, string],
  bn: [string, string],
): JobSpec {
  return {
    id,
    role,
    text: {
      en: { title: en[0], prompt: en[1] + ASK_EN },
      hi: { title: hi[0], prompt: hi[1] + ASK_HI },
      bn: { title: bn[0], prompt: bn[1] + ASK_BN },
    },
  };
}

const JOBS: Record<TradeId, JobSpec[]> = {
  shop: [
    job(
      "shop-offer-post",
      "content",
      [
        "Festival offer post",
        "Write a festival offer post for my shop, for WhatsApp and Instagram.",
      ],
      ["त्योहार ऑफ़र की पोस्ट", "मेरी दुकान के लिए त्योहार ऑफ़र की पोस्ट लिखें, WhatsApp और Instagram के लिए।"],
      ["উৎসবের অফার পোস্ট", "আমার দোকানের জন্য উৎসবের অফার পোস্ট লিখুন, WhatsApp ও Instagram-এর জন্য।"],
    ),
    job(
      "shop-price-list",
      "ops",
      [
        "Make a price list",
        "Make a clean price list of my items as an Excel file I can print and share.",
      ],
      ["रेट लिस्ट बनाएँ", "मेरे सामान की साफ़ रेट लिस्ट Excel फ़ाइल में बनाएँ, जिसे मैं छाप और भेज सकूँ।"],
      [
        "দামের তালিকা তৈরি",
        "আমার জিনিসের পরিষ্কার দামের তালিকা Excel ফাইলে তৈরি করুন, যা আমি ছাপাতে ও পাঠাতে পারি।",
      ],
    ),
    job(
      "shop-gst-check",
      "accounts",
      [
        "Check a GST bill",
        "Check a GST bill for mistakes in rate, total and GSTIN, and tell me what to correct.",
      ],
      ["GST बिल जाँचें", "एक GST बिल में दर, जोड़ और GSTIN की गलतियाँ जाँचें और बताएँ क्या ठीक करना है।"],
      ["GST বিল যাচাই", "একটি GST বিলে হার, মোট ও GSTIN-এর ভুল যাচাই করুন এবং কী ঠিক করতে হবে বলুন।"],
    ),
    job(
      "shop-customer-reply",
      "support",
      [
        "Reply to customers",
        "Write polite replies to today's customer messages about price, stock and delivery.",
      ],
      ["ग्राहकों को जवाब", "दाम, स्टॉक और डिलीवरी पर आज के ग्राहक संदेशों के विनम्र जवाब लिखें।"],
      ["গ্রাহকদের উত্তর", "দাম, স্টক ও ডেলিভারি নিয়ে আজকের গ্রাহকদের বার্তার ভদ্র উত্তর লিখুন।"],
    ),
    job(
      "shop-payment-reminder",
      "accounts",
      [
        "Payment reminders",
        "Write short, polite payment reminders for customers whose payment is overdue.",
      ],
      ["बकाया की याद", "जिन ग्राहकों का भुगतान बाकी है, उनके लिए छोटे और विनम्र रिमाइंडर लिखें।"],
      ["বকেয়ার রিমাইন্ডার", "যেসব গ্রাহকের টাকা বাকি, তাদের জন্য ছোট ও ভদ্র রিমাইন্ডার লিখুন।"],
    ),
    job(
      "shop-stock-list",
      "ops",
      [
        "Stock to reorder",
        "From my stock list, tell me which items are running low and what to reorder this week.",
      ],
      ["कौन सा माल मँगाना है", "मेरी स्टॉक लिस्ट देखकर बताएँ कौन सा सामान कम है और इस हफ़्ते क्या मँगाना है।"],
      ["কোন মাল আনতে হবে", "আমার স্টক তালিকা দেখে বলুন কোন জিনিস কম আছে এবং এই সপ্তাহে কী অর্ডার করতে হবে।"],
    ),
    job(
      "shop-supplier-compare",
      "research",
      [
        "Compare suppliers",
        "Compare three suppliers for one item on price, quality and delivery time, in a simple table.",
      ],
      [
        "सप्लायर की तुलना",
        "एक सामान के तीन सप्लायरों की तुलना दाम, क्वालिटी और डिलीवरी समय पर, सरल तालिका में करें।",
      ],
      ["সাপ্লায়ার তুলনা", "একটি জিনিসের তিনজন সাপ্লায়ারের তুলনা দাম, মান ও ডেলিভারির সময় ধরে, সহজ টেবিলে করুন।"],
    ),
  ],
  ca: [
    job(
      "ca-gst-reco",
      "accounts",
      [
        "GSTR-2B matching",
        "Match a client's purchase register with GSTR-2B and list the bills that do not match.",
      ],
      ["GSTR-2B मिलान", "क्लाइंट के परचेज़ रजिस्टर का GSTR-2B से मिलान करें और जो बिल नहीं मिलते उनकी सूची दें।"],
      [
        "GSTR-2B মিলানো",
        "ক্লায়েন্টের পারচেজ রেজিস্টার GSTR-2B-এর সাথে মিলিয়ে যে বিলগুলো মিলছে না তার তালিকা দিন।",
      ],
    ),
    job(
      "ca-doc-reminder",
      "support",
      [
        "Ask clients for papers",
        "Write reminder messages asking clients for the documents still pending for their return.",
      ],
      ["क्लाइंट से काग़ज़ माँगें", "रिटर्न के लिए जो काग़ज़ बाकी हैं, उनके लिए क्लाइंटों को रिमाइंडर संदेश लिखें।"],
      ["ক্লায়েন্টের কাগজ চাওয়া", "রিটার্নের জন্য যে কাগজ বাকি, তার জন্য ক্লায়েন্টদের রিমাইন্ডার বার্তা লিখুন।"],
    ),
    job(
      "ca-due-dates",
      "ops",
      [
        "This month's due dates",
        "Make a list of this month's GST, TDS and income tax due dates with what to file on each.",
      ],
      [
        "इस महीने की तारीख़ें",
        "इस महीने की GST, TDS और इनकम टैक्स की आख़िरी तारीख़ों की सूची बनाएँ, हर तारीख़ पर क्या भरना है।",
      ],
      [
        "এই মাসের শেষ তারিখ",
        "এই মাসের GST, TDS ও আয়করের শেষ তারিখের তালিকা তৈরি করুন, কোন দিনে কী জমা দিতে হবে।",
      ],
    ),
    job(
      "ca-notice-reply",
      "research",
      [
        "Draft a notice reply",
        "Read a tax notice and draft a clear reply, listing the papers to attach.",
      ],
      ["नोटिस का जवाब", "एक टैक्स नोटिस पढ़कर साफ़ जवाब का ड्राफ़्ट बनाएँ और साथ लगाने वाले काग़ज़ों की सूची दें।"],
      [
        "নোটিসের উত্তর",
        "একটি ট্যাক্স নোটিস পড়ে পরিষ্কার উত্তরের খসড়া তৈরি করুন এবং সংযুক্ত করার কাগজের তালিকা দিন।",
      ],
    ),
    job(
      "ca-fee-reminder",
      "accounts",
      ["Fee reminders", "Write polite fee reminders for clients whose fees are pending."],
      ["फ़ीस की याद", "जिन क्लाइंटों की फ़ीस बाकी है, उनके लिए विनम्र रिमाइंडर लिखें।"],
      ["ফি-এর রিমাইন্ডার", "যেসব ক্লায়েন্টের ফি বাকি, তাদের জন্য ভদ্র রিমাইন্ডার লিখুন।"],
    ),
    job(
      "ca-client-summary",
      "accounts",
      [
        "Summary for a client",
        "Turn a client's monthly figures into a one-page summary in simple words.",
      ],
      ["क्लाइंट के लिए सार", "क्लाइंट के महीने के आँकड़ों को सरल शब्दों में एक पन्ने के सार में बदलें।"],
      ["ক্লায়েন্টের সারাংশ", "ক্লায়েন্টের মাসিক হিসাবকে সহজ ভাষায় এক পাতার সারাংশে বদলে দিন।"],
    ),
    job(
      "ca-update-post",
      "content",
      [
        "Tax update for clients",
        "Write a short WhatsApp update for my clients about one recent tax change, in simple words.",
      ],
      [
        "क्लाइंटों के लिए टैक्स अपडेट",
        "हाल के एक टैक्स बदलाव पर मेरे क्लाइंटों के लिए सरल शब्दों में छोटा WhatsApp अपडेट लिखें।",
      ],
      [
        "ক্লায়েন্টদের ট্যাক্স আপডেট",
        "সাম্প্রতিক একটি ট্যাক্স পরিবর্তন নিয়ে আমার ক্লায়েন্টদের জন্য সহজ ভাষায় ছোট WhatsApp আপডেট লিখুন।",
      ],
    ),
  ],
  clinic: [
    job(
      "clinic-appointment-reminder",
      "support",
      [
        "Appointment reminders",
        "Write reminder messages for tomorrow's patients with the time and what to bring.",
      ],
      ["अपॉइंटमेंट की याद", "कल के मरीज़ों के लिए समय और साथ लाने वाली चीज़ों के साथ रिमाइंडर संदेश लिखें।"],
      [
        "অ্যাপয়েন্টমেন্ট রিমাইন্ডার",
        "আগামীকালের রোগীদের জন্য সময় ও সঙ্গে কী আনতে হবে তা দিয়ে রিমাইন্ডার বার্তা লিখুন।",
      ],
    ),
    job(
      "clinic-health-post",
      "content",
      [
        "Health tip post",
        "Write a short health tip post for our clinic's page, in simple words, with no medical claims.",
      ],
      [
        "सेहत की सलाह पोस्ट",
        "हमारे क्लिनिक के पेज के लिए सरल शब्दों में छोटी सेहत-सलाह पोस्ट लिखें, बिना किसी इलाज के दावे के।",
      ],
      [
        "স্বাস্থ্য পরামর্শ পোস্ট",
        "আমাদের ক্লিনিকের পেজের জন্য সহজ ভাষায় ছোট স্বাস্থ্য-পরামর্শ পোস্ট লিখুন, কোনো চিকিৎসার দাবি ছাড়া।",
      ],
    ),
    job(
      "clinic-patient-reply",
      "support",
      [
        "Reply to enquiries",
        "Write polite replies to patient enquiries about timings, fees and tests.",
      ],
      ["पूछताछ के जवाब", "समय, फ़ीस और जाँचों पर मरीज़ों की पूछताछ के विनम्र जवाब लिखें।"],
      ["জিজ্ঞাসার উত্তর", "সময়, ফি ও পরীক্ষা নিয়ে রোগীদের জিজ্ঞাসার ভদ্র উত্তর লিখুন।"],
    ),
    job(
      "clinic-daily-collection",
      "accounts",
      [
        "Daily collection sheet",
        "Make today's collection sheet from my entries: cash, UPI and pending, with totals.",
      ],
      ["रोज़ की वसूली शीट", "मेरी एंट्री से आज की वसूली शीट बनाएँ: नकद, UPI और बाकी, जोड़ के साथ।"],
      ["দৈনিক সংগ্রহ শিট", "আমার এন্ট্রি থেকে আজকের সংগ্রহ শিট তৈরি করুন: নগদ, UPI ও বাকি, মোটসহ।"],
    ),
    job(
      "clinic-stock",
      "ops",
      [
        "Medicine stock check",
        "From my stock list, tell me which medicines and supplies are low or near expiry.",
      ],
      ["दवा स्टॉक जाँच", "मेरी स्टॉक लिस्ट से बताएँ कौन सी दवाएँ और सामान कम हैं या जल्दी एक्सपायर होंगे।"],
      ["ওষুধের স্টক যাচাই", "আমার স্টক তালিকা থেকে বলুন কোন ওষুধ ও সামগ্রী কম আছে বা শীঘ্রই মেয়াদ শেষ হবে।"],
    ),
    job(
      "clinic-follow-up",
      "support",
      ["Follow-up messages", "Write caring follow-up messages for patients who visited last week."],
      ["फ़ॉलो-अप संदेश", "पिछले हफ़्ते आए मरीज़ों के लिए अपनापन भरे फ़ॉलो-अप संदेश लिखें।"],
      ["ফলো-আপ বার্তা", "গত সপ্তাহে আসা রোগীদের জন্য যত্নশীল ফলো-আপ বার্তা লিখুন।"],
    ),
    job(
      "clinic-camp",
      "content",
      [
        "Health camp notice",
        "Write a notice and a WhatsApp message for a free health camp at our clinic.",
      ],
      ["हेल्थ कैंप सूचना", "हमारे क्लिनिक में मुफ़्त हेल्थ कैंप के लिए एक सूचना और WhatsApp संदेश लिखें।"],
      [
        "স্বাস্থ্য শিবিরের নোটিস",
        "আমাদের ক্লিনিকে বিনামূল্যের স্বাস্থ্য শিবিরের জন্য একটি নোটিস ও WhatsApp বার্তা লিখুন।",
      ],
    ),
  ],
  school: [
    job(
      "school-fee-reminder",
      "accounts",
      [
        "Fee reminder letters",
        "Write polite fee reminder letters to parents whose fees are pending.",
      ],
      ["फ़ीस रिमाइंडर पत्र", "जिन अभिभावकों की फ़ीस बाकी है, उनके लिए विनम्र फ़ीस रिमाइंडर पत्र लिखें।"],
      ["ফি রিমাইন্ডার চিঠি", "যেসব অভিভাবকের ফি বাকি, তাদের জন্য ভদ্র ফি রিমাইন্ডার চিঠি লিখুন।"],
    ),
    job(
      "school-circular",
      "content",
      [
        "Write a circular",
        "Write a clear circular for parents about an upcoming event or holiday.",
      ],
      ["सर्कुलर लिखें", "आने वाले कार्यक्रम या छुट्टी के बारे में अभिभावकों के लिए साफ़ सर्कुलर लिखें।"],
      ["সার্কুলার লিখুন", "আসন্ন অনুষ্ঠান বা ছুটি নিয়ে অভিভাবকদের জন্য পরিষ্কার সার্কুলার লিখুন।"],
    ),
    job(
      "school-timetable",
      "ops",
      [
        "Make a timetable",
        "Make a weekly class timetable from my list of subjects, teachers and periods.",
      ],
      ["समय-सारणी बनाएँ", "मेरे विषयों, शिक्षकों और पीरियड की सूची से हफ़्ते की कक्षा समय-सारणी बनाएँ।"],
      ["রুটিন তৈরি", "আমার বিষয়, শিক্ষক ও পিরিয়ডের তালিকা থেকে সাপ্তাহিক ক্লাস রুটিন তৈরি করুন।"],
    ),
    job(
      "school-question-paper",
      "content",
      [
        "Draft a question paper",
        "Draft a question paper for one class and subject, with marks for each question.",
      ],
      ["प्रश्न पत्र बनाएँ", "एक कक्षा और विषय के लिए प्रश्न पत्र का ड्राफ़्ट बनाएँ, हर प्रश्न के अंक के साथ।"],
      ["প্রশ্নপত্র তৈরি", "একটি শ্রেণি ও বিষয়ের জন্য প্রশ্নপত্রের খসড়া তৈরি করুন, প্রতিটি প্রশ্নের নম্বরসহ।"],
    ),
    job(
      "school-admission-reply",
      "support",
      [
        "Reply to admission enquiries",
        "Write polite replies to admission enquiries about fees, seats and documents.",
      ],
      ["दाख़िले की पूछताछ के जवाब", "फ़ीस, सीट और काग़ज़ों पर दाख़िले की पूछताछ के विनम्र जवाब लिखें।"],
      ["ভর্তির জিজ্ঞাসার উত্তর", "ফি, আসন ও কাগজপত্র নিয়ে ভর্তির জিজ্ঞাসার ভদ্র উত্তর লিখুন।"],
    ),
    job(
      "school-results",
      "ops",
      ["Result sheet", "Turn my marks list into a result sheet with totals, percentage and rank."],
      ["रिज़ल्ट शीट", "मेरी अंक सूची को जोड़, प्रतिशत और रैंक के साथ रिज़ल्ट शीट में बदलें।"],
      ["ফলাফলের শিট", "আমার নম্বরের তালিকাকে মোট, শতাংশ ও র‍্যাঙ্কসহ ফলাফলের শিটে বদলে দিন।"],
    ),
    job(
      "school-admission-post",
      "content",
      [
        "Admissions open post",
        "Write an 'Admissions open' post for our school, for WhatsApp and Facebook.",
      ],
      ["दाख़िले शुरू की पोस्ट", "हमारे स्कूल के लिए “दाख़िले शुरू” की पोस्ट लिखें, WhatsApp और Facebook के लिए।"],
      ["ভর্তি চলছে পোস্ট", "আমাদের স্কুলের জন্য “ভর্তি চলছে” পোস্ট লিখুন, WhatsApp ও Facebook-এর জন্য।"],
    ),
  ],
  property: [
    job(
      "property-listing",
      "content",
      [
        "Write a property listing",
        "Write an attractive, honest listing for a flat or plot, for online portals and WhatsApp.",
      ],
      [
        "प्रॉपर्टी लिस्टिंग लिखें",
        "एक फ़्लैट या प्लॉट की आकर्षक और सच्ची लिस्टिंग लिखें, ऑनलाइन पोर्टल और WhatsApp के लिए।",
      ],
      [
        "প্রপার্টি লিস্টিং লিখুন",
        "একটি ফ্ল্যাট বা প্লটের আকর্ষণীয় ও সত্য লিস্টিং লিখুন, অনলাইন পোর্টাল ও WhatsApp-এর জন্য।",
      ],
    ),
    job(
      "property-lead-follow-up",
      "sales",
      [
        "Follow up with buyers",
        "Write follow-up messages for buyers who enquired but did not visit yet.",
      ],
      [
        "ख़रीदारों से फ़ॉलो-अप",
        "जिन ख़रीदारों ने पूछताछ की पर अभी तक देखने नहीं आए, उनके लिए फ़ॉलो-अप संदेश लिखें।",
      ],
      [
        "ক্রেতাদের ফলো-আপ",
        "যেসব ক্রেতা জিজ্ঞাসা করেছেন কিন্তু এখনো দেখতে আসেননি, তাদের জন্য ফলো-আপ বার্তা লিখুন।",
      ],
    ),
    job(
      "property-compare",
      "research",
      [
        "Compare two properties",
        "Compare two properties for a buyer on price, area, location and papers, in a simple table.",
      ],
      [
        "दो प्रॉपर्टी की तुलना",
        "ख़रीदार के लिए दो प्रॉपर्टी की तुलना दाम, क्षेत्रफल, जगह और काग़ज़ों पर, सरल तालिका में करें।",
      ],
      [
        "দুটি প্রপার্টির তুলনা",
        "ক্রেতার জন্য দুটি প্রপার্টির তুলনা দাম, আয়তন, অবস্থান ও কাগজপত্র ধরে, সহজ টেবিলে করুন।",
      ],
    ),
    job(
      "property-rent-agreement",
      "ops",
      [
        "Rent agreement points",
        "List the points to put in a rent agreement and the papers to collect from owner and tenant.",
      ],
      [
        "किराया अनुबंध के बिंदु",
        "किराया अनुबंध में रखने वाले बिंदु और मालिक व किरायेदार से लेने वाले काग़ज़ों की सूची दें।",
      ],
      ["ভাড়া চুক্তির বিষয়", "ভাড়া চুক্তিতে রাখার বিষয় এবং মালিক ও ভাড়াটের কাছ থেকে নেওয়ার কাগজের তালিকা দিন।"],
    ),
    job(
      "property-site-visits",
      "ops",
      [
        "Plan site visits",
        "Plan this week's site visits from my list of buyers and properties, by area and time.",
      ],
      [
        "साइट विज़िट की योजना",
        "मेरी ख़रीदारों और प्रॉपर्टी की सूची से इस हफ़्ते के साइट विज़िट, इलाक़े और समय के हिसाब से तय करें।",
      ],
      [
        "সাইট ভিজিটের পরিকল্পনা",
        "আমার ক্রেতা ও প্রপার্টির তালিকা থেকে এই সপ্তাহের সাইট ভিজিট এলাকা ও সময় অনুযায়ী সাজান।",
      ],
    ),
    job(
      "property-rate-research",
      "research",
      [
        "Area rate check",
        "Find the current asking rates per square foot in one area and give me a short summary with sources.",
      ],
      ["इलाक़े के रेट", "एक इलाक़े में प्रति वर्ग फ़ुट चल रहे रेट पता करें और स्रोत के साथ छोटा सार दें।"],
      ["এলাকার দর", "একটি এলাকায় প্রতি বর্গফুটের চলতি দর খুঁজে সূত্রসহ ছোট সারাংশ দিন।"],
    ),
    job(
      "property-rent-reminder",
      "accounts",
      ["Rent reminders", "Write polite rent reminders for tenants whose rent is due."],
      ["किराये की याद", "जिन किरायेदारों का किराया बाकी है, उनके लिए विनम्र रिमाइंडर लिखें।"],
      ["ভাড়ার রিমাইন্ডার", "যেসব ভাড়াটের ভাড়া বাকি, তাদের জন্য ভদ্র রিমাইন্ডার লিখুন।"],
    ),
  ],
  other: [
    job(
      "other-post",
      "content",
      [
        "Write a social media post",
        "Write a post about my business for WhatsApp, Instagram and Facebook.",
      ],
      [
        "सोशल मीडिया पोस्ट लिखें",
        "मेरे कारोबार के बारे में WhatsApp, Instagram और Facebook के लिए पोस्ट लिखें।",
      ],
      ["সোশ্যাল মিডিয়া পোস্ট", "আমার ব্যবসা নিয়ে WhatsApp, Instagram ও Facebook-এর জন্য পোস্ট লিখুন।"],
    ),
    job(
      "other-customer-reply",
      "support",
      ["Reply to customers", "Write polite replies to today's customer messages."],
      ["ग्राहकों को जवाब", "आज के ग्राहक संदेशों के विनम्र जवाब लिखें।"],
      ["গ্রাহকদের উত্তর", "আজকের গ্রাহকদের বার্তার ভদ্র উত্তর লিখুন।"],
    ),
    job(
      "other-quotation",
      "sales",
      [
        "Make a quotation",
        "Make a neat quotation for a customer with items, rates, GST and total.",
      ],
      ["कोटेशन बनाएँ", "ग्राहक के लिए सामान, दर, GST और जोड़ के साथ साफ़ कोटेशन बनाएँ।"],
      ["কোটেশন তৈরি", "গ্রাহকের জন্য জিনিস, দর, GST ও মোটসহ পরিষ্কার কোটেশন তৈরি করুন।"],
    ),
    job(
      "other-payment-reminder",
      "accounts",
      [
        "Payment reminders",
        "Write short, polite payment reminders for customers whose payment is overdue.",
      ],
      ["बकाया की याद", "जिन ग्राहकों का भुगतान बाकी है, उनके लिए छोटे और विनम्र रिमाइंडर लिखें।"],
      ["বকেয়ার রিমাইন্ডার", "যেসব গ্রাহকের টাকা বাকি, তাদের জন্য ছোট ও ভদ্র রিমাইন্ডার লিখুন।"],
    ),
    job(
      "other-summarise",
      "research",
      [
        "Summarise a document",
        "Read a document I share and give me the main points in simple words.",
      ],
      ["दस्तावेज़ का सार", "मेरा दिया दस्तावेज़ पढ़कर मुख्य बातें सरल शब्दों में बताएँ।"],
      ["নথির সারাংশ", "আমার দেওয়া নথি পড়ে মূল বিষয়গুলো সহজ ভাষায় বলুন।"],
    ),
    job(
      "other-plan-week",
      "ops",
      ["Plan my week", "Plan my work for this week from my list of jobs, most important first."],
      ["हफ़्ते की योजना", "मेरे कामों की सूची से इस हफ़्ते की योजना बनाएँ, सबसे ज़रूरी काम पहले।"],
      ["সপ্তাহের পরিকল্পনা", "আমার কাজের তালিকা থেকে এই সপ্তাহের পরিকল্পনা তৈরি করুন, সবচেয়ে জরুরি কাজ আগে।"],
    ),
    job(
      "other-letter",
      "content",
      ["Write a letter or email", "Write a clear, polite letter or email for my business."],
      ["पत्र या ईमेल लिखें", "मेरे कारोबार के लिए साफ़ और विनम्र पत्र या ईमेल लिखें।"],
      ["চিঠি বা ইমেল লিখুন", "আমার ব্যবসার জন্য পরিষ্কার ও ভদ্র চিঠি বা ইমেল লিখুন।"],
    ),
  ],
};

const USED_KEY = "sahkarmi:starter-used";

/** How often each starter job was started on this computer; nothing leaves it. */
export function starterUseCounts(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(USED_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const counts: Record<string, number> = {};
    for (const [id, count] of Object.entries(parsed)) {
      if (typeof count === "number" && Number.isFinite(count) && count > 0) counts[id] = count;
    }
    return counts;
  } catch {
    return {};
  }
}

/** Counts one more use of a starter job and returns the new counts. */
export function noteStarterUsed(jobId: string): Record<string, number> {
  const counts = starterUseCounts();
  counts[jobId] = (counts[jobId] ?? 0) + 1;
  try {
    window.localStorage.setItem(USED_KEY, JSON.stringify(counts));
  } catch {
    // The order of the tiles is a convenience; Home works without it.
  }
  return counts;
}

/**
 * The starter jobs for a trade, in the owner's language. Jobs the owner used most come first
 * (`usedCounts` maps a job id to how often it was started), so Home adapts to their habits.
 */
export function starterJobs(
  trade: TradeId,
  language: LanguageCode,
  usedCounts: Record<string, number> = {},
): StarterJob[] {
  const words = wordsLanguage(language);
  return JOBS[trade]
    .map((spec, index) => ({ spec, index, used: usedCounts[spec.id] ?? 0 }))
    .sort((left, right) => right.used - left.used || left.index - right.index)
    .map(({ spec }) => ({
      id: spec.id,
      role: spec.role,
      title: spec.text[words].title,
      prompt: spec.text[words].prompt,
    }));
}

const FIRST_JOB_KEY = "sahkarmi:first-job-done";

/** True once the owner has started a job from Home; the first-job guide then stays away. */
export function firstJobDone(): boolean {
  try {
    return window.localStorage.getItem(FIRST_JOB_KEY) === "1";
  } catch {
    return true;
  }
}

export function markFirstJobDone(): void {
  try {
    window.localStorage.setItem(FIRST_JOB_KEY, "1");
  } catch {
    // Without storage the guide simply shows again next time.
  }
}
