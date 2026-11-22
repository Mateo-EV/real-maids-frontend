/** Shared public-site content for The Real Maids landing pages. */

export const LANDING_CONTACT_PHONE = "965808455"
export const LANDING_CONTACT_HREF = `tel:${LANDING_CONTACT_PHONE}`

export const LANDING_NAV = [
  { key: "home", label: "Home", href: "/landing" },
  { key: "quote", label: "Get a Quote", href: "/landing/quote" },
  { key: "work", label: "Work With Us", href: "/landing/work-with-us" },
  { key: "faq", label: "FAQ", href: "/landing/faq" }
] as const

export type LandingNavKey = (typeof LANDING_NAV)[number]["key"]

export const LANDING_SERVICES = [
  {
    number: "01",
    badge: "Popular",
    name: "VIP Program",
    description: "Recurring weekly or biweekly care.",
    tone: "sage"
  },
  {
    number: "02",
    badge: "Fresh",
    name: "Move In / Out",
    description: "A detailed reset before keys change.",
    tone: "peach"
  },
  {
    number: "03",
    badge: "Regular",
    name: "Housekeeping",
    description: "Reliable support for your regular routine.",
    tone: "sky"
  }
] as const

export const LANDING_CLEANING_TYPES = [
  "VIP Program",
  "Move In / Out",
  "Housekeeping",
  "Deep clean"
] as const

export const LANDING_HOME_SIZES = [
  "Under 1,000 sq ft",
  "1,000 - 2,000 sq ft",
  "2,000 - 3,000 sq ft",
  "Over 3,000 sq ft"
] as const

export const LANDING_FAQS = [
  {
    question: "What areas do you serve?",
    answer: "We serve Tampa Bay and surrounding communities, from Lutz and Odessa to Palmetto."
  },
  {
    question: "How is my quote calculated?",
    answer:
      "Your quote depends on your ZIP code, the cleaning type, your home size and your preferred day. We confirm the final price with you before any service."
  },
  {
    question: "Do I need to provide cleaning supplies?",
    answer: "No. Our teams bring professional supplies and equipment."
  },
  {
    question: "What is the VIP Program?",
    answer: "Recurring weekly or biweekly cleaning with priority booking."
  },
  {
    question: "Are pets okay during the cleaning?",
    answer: "Please tell us about your pets when you book so we can plan accordingly."
  }
] as const
