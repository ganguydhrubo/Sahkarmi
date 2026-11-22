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
  },
};
