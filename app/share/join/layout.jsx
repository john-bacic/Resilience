/**
 * Server-side metadata for /share/join so iMessage / Slack / X link previews
 * sell the actual product (4-step protocol + affect labeling), not just the
 * generic root description.
 *
 * Kept as a layout (vs. moving metadata to the page) because the page itself
 * is "use client" — metadata must come from a server component.
 */
export const metadata = {
  title: "STOIC AF — How to never be affected by anything or anyone.",
  description:
    "5-minute daily resilience practice. Separate fact from story, run the control filter, name the feeling in one word, choose your response. Marcus Aurelius mindset, Navy SEAL training method.",
  openGraph: {
    title: "How to never be affected by anything or anyone.",
    description:
      "30-day stoic resilience. Plus: AI names the feeling for you (UCLA-backed affect labeling quiets the brain's alarm system in seconds). Someone shared their diary so you can see what it looks like.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "How to never be affected by anything or anyone.",
    description:
      "30-day stoic resilience. AI names the feeling so your brain can finally land — UCLA-backed."
  }
};

export default function ShareJoinLayout({ children }) {
  return children;
}
