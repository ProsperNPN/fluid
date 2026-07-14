'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: 'What is FLUID and how does it work?',
    answer:
      'FLUID is a blood donation coordination platform that connects verified healthcare facilities with eligible donors. Hospitals can publish time-sensitive blood requests, and FLUID helps identify suitable donors based on clinical compatibility, location, and availability. Donors receive clear request details and can choose whether to respond. The platform then supports communication and appointment coordination through the completion of the donation.'
  },
  {
    question: 'How are hospitals verified?',
    answer:
      'Hospitals are required to submit organization details, facility credentials, and contact information for an authorized representative. FLUID reviews this information against available healthcare registries and may request supporting documentation before activating hospital features. Verification status is displayed in the platform so donors can distinguish approved facilities. Hospitals must keep their information current and may be reviewed again if important details change.'
  },
  {
    question: 'How does FLUID match donors with blood requests?',
    answer:
      'FLUID first evaluates blood-group and component compatibility, then considers practical factors such as donor availability, proximity, and the urgency of the request. Eligibility rules and recent donation history help prevent unsuitable notifications. A match is an invitation to respond, not a medical clearance or obligation to donate. Final eligibility is always confirmed by qualified healthcare staff at the donation facility.'
  },
  {
    question: 'What information do donors need to provide?',
    answer:
      'Donors provide basic identity and contact details, their blood group if known, a general location, and their current availability. They may also record information relevant to donation timing, such as their most recent donation date. FLUID asks only for information needed to support safe matching and coordination. The receiving hospital will complete its own health screening before any donation takes place.'
  },
  {
    question: 'How does FLUID protect user and health-related data?',
    answer:
      'FLUID is designed to limit data collection and restrict access according to each user’s role. Sensitive information is protected in transit and at rest, while authentication, access controls, and audit records help prevent unauthorized use. Hospitals receive only the information necessary to coordinate a relevant request. Data handling practices are reviewed against applicable privacy and healthcare requirements in each supported region.'
  },
  {
    question: 'What happens after a donor accepts a request?',
    answer:
      'After accepting, the donor receives the hospital’s location, contact details, and available appointment guidance. The hospital can review the response and confirm an appropriate time or provide additional preparation instructions. Acceptance indicates willingness to help but does not guarantee that a donation will proceed. The hospital performs the required identity, eligibility, and clinical screening when the donor arrives.'
  },
  {
    question: 'Can hospitals schedule donation appointments through FLUID?',
    answer:
      'Yes, participating hospitals can propose and manage donation appointment times for donors who respond to a request. Donors can review the details and confirm a suitable slot, while both parties receive updates if the schedule changes. Appointment records give hospital teams a clearer view of expected donor arrivals. Clinical intake and final screening continue to be managed by the healthcare facility.'
  },
  {
    question: 'How will predictive analytics help reduce blood shortages?',
    answer:
      'FLUID’s planned analytics tools will examine historical demand, inventory trends, seasonal patterns, and request activity to identify potential shortages earlier. Hospitals can use these signals to plan outreach before stock reaches a critical level. Forecasts are intended to support operational decisions rather than replace clinical judgment or inventory controls. Their accuracy will improve as participating facilities contribute more complete and timely data.'
  },
  {
    question: 'Is FLUID available in every country?',
    answer:
      'Not yet. Availability depends on local healthcare partnerships, blood donation regulations, privacy requirements, and the ability to verify participating facilities. FLUID will expand region by region after the necessary operational and compliance checks are complete. Users should rely on official local launch information rather than assuming the service is active in their area.'
  },
  {
    question: 'What should I do if I am no longer available to donate?',
    answer:
      'Update your availability in your donor profile as soon as your circumstances change. If you have already accepted a request or confirmed an appointment, cancel through FLUID and contact the hospital when the donation is time-sensitive. You can make yourself available again whenever you are ready and eligible. Changing your status does not affect your ability to use the platform later.'
  }
];

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reduceMotion = useReducedMotion();

  return (
    <div className="mx-auto mt-6 max-w-2xl space-y-1.5">
      {faqs.map((item, index) => {
        const isOpen = openIndex === index;
        const buttonId = `faq-button-${index}`;
        const panelId = `faq-panel-${index}`;

        return (
          <div key={item.question} className="rounded-2xl border border-red-100/70 bg-[#FFF7F7] p-4">
            <h3>
              <button
                id={buttonId}
                type="button"
                className="flex w-full items-center justify-between gap-4 text-left"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
              >
                <span className="text-[15px] font-semibold text-slate-900">{item.question}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-500 ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { height: { duration: 0.28 }, opacity: { duration: 0.2 } }}
                  className="overflow-hidden"
                >
                  <p className="mt-1.5 pr-9 text-[14px] leading-7 text-slate-600">{item.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
