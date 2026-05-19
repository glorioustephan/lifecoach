// Date-seeded composer placeholder rotation. Same prompt all day; rotates daily.
// Categories per visual-design.md §11: physical, emotional, practical, reflective.

const PLACEHOLDERS = [
  "How are you sleeping this week?",
  "Anything about today's blood work worth noting?",
  "What do you want your coach to know about this week?",
  "What's one thing on your mind right now?",
  "How did this morning's routine go?",
  "What would make tomorrow feel lighter?",
  "Anything you'd like to think out loud about?",
  "What's a small win from yesterday?",
  "What are you avoiding that would help you most?",
  "How's your energy holding up today?",
] as const;

export const placeholderForToday = (now: Date = new Date()): string => {
  // Days-since-epoch as the seed — same all day, advances at midnight local.
  const dayNum = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
  return PLACEHOLDERS[dayNum % PLACEHOLDERS.length] ?? PLACEHOLDERS[0]!;
};
