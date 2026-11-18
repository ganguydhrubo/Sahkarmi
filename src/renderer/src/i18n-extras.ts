/** Extra everyday features: several AI accounts, pinned messages, quick answers, quiet routines. */
export const extrasEn = {
  helpQThumbs: "Can I answer a coworker's question with 👍?",
  helpAThumbs:
    'Yes. When a coworker\'s newest reply ends with a question, 👍 tells it "Yes, go ahead" and 👎 tells it "No". On any other message a reaction is only a reaction.',
  helpQPin: "How do I keep an important message handy?",
  helpAPin:
    "Open the message's More menu and choose Pin to top. Pinned messages stay in a bar above the chat, so you can read or copy them however long the chat grows.",
  helpQRunLate: "Why did a routine or scheduled task run late?",
  helpARunLate:
    "A small line under the task tells you. It ran late if the computer was off or asleep, it waited if routines were paused or the coworker was busy, and it shows the reason if it could not start.",
  helpQAiAccounts: "Can I add a second ChatGPT or Claude account?",
  helpAAiAccounts:
    "Yes. In Settings, under ChatGPT or Claude, choose Add another account and sign in. When one account reaches its usage limit, Sahkarmi moves the same work to your other account and carries on.",
  pinPin: "Pin to top",
  pinUnpin: "Unpin",
  pinnedTitle: "Pinned",
  pinnedCopy: "Copy",
  pinnedCopied: "Copied",
  runNoteLate:
    "Ran late at {at}: it was due at {due}, but Sahkarmi was closed or the computer was asleep.",
  runNotePaused: "Waiting since {at}: all coworkers are paused. It runs once you resume.",
  runNoteBusy: "Waited at {at}: the previous run was still going.",
  runNoteFailed: "Could not start at {at}: {detail}",
  aiAccountsHelp:
    "Add another {ai} account. When one account's limit is used up, coworkers carry on with the next one by themselves, in the same chat.",
  aiAccountsAdd: "Add another account",
  aiAccountsUse: "Use this one",
  aiAccountsInUse: "In use",
  aiAccountsResting: "Limit used up · back at {time}",
  aiAccountsRemove: "Remove",
  aiAccountsAdding: "Sign in with the other account now. Your first account is kept.",
  aiAccountsNumber: "Account {n}",
  aiAccountsAddConfirmCodex:
    "Sahkarmi keeps your current ChatGPT account and opens a fresh ChatGPT sign-in for the other one. ChatGPT's sign-in is shared with the Codex app on this computer, so that app follows the account in use here.",
  aiAccountsAddConfirmClaude:
    "Sahkarmi keeps your current Claude account and opens a fresh Claude sign-in for the other one.",
  aiAccountsRemoveConfirm: "Remove {name} from Sahkarmi? You can add it again at any time.",
};

export type ExtrasDictionary = typeof extrasEn;

