// Time-of-day based greetings with occasional day-of-week flourish

const GREETINGS = {
  morning: ["Good morning", "Morning", "Rise and shine", "Greetings", "Hello"],
  afternoon: ["Good afternoon", "Hello", "Hey there", "Afternoon", "Welcome back"],
  evening: ["Good evening", "Evening", "There you are"],
  night: ["Still at it?", "Burning the midnight oil", "Good evening", "Late night, huh?"],
};

const DAY_FLOURISHES = [
  "Happy Monday!",
  "Tuesday's here!",
  "Midweek check-in",
  "Thursday energy",
  "Almost there!",
  "Happy Friday!",
  "Weekend vibes",
];

const SPECIAL_OCCASIONS = [
  "New month energy!",
  "New week, new goals",
  "You've got this",
  "Keep going",
  "Making progress",
];

export function getGreeting(name?: string): string {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const dayOfMonth = now.getDate();

  // Determine time of day
  let timeOfDay: keyof typeof GREETINGS;
  if (hour < 12) {
    timeOfDay = "morning";
  } else if (hour < 17) {
    timeOfDay = "afternoon";
  } else if (hour < 21) {
    timeOfDay = "evening";
  } else {
    timeOfDay = "night";
  }

  // Deterministic greeting selection (stable within an hour)
  const options = GREETINGS[timeOfDay];
  const base = options[hour % options.length]!;

  // ~30% chance to add a flourish (deterministic by date + hour)
  const flourishSeed = (dayOfMonth + hour) % 10;
  let greeting = base;

  if (flourishSeed < 3) {
    // Sunday = 0, Monday = 1, etc.
    const dayFlourish = DAY_FLOURISHES[dayOfWeek];
    greeting = `${base}, ${dayFlourish}`;
  } else if (flourishSeed < 5) {
    // First of month gets special occasion
    if (dayOfMonth === 1) {
      const month = now.getMonth();
      const occasion = SPECIAL_OCCASIONS[month % SPECIAL_OCCASIONS.length]!;
      greeting = `${base}, ${occasion}`;
    }
  }

  return name ? `${greeting}, ${name}.` : `${greeting}.`;
}
