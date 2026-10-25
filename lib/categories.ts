// What the AI should weigh for each kind of stake, and the rough everyday odds it starts from
// before this group has any history of its own. Pure data, shared by the server and the browser.
//
// The everyday odds are rough priors for a typical UK student or young professional, not
// statistics about anyone here. The prompt says so, and tells the AI to prefer the group's own
// record and the person's own answers whenever there are any.

export type Playbook = {
  id: string;
  label: string;
  /** Words that suggest this kind, checked in order (first match wins). */
  words: RegExp;
  /** What moves the odds for this kind, in the order the AI should weigh it. */
  weigh: string;
  /** Rough everyday odds for common versions of this question. */
  everyday: string;
  /** Starting odds with no history and no AI: a short bet, and a long-term stock. */
  prior: { bet: number; stock: number };
  /** Profile answers (ids from profile-questions.ts) that matter for this kind. */
  profile: string[];
  /** What the friends can write in the chat's AI context or the stake's details to sharpen the odds. */
  context: string[];
  examples: string[];
};

export const PLAYBOOKS: Playbook[] = [
  {
    id: "punctuality",
    label: "Lateness",
    words: /\blate\b|\blater than\b|on time|\bearly\b|show(s)? up|turn(s)? up|arriv|sleeps? through|oversleep|\b(make|makes|miss|misses) (his|her|their|the) \d{1,2}(:\d\d)?(am|pm)\b/i,
    weigh:
      "The person's own lateness record for this kind of event beats everything else. Then how far they travel and how (tube, train, cycling, walking), anything scheduled just before (a shift, a call, a lecture), what they say in the chat this week (a 'wfh' or 'leaving now' changes things), and how strict the line is (any lateness vs more than 15 minutes).",
    everyday: "late at all to a casual plan: about 50%; more than 15 minutes late: about 25%; someone who calls themselves 'famously late': 75% or more; someone 'always early': under 15%.",
    prior: { bet: 0.5, stock: 0.35 },
    profile: ["punctual", "sleep", "study"],
    context: ["Where and when the regular plans happen (Friday dinner 7:30pm at Maya's)", "How each person gets there and how far", "Known disruptions (tube closures, engineering works)"],
    examples: ["Jake is late to Friday dinner", "Jake is more than 15 minutes late to the cinema", "Sam makes his 9am on Monday"],
  },
  {
    id: "relationships",
    label: "Dating and relationships",
    words: /girlfriend|boyfriend|\bdate\b|dating|\bdates\b|crush|\bsingle\b|relationship|texts? (them |her |him )?back|engag|\bpropos(e|es|al)\b|marri|wedding|\bring\b|anniversary|hinge|tinder|bumble|situationship|break(s)? up|dumped|soft launch|move(s)? in together|second date|husband|wife|fianc/i,
    weigh:
      "How long they have been together or talking, what they have said about plans (ring shopping, meeting the parents, moving in), their age and stage (still at uni vs working), and the person's own relationship answer. Big steps take longer than friends expect, so be careful with short deadlines. Treat the chat as the main live signal.",
    everyday:
      "a second date after a good first one: about 55%; a new relationship still going after 3 months: about 50%; together 2+ years and engaged within the next 12 months: about 20%; engaged within a year for under-23s still at uni: under 5%; a proposal on a big holiday the couple has hinted at: about 30%; married within 2 years of an engagement: about 70%; breaking up in any given month for a settled couple: under 5%.",
    prior: { bet: 0.4, stock: 0.25 },
    profile: ["relationship", "goals", "words"],
    context: ["How long a couple has been together", "Planned trips or milestones (anniversary, meeting the parents)", "What the person has said about it themselves"],
    examples: ["Yasmin gets engaged before her 25th", "Sam gets a second date with the Hinge girl", "Jake soft-launches his girlfriend by Christmas", "Priya and Dev move in together before summer"],
  },
  {
    id: "work",
    label: "Jobs and careers",
    words: /intern|\bjob\b|offer|promot|\bboss\b|\bshift\b|\bwork\b|spring week|interview|applica|assessment cent|hirevue|rejection|hears? back|recruit|grad(uate)? scheme|\bcv\b|\bbank\b|ubs|barclays|goldman|jpm|lazard|linkedin|salary|\braise\b|placement|insight day|superday/i,
    weigh:
      "Where they are in the pipeline matters most: number of applications out, how many reached later stages, and their own career answer. Each stage has its own pass rate, so chain them (an offer needs the interview AND the assessment centre). Then timing from the context (application windows, when results come out) and what they say in the chat after each round. 'Hears back by Friday' depends on the firm's usual speed more than on the person.",
    everyday:
      "an offer from one competitive spring week or internship application: 2 to 5%; passing an online test or video interview: about 40%; getting a final-round invite after a first interview: about 35%; an offer after a final round or assessment centre: about 40%; landing at least one spring week across 20+ applications: about 50%; hearing back within a week of an interview: about 60%.",
    prior: { bet: 0.4, stock: 0.3 },
    profile: ["career", "study", "goals"],
    context: ["Who has applied where and which stage they are at", "When firms usually reply", "Application deadlines"],
    examples: ["Omar gets a spring week offer by March", "Zara hears back from UBS by Wednesday", "Chloe sends 20 applications by the end of November", "Ilyas gets through the HireVue stage"],
  },
  {
    id: "uni",
    label: "Exams and uni",
    words: /exam|\bgrades?\b|module|dissertation|\buni\b|degree|coursework|lecture|problem sheet|assignment|essay|(?<!pub )\bquiz\b|revis(e|ion)|with a first|2:1|\bmarks?\b|tutorial|seminar|reading list|\bterm\b|econometrics|\bmock\b|\bgcse|a-?level|\bucas\b|graduat|homework|deadline|\banswers\b/i,
    weigh:
      "The person's recent marks in the same module or a similar one are the strongest signal: a mark tends to land within about 5 points of their recent average. Then the line compared with that average (a 70 for someone averaging 64 is a stretch), how much time is left, deadlines and exam dates from the chat context, and what they say about how prepared they are. Passing is common; stretch targets are not.",
    everyday:
      "passing a first-year module first time: about 90%; a First overall at a UK university: about 30%; scoring 70+ on one piece for someone averaging in the low 60s: about 20%; finishing a problem sheet more than a day early: about 30%; attending every lecture in a week: about 35%.",
    prior: { bet: 0.45, stock: 0.35 },
    profile: ["study", "marks", "goals", "words"],
    context: ["Term dates, exam and deadline dates", "Recent marks people have shared in the chat", "Which modules are hard"],
    examples: ["Aisha gets 70 or more on the econometrics assignment", "Ilyas gets a First in the January exams", "Leo passes every January exam first time", "Chloe finishes the problem sheet before the weekend"],
  },
  {
    id: "football",
    label: "Football",
    words: /football|five-a-side|5-a-side|\bgoals?\b|\bmatch\b|league|arsenal|chelsea|united|\bcity\b|liverpool|spurs|tottenham|\bfc\b|\bbibs\b|tackle|premier|penalt|clean sheet|kicks? off|kick-?off|hat-?trick|sunday('s)? (game|league)/i,
    weigh:
      "For five-a-side: the player's scoring record per game, their position (a keeper rarely scores), who else is playing, and injuries mentioned in the chat. For professional matches: the bookmakers' odds if anyone quotes them, home advantage, recent form and injuries. A draw is a real outcome, so 'X beat Y' is rarely above 60%.",
    everyday: "a home win in the Premier League: about 45% (draw about 25%); a regular outfield player scoring in a five-a-side game: about 50%; a clean sheet in five-a-side: about 15%; a game going ahead in British autumn rain: about 90%.",
    prior: { bet: 0.45, stock: 0.35 },
    profile: ["active", "fun"],
    context: ["Fixtures and kick-off times", "Who plays where", "Injuries"],
    examples: ["Omar scores in Sunday's five-a-side", "Arsenal beat Spurs on 1 November", "Tom keeps a clean sheet in goal"],
  },
  {
    id: "sport",
    label: "Other sport",
    words: /tennis|\bf1\b|grand prix|\brace\b|cricket|rugby|boxing|\bfight\b|\bgame\b|darts|golf|snooker|\bnba\b|\bufc\b|olympic|wimbledon|world cup|ashes|test match|six nations/i,
    weigh: "Bookmakers' or expert odds if anyone quotes them, then recent form, head-to-head, home advantage and injuries. Favourites lose more often than fans think.",
    everyday: "a clear favourite in a single tennis match: about 70%; the pole sitter winning an F1 race: about 40%; a home side winning a rugby union match: about 60%.",
    prior: { bet: 0.45, stock: 0.35 },
    profile: ["fun"],
    context: ["Fixtures and dates", "Odds people have seen"],
    examples: ["Norris wins the next Grand Prix", "England beat Australia in the Ashes test"],
  },
  {
    id: "fitness",
    label: "Fitness and running",
    words: /\bgym\b|\brun(s|ning)?\b|marathon|\bhalf\b|\b\d+ ?k\b|\b\d+ ?km\b|weight|\bkg\b|\bsteps\b|bench|\blift|deadlift|squat|intervals|parkrun|\bswim|cycl|workout|\bpb\b|protein|personal best|sub-?\d\d/i,
    weigh:
      "Compare the target with what they do now: recent times or weights shared in the chat and their activity answer. Small improvements over weeks are common; big jumps are not. Then how many sessions are left before the deadline, injuries or illness, exams and holidays that get in the way, and whether they have actually signed up or paid for something.",
    everyday:
      "keeping a 'gym four times this week' plan: about 35%; a regular parkrunner getting a PB on a given Saturday: about 15%; finishing a race they have entered and trained for: about 90%; taking 5% off a 5k time within 8 weeks of steady training: about 50%; a new-year fitness goal still going at 3 months: about 30%.",
    prior: { bet: 0.45, stock: 0.35 },
    profile: ["active", "goals"],
    context: ["Race dates and entries", "Recent times, weights or weekly distances", "Training plans"],
    examples: ["Maya finishes the March half marathon in under 1:50", "Sam runs a sub-25 minute 5k before Christmas", "Maya deadlifts 100kg by Christmas", "Jake gets to the gym 4 times this week"],
  },
  {
    id: "money",
    label: "Money",
    words: /£|\bpays? (them |him |her |me |us )?back|\bowes?\b|money|budget|\bspend|broadband|\brent\b|\bbills?\b|\bsplit\b|savings|\bsave(s)?\b|overdraft|\bsalary\b|refund|deposit|bank balance|\bloan\b/i,
    weigh:
      "The person's record of paying people back or sticking to budgets, when they get paid (student loan dates, payday), how big the amount is for them, and reminders or excuses in the chat. People underestimate spending, so 'comes in under budget' leans below 50% unless they have a track record.",
    everyday: "paying a friend back by an agreed date: about 60%; staying under a weekly food budget: about 40%; a group's shared shop coming in under its usual price: about 35%; getting a deposit back in full from a landlord: about 60%.",
    prior: { bet: 0.45, stock: 0.35 },
    profile: ["study", "words"],
    context: ["Payday and student loan dates", "Shared bills and who owes what"],
    examples: ["Jake pays back the broadband money by the end of September", "The big Tesco shop comes in under £60", "We get the full deposit back"],
  },
  {
    id: "family",
    label: "Family",
    words: /\bmum\b|\bdad\b|\bmom\b|parents?|grandma|grandad|\bnan\b|\bgran\b|sister|brother|cousin|auntie|\buncle\b|family|in-laws/i,
    weigh: "Family habits are very steady: what someone did the last few times is the best guide. Then the week's plans (visitors, work, school), and what they say in the chat.",
    everyday: "a parent repeating a weekly habit (calling, nodding off, reminding about coats): about 70 to 80%; a DIY project finished by its first deadline: about 25%; a family holiday booked by the date it was meant to be: about 40%.",
    prior: { bet: 0.55, stock: 0.35 },
    profile: ["words", "fun"],
    context: ["Regular family routines (Sunday roast at 1pm, calls on Sunday)", "Upcoming visits and holidays"],
    examples: ["Dad falls asleep in front of the telly before 9pm", "Dad finishes the shed before New Year", "Mum reminds everyone to wear a coat"],
  },
  {
    id: "home",
    label: "Flat and home life",
    words: /\bbins?\b|clean|\brota\b|dishes|washing up|hoover|\bcooks?\b|cooking|takeaway|smoke alarm|laundry|shopping|tesco|\broast\b|\bshed\b|\bdiy\b|landlord|\bflat\b|housemate|flatmate|inspection|boiler|fridge|kitchen/i,
    weigh: "How the flat or house has done with the same chore before, whose turn it is on the rota, how busy the week is (deadlines, nights out), and reminders in the chat. Shared chores slip more as weeks go on.",
    everyday: "a student flat forgetting the bins in a given week: about 30%; a cleaning rota still followed after 2 months: about 20%; cooking instead of a takeaway on a weeknight: about 55%; the smoke alarm going off in a student flat in a given week: about 35%.",
    prior: { bet: 0.45, stock: 0.3 },
    profile: ["words"],
    context: ["Bin day and rota", "Inspection or visit dates", "Who cooks when"],
    examples: ["Somebody forgets the bins this week", "Priya's cleaning rota survives until Christmas", "The landlord's inspection passes with no complaints"],
  },
  {
    id: "travel",
    label: "Trips and travel",
    words: /holiday|\btrip\b|flight|airport|\btrain\b|interrail|abroad|passport|festival|\bvisa\b|\bski\b|getaway|ryanair|easyjet|delayed|book(s|ed)? the/i,
    weigh: "Whether anything is booked or paid for is the biggest signal: a trip with flights booked almost always happens, one only talked about in the chat usually doesn't. Then dates, cost, how many people need to agree, and the person's record of organising things.",
    everyday: "a group trip that has only been talked about: about 30%; a trip with flights booked: about 90%; a short-haul flight more than 15 minutes late: about 25%; getting to the airport with under an hour to spare: about 30%.",
    prior: { bet: 0.45, stock: 0.3 },
    profile: ["fun", "goals", "words"],
    context: ["Trip dates and what is booked", "Who is organising"],
    examples: ["The Lisbon trip is booked before Christmas", "The summer holiday is booked before February", "Our Ryanair flight is delayed by more than 15 minutes"],
  },
  {
    id: "social",
    label: "Nights out and plans",
    words: /party|\bclub\b|\bpres\b|night out|\bdrinks?\b|\bpints?\b|\bpub\b|\bbar\b|\bgig\b|concert|birthday|dinner|brunch|hangover|karaoke|quiz night|pub quiz|\bout out\b/i,
    weigh: "The person's record with the same plan, how firm the plan is (booked table vs 'we should'), what else is on that week (deadlines, money before payday), and what they say in the chat. 'Just one drink' rarely stays one.",
    everyday: "a plan made in the group chat actually happening: about 55%; someone sticking to 'just one': about 20%; everyone turning up to a booked dinner: about 70%.",
    prior: { bet: 0.5, stock: 0.35 },
    profile: ["fun", "words"],
    context: ["Regular plans and bookings", "Birthdays coming up"],
    examples: ["Leo only has one pint on Thursday", "Everyone makes it to Maya's birthday dinner", "Pub quiz team wins on Thursday"],
  },
  {
    id: "habits",
    label: "Sleep and habits",
    words: /sleep|\bbed\b|bedtime|asleep|screen time|\bphone\b|tiktok|\bread(s|ing)?\b|\bbooks?\b|habit|\bquit|\bvape|smok|caffeine|coffee|meditat|journal|duolingo|streak|\bdiet\b|sugar|dry (january|october)|sober|alcohol/i,
    weigh: "The person's sleep and habit answers and their recent record (streaks, what they admit in the chat). New habits fade quickly, so long streaks and 'every day this month' targets are hard. Then exams, nights out and travel that break routines.",
    everyday: "in bed by a target time on a given weeknight: about 40%; a 30-day streak of a new habit: about 25%; a month without alcohol once started: about 50%; keeping a Duolingo streak alive through a week: about 70%.",
    prior: { bet: 0.45, stock: 0.3 },
    profile: ["sleep", "words", "goals"],
    context: ["Streaks or challenges people have started", "Usual bedtimes"],
    examples: ["Sam is asleep before 1am every night this week", "Chloe keeps her Duolingo streak to 100 days", "Jake does Dry January"],
  },
  {
    id: "friendship",
    label: "Friends and the chat",
    words: /friend|fall(s)? out|argue|\breply|\bcalls?\b|group chat|left on read|\bghost|facetime/i,
    weigh: "The person's record of replying or turning up, how busy they are, and what is said in the chat.",
    everyday: "replying to the group chat within a day: about 70%; a falling-out lasting more than a week: about 20%.",
    prior: { bet: 0.5, stock: 0.35 },
    profile: ["words"],
    context: ["Who is around and when"],
    examples: ["Ilyas remembers to call home on Sunday", "Tom replies to the group chat before midnight"],
  },
];

export const OTHER: Playbook = {
  id: "other",
  label: "Other",
  words: /$^/,
  weigh: "Look for the closest past stakes in this group and the person's own record, then anything concrete in the details or chat. Without evidence stay near 50%.",
  everyday: "no useful everyday rate; start near 50%.",
  prior: { bet: 0.5, stock: 0.35 },
  profile: ["words", "goals"],
  context: ["Anything that sets the scene: dates, plans, who is involved"],
  examples: [],
};

export const CATEGORIES = [...PLAYBOOKS.map((p) => p.id), "other"];

export function playbook(id: string): Playbook {
  return PLAYBOOKS.find((p) => p.id === id) ?? OTHER;
}

export function guessCategory(text: string) {
  return PLAYBOOKS.find((p) => p.words.test(text))?.id ?? "other";
}

export const categoryLabel = (id: string) => playbook(id).label;