export const extrasHi: ExtrasDictionary = {
  helpQThumbs: "क्या मैं किसी साथी के सवाल का जवाब 👍 से दे सकता हूँ?",
  helpAThumbs:
    'हाँ। जब साथी का सबसे नया जवाब किसी सवाल पर खत्म हो, तो 👍 उसे "हाँ, आगे बढ़ो" बताता है और 👎 उसे "नहीं" बताता है। बाकी संदेशों पर रिएक्शन सिर्फ़ रिएक्शन रहता है।',
  helpQPin: "ज़रूरी संदेश हाथ के पास कैसे रखूँ?",
  helpAPin:
    "संदेश का More मेन्यू खोलें और ऊपर पिन करें चुनें। पिन किए संदेश चैट के ऊपर एक पट्टी में रहते हैं, ताकि चैट कितनी भी लंबी हो, आप उन्हें पढ़ या कॉपी कर सकें।",
  helpQRunLate: "रूटीन या शेड्यूल किया काम देर से क्यों चला?",
  helpARunLate:
    "काम के नीचे एक छोटी लाइन वजह बताती है। कंप्यूटर बंद या स्लीप में था तो देर से चला, रूटीन रुके थे या साथी व्यस्त था तो इंतज़ार किया, और शुरू न हो सका तो उसकी वजह दिखती है।",
  helpQAiAccounts: "क्या मैं दूसरा ChatGPT या Claude अकाउंट जोड़ सकता हूँ?",
  helpAAiAccounts:
    "हाँ। सेटिंग्स में ChatGPT या Claude के नीचे एक और अकाउंट जोड़ें चुनें और साइन इन करें। जब एक अकाउंट की सीमा पूरी हो जाए, तो Sahkarmi वही काम आपके दूसरे अकाउंट पर ले जाकर जारी रखता है।",
  pinPin: "ऊपर पिन करें",
  pinUnpin: "पिन हटाएँ",
  pinnedTitle: "पिन किए गए",
  pinnedCopy: "कॉपी करें",
  pinnedCopied: "कॉपी हो गया",
  runNoteLate: "{at} पर देर से चला: इसका समय {due} था, पर सहकर्मी बंद था या कंप्यूटर स्लीप में था।",
  runNotePaused: "{at} से इंतज़ार में: सभी सहकर्मी रुके हुए हैं। आप फिर से शुरू करते ही यह चलेगा।",
  runNoteBusy: "{at} पर इंतज़ार किया: पिछला रन अभी चल रहा था।",
  runNoteFailed: "{at} पर शुरू नहीं हो सका: {detail}",
  aiAccountsHelp:
    "एक और {ai} अकाउंट जोड़ें। एक अकाउंट की सीमा खत्म होने पर सहकर्मी अपने आप अगले अकाउंट से उसी चैट में काम जारी रखेंगे।",
  aiAccountsAdd: "एक और अकाउंट जोड़ें",
  aiAccountsUse: "इसे इस्तेमाल करें",
  aiAccountsInUse: "इस्तेमाल में",
  aiAccountsResting: "सीमा खत्म · {time} पर वापस",
  aiAccountsRemove: "हटाएँ",
  aiAccountsAdding: "अब दूसरे अकाउंट से साइन इन करें। आपका पहला अकाउंट रखा गया है।",
  aiAccountsNumber: "अकाउंट {n}",
  aiAccountsAddConfirmCodex:
    "सहकर्मी आपका मौजूदा ChatGPT अकाउंट रखेगा और दूसरे अकाउंट के लिए नया ChatGPT साइन-इन खोलेगा। ChatGPT का साइन-इन इस कंप्यूटर के Codex ऐप के साथ साझा है, इसलिए वह ऐप यहाँ इस्तेमाल हो रहे अकाउंट पर चलेगा।",
  aiAccountsAddConfirmClaude:
    "सहकर्मी आपका मौजूदा Claude अकाउंट रखेगा और दूसरे अकाउंट के लिए नया Claude साइन-इन खोलेगा।",
  aiAccountsRemoveConfirm: "{name} को सहकर्मी से हटाएँ? आप इसे कभी भी फिर जोड़ सकते हैं।",
};

