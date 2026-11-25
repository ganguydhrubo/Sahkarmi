// Hand-written extras for the most searched coworker pages on the website, so these pages carry
// their own worked example and India notes instead of only the shared page pattern.
// Website only: the app does not read this file. Every line must stay true to what the coworker
// really does (see its entry in src/shared/agent-catalog/).

export interface CoworkerExtra {
  /** A first task, typed in plain words, exactly as a user could send it. */
  prompt: string;
  /** What comes back, described with the real file names and columns the coworker produces. */
  result: string[];
  /** Practical notes for Indian businesses. */
  notes: string[];
  /** The everyday situation this coworker is for, in plain words. */
  situation: string;
  /** A small made-up sample of the main output; totals must add up. */
  sample: { caption: string; head: string[]; rows: string[][] };
  /** Three more things a user can type. */
  asks: string[];
  /** Alt text of /assets/coworkers/<id>-1200.webp and -640.webp (pictures made with AI). */
  picture: string;
}

export const COWORKER_EXTRAS: Record<string, CoworkerExtra> = {
  "gst-accountant": {
    prompt:
      "October 2026 sales and purchase registers are in Shared/Accounts/GST, exported from Tally. The 2B for October is there too. Prepare the GSTR-1 tables and the 3B summary, and list every purchase invoice that does not match 2B.",
    result: [
      "A workbook with one sheet each for B2B, B2C, credit notes and the HSN summary, laid out like the GSTR-1 tables.",
      "A 3B sheet with outward tax, eligible ITC and net tax payable, every figure traced back to the registers.",
      "A 2B mismatch sheet in four groups: matched, in books but not in 2B, in 2B but not in books, and value differences, each line with the supplier GSTIN and invoice number.",
      "A one-page note: tax payable, ITC you can claim now, ITC on hold, and the open questions for you or your CA.",
    ],
    notes: [
      "It checks the place of supply, so an inter-state sale is marked if it was billed with CGST and SGST instead of IGST.",
      "It reads the first two digits of every GSTIN as the state code and marks invoices where the code and the billing state do not agree.",
      "It never files on the GST portal and never pays tax. It can open the portal in Sahkarmi's browser, with your own sign-in, only to download reports such as 2B.",
      "Add last month's working papers and the GSTIN if you have them; it uses them to check this month's figures.",
    ],
    situation:
      "It is the 8th of the month. The supplier bills are in a spike file, the sales are in Tally, and the 2B has three bills you have never seen. Most of the work is not the return itself. It is finding which lines do not agree, and why.",
    sample: {
      caption: "A 2B mismatch sheet",
      head: ["Supplier", "Invoice", "Tax in books", "Tax in 2B", "What it says"],
      rows: [
        ["Mehta Traders", "MT/418", "₹3,600", "₹3,600", "Matched"],
        ["Shree Paints", "SP-2207", "₹1,980", "Not found", "In books, not in 2B. Ask the supplier"],
        ["Om Hardware", "OH/91", "₹2,700", "₹2,070", "Value differs by ₹630. Check the bill"],
        ["Anand Steel", "AS/1120", "Not found", "₹5,400", "In 2B, not booked. Find the bill"],
      ],
    },
    asks: [
      "List every sale to another state that was billed with CGST and SGST.",
      "Show me ITC on hold from last month that has now come in 2B.",
      "Make a short list of suppliers I must call, with invoice numbers.",
    ],
    picture: "A shop accountant in Kanpur checking a paper bill against her laptop",
  },
  bookkeeper: {
    prompt:
      "Here are the November bills, the purchase invoices and the HDFC current account statement, all in Shared/Accounts/Books. Make the voucher sheet for Tally, and tell me which bank entries have no bill.",
    result: [
      "A voucher sheet with date, voucher type, party, ledger, GST split, amount and narration, one line per entry, ready to import into Tally or Zoho Books.",
      "A review list: bank entries with no bill, bills with no bank entry, and lines where the ledger was unclear.",
      "A short summary of the month by ledger, so you can see expenses by head at a glance.",
    ],
    notes: [
      "Photos of paper bills and scanned PDFs are read with OCR; anything it cannot read clearly goes to the review list instead of being guessed.",
      "Give it your Tally ledger list once and it uses your own ledger names, not new ones.",
      "It does not post into Tally itself. You import the sheet after checking it, so your live books change only when you decide.",
    ],
    situation:
      "The bills come in a plastic bag on the last day of the month. Some are faded, two are photos on WhatsApp, and one is only a UPI screenshot. The bookkeeper coworker reads them, makes one voucher line for each, and keeps the doubtful ones apart.",
    sample: {
      caption: "A voucher sheet",
      head: ["Date", "Type", "Ledger", "Amount", "Narration"],
      rows: [
        ["03/11/2026", "Purchase", "Stationery", "₹1,180", "Bill 552, GST 18% (₹1,000 + ₹180)"],
        ["05/11/2026", "Payment", "Electricity", "₹4,260", "October bill, paid by UPI"],
        [
          "09/11/2026",
          "Purchase",
          "Packing material",
          "₹2,360",
          "Bill PK/77, GST 18% (₹2,000 + ₹360)",
        ],
        ["12/11/2026", "Review", "Not decided", "₹900", "Bank entry with no bill"],
      ],
    },
    asks: [
      "Find bills entered twice this month.",
      "Show all cash payments above ₹10,000 so I can check them with my CA.",
      "Make the ledger-wise expense total for November.",
    ],
    picture: "A young bookkeeper in Kolkata sorting paper bills into bundles",
  },
  "mis-reporting": {
    prompt:
      "The October trial balance from Tally is in Shared/Accounts/MIS. Make the monthly MIS, compare it with September, and explain the five biggest movements in simple words.",
    result: [
      "An MIS workbook: revenue, cost of goods, gross margin, operating costs, EBITDA, finance cost and tax, mapped from your ledgers.",
      "A comparison with last month, the same month last year and the budget (when you give one), with gross margin, debtor days, creditor days and current ratio.",
      "A one-page PDF summary with charts, and short notes on the five biggest movements, each naming the ledgers behind it.",
    ],
    notes: [
      "Amounts are shown in rupees with lakh and crore used the same way all through the pack.",
      "MIS totals are tied back to the trial balance before it reports done.",
      "It asks you before the MIS is shared with anyone else, such as the bank, investors or staff.",
    ],
    situation:
      "The owner does not want a trial balance. The owner wants to know why the profit is lower when the sales are higher. The MIS coworker maps the ledgers, compares two months and names the ledgers behind each change.",
    sample: {
      caption: "A monthly comparison",
      head: ["Line", "September", "October", "Change"],
      rows: [
        ["Sales", "₹18,00,000", "₹19,50,000", "+₹1,50,000"],
        ["Cost of goods", "₹12,60,000", "₹14,23,500", "+₹1,63,500"],
        ["Gross margin", "₹5,40,000 (30%)", "₹5,26,500 (27%)", "−₹13,500"],
        ["Operating costs", "₹3,20,000", "₹3,35,000", "+₹15,000"],
        ["EBITDA", "₹2,20,000", "₹1,91,500", "−₹28,500"],
      ],
    },
    asks: [
      "Which three expenses grew faster than sales?",
      "Show debtor days for my ten biggest customers.",
      "Make a one-page version for my partner, no accounting words.",
    ],
    picture: "A textile unit owner in Surat reading a printed monthly report beside the looms",
  },
  "sales-follow-up": {
    prompt:
      "The quotation list is in Shared/Sales/quotes.xlsx. Find every lead or quotation with no reply for three days or more, and draft a short, polite follow-up for each in the language we used with that customer.",
    result: [
      "An updated lead tracker in Shared/Sales: stage, last contact and next step for every lead, with quotations near expiry marked.",
      "One short draft per customer that mentions their last message or quotation, in the language you used with them.",
      "A pipeline summary: how many leads and how much value at each stage.",
    ],
    notes: [
      "Every message waits for your approval as a card. Nothing goes to a customer on its own.",
      "Dates are written as DD/MM/YYYY, and each draft is checked for the right customer, product and price.",
    ],
    situation:
      "A quotation goes out on Monday. On Friday nobody remembers it. The customer has not said no; they are only busy. This coworker reads the quotation list, finds the silent ones and writes a short message that mentions what that customer asked for.",
    sample: {
      caption: "A follow-up list",
      head: ["Customer", "Quoted", "Silent for", "Next step"],
      rows: [
        ["Patel Constructions", "₹2,40,000", "4 days", "Draft ready: confirm the 600 x 600 tile"],
        ["Nisha Interiors", "₹85,000", "6 days", "Draft ready: price valid till Friday"],
        ["Krishna Villas", "₹1,10,000", "11 days", "Call, no reply to two messages"],
      ],
    },
    asks: [
      "Which quotations expire this week?",
      "Draft the follow-ups in Hindi for customers who wrote in Hindi.",
      "Run this every morning at 10 and show me the drafts.",
    ],
    picture: "A tile showroom salesman in Ahmedabad calling a customer with his notebook open",
  },
  "recruitment-coordinator": {
    prompt:
      "Our candidate list for the two counter sales jobs is in Shared/Hiring/candidates.xlsx. Update the pipeline, tell me who is stuck, and draft interview invites for Thursday and Friday afternoon at the shop.",
    result: [
      "A pipeline tracker: candidate, role, source, stage, last contact, next step and who owns it.",
      "A list of candidates stuck in one stage for five days or more, and interviews with no feedback recorded.",
      "Interview invites with date, time in IST, mode and the address or link, matched to the slots you gave.",
    ],
    notes: [
      "It can read applicants on Naukri, LinkedIn or Indeed in Sahkarmi's browser, signed in by you.",
      "It checks that no interviewer is booked twice, and every message to a candidate waits for your approval.",
    ],
    situation:
      "Thirty people applied. Nine were called. Two came for the interview and nobody wrote down what was said. The recruitment coworker keeps one list, shows who is stuck, and prepares the invite so the candidate gets the right time and place.",
    sample: {
      caption: "A hiring pipeline",
      head: ["Candidate", "Stage", "Days there", "Next step"],
      rows: [
        ["Candidate A", "Interview done", "5", "Feedback missing, ask the store manager"],
        ["Candidate B", "Shortlisted", "2", "Invite ready: Thursday 4:00 pm IST"],
        ["Candidate C", "Offer sent", "3", "Reminder draft ready"],
      ],
    },
    asks: [
      "Who has been waiting more than five days?",
      "Make a simple feedback sheet for the two interviewers.",
      "Draft a polite message for candidates we did not select.",
    ],
    picture: "An HR manager in Pune interviewing a young candidate",
  },
  "hr-documentation": {
    prompt:
      "Make an offer letter and an appointment letter for Riya Sen, accounts assistant in Kolkata, joining on 1 December 2026. Her CTC and details are in Shared/HR/Documents/riya.txt and our letter template is in the same folder.",
    result: [
      "The offer letter and the appointment letter in Word and PDF, on your letterhead.",
      "A CTC breakup sheet (basic, HRA, allowances, employer PF and ESI) that adds up to the stated CTC.",
      "A points-to-confirm list for anything it had to assume.",
    ],
    notes: [
      "For leave and attendance policies it checks the terms against your state's rules and the Labour Codes, and lists its sources.",
      "Drafts only, not legal advice: have an HR or labour-law professional check new policies and termination letters.",
      "It asks before any letter is sent to an employee or candidate, or a policy is shared with staff.",
    ],
    situation:
      "The new person joins on Monday and the letter is still last year's file with another name in it. This coworker fills your own template, checks that the salary parts add up to the CTC, and lists what it was not sure about.",
    sample: {
      caption: "A monthly CTC breakup",
      head: ["Part", "Monthly", "Yearly"],
      rows: [
        ["Basic", "₹12,500", "₹1,50,000"],
        ["HRA", "₹6,250", "₹75,000"],
        ["Special allowance", "₹4,750", "₹57,000"],
        ["Employer PF (12% of basic)", "₹1,500", "₹18,000"],
        ["Total CTC", "₹25,000", "₹3,00,000"],
      ],
    },
    asks: [
      "Compare our leave policy with the new draft and list the changes.",
      "Make a joining checklist for the first day.",
      "Prepare an experience letter from the same template.",
    ],
    picture: "An office administrator in Chennai giving a letter to a new employee",
  },
  "payment-reminders": {
    prompt:
      "The outstanding list from Tally is in Shared/Accounts/Receivables. Make the ageing by customer, and draft a reminder for everyone above 30 days. Use the UPI ID in bank-details.txt.",
    result: [
      "An ageing report: each customer in 0-30, 31-60, 61-90 and 90+ days, with totals that match the ledger.",
      "One reminder per overdue customer with invoice numbers, amounts and your payment details.",
      "A collections tracker with promised dates and the next reminder.",
    ],
    notes: [
      "It copies payment details exactly as you gave them, so check the UPI ID once before the first run.",
      "It asks before sending any reminder, and before offering any discount or settlement.",
      "It can open WhatsApp Business or your email in Sahkarmi's browser, with your own sign-in.",
    ],
    situation:
      "Asking for your own money is uncomfortable, so it waits. Ninety days later it is a bigger problem. This coworker sorts dues by age, writes a polite line for the new ones and a firmer one for the old ones, and keeps a note of who promised what.",
    sample: {
      caption: "An ageing report",
      head: ["Customer", "0–30 days", "31–60", "61–90", "90+", "Total"],
      rows: [
        ["Gupta Stores", "₹18,000", "₹0", "₹0", "₹0", "₹18,000"],
        ["Royal Caterers", "₹12,500", "₹22,000", "₹0", "₹0", "₹34,500"],
        ["S. K. Agencies", "₹0", "₹0", "₹40,000", "₹15,500", "₹55,500"],
        ["Total", "₹30,500", "₹22,000", "₹40,000", "₹15,500", "₹1,08,000"],
      ],
    },
    asks: [
      "Who promised to pay this week and did not?",
      "Write the reminder in Hindi, very polite, for Gupta Stores.",
      "Every Monday, update the ageing and show me the five biggest dues.",
    ],
    picture: "An old grain trader in Delhi thinking over his ledger and laptop",
  },
  "bank-reconciliation": {
    prompt:
      "HDFC statement for October and the bank ledger from Tally are in Shared/Accounts/Reconciliation, with the Razorpay settlement report. Make the BRS and tell me the reason for every unmatched line.",
    result: [
      "A bank reconciliation statement that ties to the bank closing balance.",
      "A workbook of matched and unmatched lines, each unmatched line with its reason.",
      "Suggested entries for bank charges, interest and gateway fees.",
    ],
    notes: [
      "It matches UTR and cheque numbers first, and only then amount and date.",
      "It never posts to your books. You pass the entries after checking them.",
      "It does not match one bank line twice, so a repeated amount stays visible.",
    ],
    situation:
      "The bank says one number and the books say another. The difference is usually small things: a charge nobody booked, a cheque still in someone's drawer, a gateway settlement that came after its fee. This coworker finds each one and puts a reason beside it.",
    sample: {
      caption: "A bank reconciliation statement",
      head: ["Line", "Amount"],
      rows: [
        ["Balance in books", "₹4,12,300"],
        ["Add: cheque issued, not yet cleared (no. 004512)", "₹25,000"],
        ["Less: cheque deposited, not yet credited", "₹18,000"],
        ["Less: bank charges not booked", "₹590"],
        ["Balance in bank", "₹4,18,710"],
      ],
    },
    asks: [
      "Match the Razorpay settlements and show the fee and GST on each.",
      "Which UPI credits have no customer name?",
      "Give me the entries I must pass for bank charges and interest.",
    ],
    picture: "An accountant in Jaipur comparing a bank statement with a spreadsheet at night",
  },
  "sales-invoicing": {
    prompt:
      "Today's orders are in Shared/Accounts/Invoices/orders.xlsx, and the customer master with GSTINs is beside it. Make the invoices in our series from INV/1041 and the sales register.",
    result: [
      "Invoice PDFs in your format, numbered in sequence.",
      "A register for the batch whose total is equal to the sum of the invoices.",
      "A JSON or Excel file for e-invoice or e-way bill upload, where your business needs it.",
    ],
    notes: [
      "Same state gets CGST and SGST, another state gets IGST; it checks this from the place of supply.",
      "Generating an IRN or e-way bill, sending an invoice or cancelling one needs your approval.",
      "You or your CA confirm whether e-invoicing applies to you.",
    ],
    situation:
      "The goods are packed and the delivery boy is waiting. One wrong state code and the customer sends the bill back. This coworker checks the GSTIN, the place of supply and the rate first, then makes the invoices in your own series.",
    sample: {
      caption: "A sales register for the batch",
      head: ["Invoice", "Buyer state", "Taxable", "Tax", "Total"],
      rows: [
        ["INV/1041", "Maharashtra (27)", "₹20,000", "CGST ₹1,800 + SGST ₹1,800", "₹23,600"],
        ["INV/1042", "Gujarat (24)", "₹15,000", "IGST ₹2,700", "₹17,700"],
        ["INV/1043", "Maharashtra (27)", "₹8,000", "CGST ₹720 + SGST ₹720", "₹9,440"],
        ["Total", "", "₹43,000", "₹7,740", "₹50,740"],
      ],
    },
    asks: [
      "Make a credit note for two returned boxes on INV/1041.",
      "Check today's orders for missing GSTINs before billing.",
      "Prepare the e-way bill data for consignments that need it.",
    ],
    picture: "A billing clerk in Nagpur printing an invoice while a delivery boy waits",
  },
  "ca-practice-assistant": {
    prompt:
      "The client list with services is in Shared/CA Practice/clients.xlsx. Make the compliance calendar for next month with the official source of each date, and show which client documents are pending.",
    result: [
      "A compliance calendar per client, each due date with the notification it comes from.",
      "A document tracker: received, pending and asked on which date.",
      "A weekly report of work in progress and filings due in seven days.",
    ],
    notes: [
      "Client files stay in separate folders and are not mixed.",
      "Due dates can be extended, so it checks the official source again and shows the link.",
      "Judgement, signing and filing stay with the CA.",
    ],
    situation:
      "In a CA office the hard part is not the tax. It is the sixty clients who have not sent their bank statement. This coworker keeps a list of what each client still owes you, drafts the reminder and shows what is due in the next seven days.",
    sample: {
      caption: "A client document tracker",
      head: ["Client", "Service", "Received", "Still needed"],
      rows: [
        ["Client 1", "GST return", "Sales register", "Purchase bills, 2B"],
        ["Client 2", "ITR", "Form 16, bank statement", "Home loan certificate"],
        ["Client 3", "TDS return", "Challans", "PAN of two vendors"],
      ],
    },
    asks: [
      "Which clients have sent nothing yet?",
      "Draft one document request for each ITR client.",
      "Every Saturday, make the status report for next week.",
    ],
    picture: "A chartered accountant and his article assistant discussing a file in Indore",
  },
  "proposal-quotation-writer": {
    prompt:
      "A customer sent this list on WhatsApp: 4 office tables, 8 chairs, fitting at site. Our rates are in Shared/Sales/Quotations/rates.xlsx. Make the quotation on our letterhead, and warn me if any line is below 15% margin.",
    result: [
      "A quotation in PDF and an editable copy, with total in figures and words.",
      "A costing sheet with margin on each line, for you only.",
      "A list of points to confirm with the customer.",
    ],
    notes: [
      "Freight and fitting are shown on their own lines so the customer can see them.",
      "It asks before sending, and before quoting below your margin floor.",
      "Anything unclear in the request goes to the confirm list, it is not guessed.",
    ],
    situation:
      "The customer sends a rough list on WhatsApp and wants a price today. This coworker writes the list again line by line, prices it from your own rates, adds GST, and tells you which line is below your margin before the customer sees it.",
    sample: {
      caption: "A quotation with its costing",
      head: ["Item", "Qty", "Rate", "Amount", "Margin"],
      rows: [
        ["Office table, teak finish", "4", "₹9,500", "₹38,000", "24%"],
        ["Chair, cushioned", "8", "₹3,200", "₹25,600", "21%"],
        ["Fitting at site", "1", "₹4,000", "₹4,000", "9%, below your floor"],
        ["Total before GST", "", "", "₹67,600", ""],
        ["GST 18%", "", "", "₹12,168", ""],
        ["Grand total", "", "", "₹79,768", ""],
      ],
    },
    asks: [
      "Make a second option with a cheaper finish.",
      "Write the terms: 50% advance, delivery in 20 days.",
      "List what I should confirm with the customer first.",
    ],
    picture: "A furniture workshop owner in Coimbatore measuring a frame beside his laptop",
  },
  "social-media-manager": {
    prompt:
      "Our calendar and photos for this week are in Shared/Marketing/Social. Prepare the posts for Instagram and the Facebook Page, show me each one, and collect new comments that need a reply.",
    result: [
      "Each post ready for your approval with the account, time, photo and caption.",
      "A log of comments and messages with a drafted reply from your FAQ.",
      "A weekly report of reach and engagement, taken from the platform's own insights.",
    ],
    notes: [
      "You sign in yourself in Sahkarmi's browser, and it works only on your brand's own accounts.",
      "Publishing, replying, hiding a comment and boosting a post all need your approval.",
      "Complaints and serious leads are passed to you, not answered by itself.",
    ],
    situation:
      "The sweets look good, the photo is good, and the post goes up three days after the festival. This coworker keeps the calendar, prepares the post on time, and collects the comments that need an answer. You approve each post and reply.",
    sample: {
      caption: "A week of posts",
      head: ["Day", "Post", "Account", "Status"],
      rows: [
        ["Mon", "New gift box photo", "Instagram", "Waiting for your approval"],
        ["Wed", "How the box is packed", "Facebook Page", "Draft ready"],
        ["Fri", "Weekend timings", "Instagram", "Photo needed from you"],
      ],
    },
    asks: [
      "Show me comments that ask for price or delivery.",
      "Which posts did best last month, and what is common in them?",
      "Draft replies from our FAQ for today's messages.",
    ],
    picture: "A young woman at a mithai shop in Lucknow photographing a plate of sweets",
  },
  "seo-specialist": {
    prompt:
      "Our homestay website is open in the browser. We want guests from Delhi and Lucknow. Find what they type, match it to our five pages, and give me the new title, description and headings.",
    result: [
      "A keyword map: what people type, what they want and which page should answer.",
      "New titles, descriptions, headings and text for each page, ready to paste.",
      "A short list of what to do first.",
    ],
    notes: [
      "It includes Hindi and “near me” searches when your customers use them.",
      "Every volume or rank figure carries its tool and date; without a tool it gives no number.",
      "It asks before changing a live page or your Google Business Profile. No one can promise a rank.",
    ],
    situation:
      "A homestay has a nice website that nobody finds, because the page says “Welcome” and the guest types “homestay near Mukteshwar with parking”. This coworker finds the words people really type and gives you the new title and text for each page.",
    sample: {
      caption: "A keyword map",
      head: ["What people type", "What they want", "Page", "Fix"],
      rows: [
        [
          "homestay near mukteshwar",
          "Book a stay",
          "Home",
          "Put the place name in the title and H1",
        ],
        [
          "family room kumaon with parking",
          "Check facilities",
          "Rooms",
          "Add parking and room size in text",
        ],
        [
          "how to reach mukteshwar from kathgodam",
          "Plan the trip",
          "How to reach",
          "Write real distance and road notes",
        ],
      ],
    },
    asks: [
      "Which two of my pages are fighting for the same words?",
      "Rewrite titles and descriptions for my five main pages.",
      "Make a list of facts to add to my Google Business Profile.",
    ],
    picture: "A homestay couple in the Kumaon hills looking at their website together",
  },
  "customer-support": {
    prompt:
      "Today's messages are in Shared/Support/inbox.csv. Our policies are in Shared/Policies and the FAQ is in Shared/FAQ. Draft replies, and keep aside anything the policy does not cover.",
    result: [
      "A reply draft for each message, with the policy line it used.",
      "A list of messages for you, each with the reason and a short summary.",
      "A log of the questions that come again and again.",
    ],
    notes: [
      "It does not make up prices, dates or promises.",
      "Sending a reply and giving a refund or replacement need your approval.",
      "A clear policy file gives better replies, so write the returns rule in plain words first.",
    ],
    situation:
      "Half the messages ask the same three things. The other half need a person. This coworker answers the first kind from your own policy, shows the line it used, and passes the second kind to you with a short summary.",
    sample: {
      caption: "An inbox after sorting",
      head: ["Message", "Mood", "Answer from", "Action"],
      rows: [
        ["Where is my order?", "Worried", "Delivery policy, line 2", "Reply draft ready"],
        [
          "The item came broken",
          "Angry",
          "Returns policy, line 5",
          "Draft ready, replacement needs your yes",
        ],
        ["I will go to consumer court", "Very angry", "Not covered", "Sent to you with a summary"],
      ],
    },
    asks: [
      "Which questions came more than five times this week?",
      "Write an FAQ entry for the most common one.",
      "Reply in the language the customer used.",
    ],
    picture: "A support worker in Guwahati taking notes with a headset on",
  },
  "marketplace-seller": {
    prompt:
      "Returns and reviews reports for October are in Shared/Ecommerce, with the product sheet for our kurtas. Tell me the top return reasons and write a better listing for the worst two products.",
    result: [
      "A report of price, reviews and returns, with figures that match your downloads.",
      "Title, bullets and description for each product, inside the marketplace's length rules.",
      "An action list: what to fix in the listing, photo or packing.",
    ],
    notes: [
      "It writes only what your product sheet says, with no extra claims.",
      "It asks before changing a live listing or a price.",
      "You sign in to Seller Central or Seller Hub yourself, in Sahkarmi's browser.",
    ],
    situation:
      "Returns eat the profit, and the reason is usually in the report nobody opens. This coworker reads the returns and reviews, tells you what is wrong in the listing, and writes a better one from your real product details.",
    sample: {
      caption: "Returns by reason",
      head: ["Reason", "Returns", "Share", "Fix"],
      rows: [
        ["Size smaller than expected", "18", "45%", "Add a chest and length chart in cm"],
        ["Colour looks different", "12", "30%", "Add a daylight photo"],
        ["Damaged in transit", "6", "15%", "Change the packing"],
        ["Other", "4", "10%", "Read one by one"],
        ["Total", "40", "100%", ""],
      ],
    },
    asks: [
      "Write Amazon and Flipkart titles for these six kurtas.",
      "Compare my price with three similar listings.",
      "Find words that customers use in good reviews.",
    ],
    picture: "A young couple in Jaipur packing block-print kurtas beside a laptop",
  },
  "web-research-assistant": {
    prompt:
      "Find the last date, fee and age limit for this exam from the official notice, not from news sites. Save the notice PDF and show me the line for each answer.",
    result: [
      "A short answer list, each with a quote, link and the date it was read.",
      "Copies of the main documents.",
      "A clear “not found” where the answer is not there.",
    ],
    notes: [
      "For rules, rates and government schemes it goes to the official site first.",
      "If two sources disagree it shows both and does not hide the difference.",
      "Dates change, so open the link once before you act on it.",
    ],
    situation:
      "You need one clear answer and you have eleven open tabs that disagree. This coworker goes to the official page first, copies the line that answers you, writes the date it looked, and says “not found” when it is not there.",
    sample: {
      caption: "An answer list",
      head: ["Question", "Answer", "Source", "Seen on"],
      rows: [
        ["Last date to apply?", "25/01/2027", "Official notice, page 2", "25/11/2026"],
        ["Fee for general category?", "₹500", "Official notice, page 4", "25/11/2026"],
        ["Is there an age limit?", "Not found", "Looked in the notice and the FAQ", "25/11/2026"],
      ],
    },
    asks: [
      "Find the official page for this scheme and save the PDF.",
      "Two websites disagree. Tell me which one is official.",
      "Make a table of the same five facts for three colleges.",
    ],
    picture: "A student in a Thiruvananthapuram library working with books and a laptop",
  },
  "lead-researcher": {
    prompt:
      "We sell mechanical seals to pump makers with 10 to 100 workers near Rajkot. Find 30, leave out the names in customers.xlsx, and write a short first message for the best ten.",
    result: [
      "A prospect sheet: name, city, size signal, public phone or email, fit score and source link.",
      "A personal first message for the top leads, with one reason it fits them.",
      "A note on which sources gave the best leads.",
    ],
    notes: [
      "It uses only business contact details that are publicly listed.",
      "It sends no message and no connection request without your approval.",
      "If it finds only 22 good ones, it says 22 and why.",
    ],
    situation:
      "You can walk the industrial area for a week, or start with a list of the forty units that really use your part. This coworker builds that list from public pages, with a link for each line, so you can check it before you call.",
    sample: {
      caption: "A prospect sheet",
      head: ["Business", "City", "Fit", "Why", "Source"],
      rows: [
        ["Unit 1", "Rajkot", "9/10", "Makes pump bodies, uses the same casting", "Own website"],
        ["Unit 2", "Jamnagar", "7/10", "Brass parts, size matches", "Association list"],
        ["Unit 3", "Morbi", "3/10", "Ceramic only, not a fit", "Directory page"],
      ],
    },
    asks: [
      "Find 30 pump makers near Rajkot, leave out my customers.",
      "Write a three-line first message for the top ten.",
      "Which source gave the best leads?",
    ],
    picture: "A machine parts salesman walking through an industrial lane in Rajkot",
  },
  translator: {
    prompt:
      "Translate this safety notice into Hindi and Bengali for factory staff. Simple words. Keep the numbers, names and the table exactly as they are.",
    result: [
      "The translated document in the same format as the original.",
      "A note on terms that had no exact match, and what was chosen.",
      "Key sentences translated back, so you can check the meaning.",
    ],
    notes: [
      "Give a list of your brand words once and it keeps them the same each time.",
      "Say who will read it: a customer, an officer or shop staff. The tone changes.",
      "For legal or medical papers, let a qualified person check the final copy.",
    ],
    situation:
      "A word-by-word translation is easy to spot, and people stop reading. This coworker reads the whole text first, keeps the names and figures as they are, translates the meaning, and tells you which words had no exact match.",
    sample: {
      caption: "A terminology note",
      head: ["English", "Hindi", "Bengali", "Note"],
      rows: [
        ["Invoice", "बिल", "বিল", "Common word used in trade"],
        ["Due date", "अंतिम तारीख", "শেষ তারিখ", "Plain words, not official ones"],
        ["Warranty", "वारंटी", "ওয়ারেন্টি", "Kept as it is, people know it"],
      ],
    },
    asks: [
      "Translate this notice for shop staff, simple Hindi.",
      "Keep the table and all numbers exactly the same.",
      "Check my Bengali text against the English and list what is missing.",
    ],
    picture: "An older Bengali man working between two dictionaries and a laptop in Kolkata",
  },
  "resume-writer": {
    prompt:
      "My resume and this job post are in Shared/Writing/Resumes. Make a one-page version for this job. Use only my real facts, and tell me what is missing.",
    result: [
      "A resume for that job in Word and PDF, with a simple layout that screening software can read.",
      "A short cover letter.",
      "Suggested headline for LinkedIn or Naukri.",
    ],
    notes: [
      "Put real numbers in your notes, such as calls a day or items counted. Numbers make the biggest difference.",
      "It adds no skill or job you did not have.",
      "It asks before applying anywhere. It cannot promise an interview.",
    ],
    situation:
      "A good person with a weak resume does not get the call. Most of the time the facts are there, only written as duties. This coworker uses your real facts, puts them in the words of the job, and does not add anything you did not do.",
    sample: {
      caption: "Before and after",
      head: ["You wrote", "Rewritten from your facts"],
      rows: [
        [
          "Handled customer calls (about 40 a day, logged in Excel)",
          "Answered about 40 customer calls a day and logged each one in Excel",
        ],
        [
          "Worked on stock (300 items, counted every week)",
          "Counted stock for 300 items every week and reported differences to the manager",
        ],
        [
          "Good in computer (VLOOKUP, pivot, Tally, Gmail)",
          "Uses Excel (VLOOKUP, pivot), Tally data entry and Gmail every day",
        ],
      ],
    },
    asks: [
      "Which skills in this job post are missing in my resume?",
      "Make it one page, simple layout, Word and PDF.",
      "Write a short cover letter in plain English.",
    ],
    picture: "A young man with a folder waiting outside an office in Hyderabad",
  },
  "spreadsheet-analyst": {
    prompt:
      "stock.xlsx in Shared/Research/Spreadsheets has all our items with last sale date. Show which items did not sell for 90 days and how much money is stuck. Do not change my sheet.",
    result: [
      "A workbook with a new analysis sheet, using live formulas and a pivot.",
      "A short answer with the main numbers.",
      "A note on how to refresh it next month.",
    ],
    notes: [
      "Totals are checked against your raw rows before it reports done.",
      "It asks before writing over your own sheet.",
      "Dates saved as text are a common problem; it finds them and tells you.",
    ],
    situation:
      "The file has 4,000 rows and one simple question: which items are not moving? This coworker answers it in a new sheet with live formulas, so next month you paste new rows and the answer changes by itself. Your own sheet stays as it was.",
    sample: {
      caption: "A slow-stock summary",
      head: ["Group", "Items", "Stock value", "Share"],
      rows: [
        ["Sold in last 30 days", "210", "₹6,30,000", "63%"],
        ["Sold 31–90 days ago", "85", "₹2,20,000", "22%"],
        ["Not sold for 90 days", "55", "₹1,50,000", "15%"],
        ["Total", "350", "₹10,00,000", "100%"],
      ],
    },
    asks: [
      "Which ten items block the most money?",
      "Make a chart of monthly sales by city.",
      "Explain this formula to me in simple words.",
    ],
    picture: "A warehouse supervisor in Bhiwandi checking stock with a clipboard and laptop",
  },
};