export const extrasBn: ExtrasDictionary = {
  helpQThumbs: "সহকর্মীর প্রশ্নের উত্তর কি 👍 দিয়ে দিতে পারি?",
  helpAThumbs:
    'হ্যাঁ। সহকর্মীর সবচেয়ে নতুন উত্তর প্রশ্ন দিয়ে শেষ হলে 👍 তাকে "হ্যাঁ, এগিয়ে যাও" জানায় আর 👎 জানায় "না"। অন্য বার্তায় রিঅ্যাকশন শুধু রিঅ্যাকশনই থাকে।',
  helpQPin: "জরুরি বার্তা হাতের কাছে কীভাবে রাখব?",
  helpAPin:
    "বার্তার More মেনু খুলে উপরে পিন করুন বেছে নিন। পিন করা বার্তা চ্যাটের উপরে একটি পট্টিতে থাকে, তাই চ্যাট যত লম্বাই হোক, পড়তে বা কপি করতে পারবেন।",
  helpQRunLate: "রুটিন বা নির্ধারিত কাজ দেরিতে চলল কেন?",
  helpARunLate:
    "কাজের নিচে একটি ছোট লাইন কারণ বলে দেয়। কম্পিউটার বন্ধ বা স্লিপে থাকলে দেরিতে চলে, রুটিন থামানো থাকলে বা সহকর্মী ব্যস্ত থাকলে অপেক্ষা করে, আর শুরু না হলে তার কারণ দেখায়।",
  helpQAiAccounts: "দ্বিতীয় ChatGPT বা Claude অ্যাকাউন্ট যোগ করা যায়?",
  helpAAiAccounts:
    "হ্যাঁ। সেটিংসে ChatGPT বা Claude-এর নিচে আরেকটি অ্যাকাউন্ট যোগ করুন বেছে সাইন ইন করুন। একটি অ্যাকাউন্টের সীমা শেষ হলে Sahkarmi একই কাজ আপনার অন্য অ্যাকাউন্টে নিয়ে চালিয়ে যায়।",
  pinPin: "উপরে পিন করুন",
  pinUnpin: "পিন সরান",
  pinnedTitle: "পিন করা",
  pinnedCopy: "কপি করুন",
  pinnedCopied: "কপি হয়েছে",
  runNoteLate: "{at}-এ দেরিতে চলেছে: এর সময় ছিল {due}, কিন্তু সহকর্মী বন্ধ ছিল বা কম্পিউটার ঘুমিয়ে ছিল।",
  runNotePaused: "{at} থেকে অপেক্ষায়: সব সহকর্মী থামানো আছে। আবার চালু করলেই চলবে।",
  runNoteBusy: "{at}-এ অপেক্ষা করেছে: আগের রান তখনও চলছিল।",
  runNoteFailed: "{at}-এ শুরু করা যায়নি: {detail}",
  aiAccountsHelp:
    "আরেকটি {ai} অ্যাকাউন্ট যোগ করুন। একটি অ্যাকাউন্টের লিমিট শেষ হলে সহকর্মীরা নিজে থেকেই পরের অ্যাকাউন্টে একই চ্যাটে কাজ চালিয়ে যাবে।",
  aiAccountsAdd: "আরেকটি অ্যাকাউন্ট যোগ করুন",
  aiAccountsUse: "এটি ব্যবহার করুন",
  aiAccountsInUse: "ব্যবহার হচ্ছে",
  aiAccountsResting: "লিমিট শেষ · {time}-এ ফিরবে",
  aiAccountsRemove: "সরান",
  aiAccountsAdding: "এখন অন্য অ্যাকাউন্টে সাইন ইন করুন। আপনার প্রথম অ্যাকাউন্ট রাখা আছে।",
  aiAccountsNumber: "অ্যাকাউন্ট {n}",
  aiAccountsAddConfirmCodex:
    "সহকর্মী আপনার এখনকার ChatGPT অ্যাকাউন্ট রেখে অন্য অ্যাকাউন্টের জন্য নতুন ChatGPT সাইন-ইন খুলবে। ChatGPT-র সাইন-ইন এই কম্পিউটারের Codex অ্যাপের সঙ্গে ভাগ করা, তাই সেই অ্যাপও এখানে ব্যবহৃত অ্যাকাউন্টে চলবে।",
  aiAccountsAddConfirmClaude:
    "সহকর্মী আপনার এখনকার Claude অ্যাকাউন্ট রেখে অন্য অ্যাকাউন্টের জন্য নতুন Claude সাইন-ইন খুলবে।",
  aiAccountsRemoveConfirm: "{name}-কে সহকর্মী থেকে সরাবেন? যেকোনো সময় আবার যোগ করতে পারবেন।",
};
