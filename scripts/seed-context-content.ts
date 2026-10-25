// What the AI knows about each sample chat beyond its messages: every sample person's private
// profile answers, the habits each chat knows about its people, and settled stakes that fill the
// gaps the example stakes in docs/DEMO_STAKES.md need. Content only; seed-context.ts writes it.
import type { RichLine } from "./seed-rich-content";

/** Answers to lib/profile-questions.ts, as each sample person would give them. Never Ilyas or a teammate. */
export const PROFILES: Record<string, Record<string, string>> = {
  jake: { study: "Economics, 2nd year at Imperial. Part-time at a City firm on Fridays", marks: "Around 58, a few late hand-ins", punctual: "Famously late", sleep: "Asleep about 2am, snoozes four alarms, up at 10", active: "Now and then", goals: "Get to things on time, pass every module", career: "Part-time job, not applying anywhere yet", fun: "Arsenal, pub quizzes, FIFA", words: "Chaotic, funny, late", relationship: "Seeing someone" },
  priya: { study: "Maths and Economics, 2nd year at Imperial", marks: "Averaging 78, 9 or 10 on most Thursday quizzes", punctual: "Always early", sleep: "Asleep by 11:30, up at 7", active: "A few times a week", goals: "A first, and a spring week at a bank", career: "12 applications out, 2 first rounds", fun: "Running the flat rota, quizzes, bouldering", words: "Organised, competitive, usually right", relationship: "In a relationship" },
  sam: { study: "Economics, 2nd year at Imperial", marks: "Around 58, misses a lot of 9ams", punctual: "Usually a bit late", sleep: "Asleep 1 to 2am, sleeps through most 9ams", active: "A few times a week", goals: "Sub-26 parkrun, go to more 9ams", career: "Haven't started applying", fun: "Running, documentaries, late matches", words: "Easy-going, sleepy, kind", relationship: "Single" },
  maya: { study: "Biomedical science, 2nd year", marks: "Mid 60s", punctual: "On time", sleep: "Asleep by 10:30, up at 6 for the gym", active: "Most days", goals: "Half marathon in March under 1:55", career: "Applying for lab placements this summer", fun: "Running, gym, meal prep", words: "Disciplined, blunt, early", relationship: "Seeing someone" },
  omar: { study: "Maths and Economics, 2nd year at Imperial", marks: "Around 68", punctual: "Usually a bit late", sleep: "Asleep about 1am, up at 8", active: "A few times a week", goals: "A spring week offer, and good Finance Soc events", career: "25 applications, HireVues done, 2 first rounds", fun: "Five-a-side up front, Arsenal, cycling", words: "Driven, generous, forgetful", relationship: "Single" },
  chloe: { study: "Economics, 2nd year at Imperial", marks: "Around 65, usually hands in in the last hour", punctual: "On time", sleep: "Asleep by 11, up at 6:30 to run", active: "A few times a week", goals: "First 10k, a JPM spring week", career: "8 applications, JPM one is in", fun: "Spanish on Duolingo, 7am runs", words: "Steady, last-minute, kind", relationship: "Single" },
  aisha: { study: "Maths and Economics, 2nd year at Imperial", marks: "Averaging 72, reads every lecture note", punctual: "Always early", sleep: "Asleep by midnight, up at 7:30", active: "Now and then", goals: "A first, and the newsletter out every Monday", career: "Applying to quant internships", fun: "Reading, baking, the newsletter", words: "Careful, reliable, quiet" },
  leo: { study: "Maths and Economics, 2nd year at Imperial", marks: "Around 55 on problem sets", punctual: "Usually a bit late", sleep: "Asleep about 3am, up at 11", active: "Rarely", goals: "Grow the Finance Soc Instagram to 2,000", career: "Not looking yet", fun: "Making reels, nights out", words: "Social, creative, disorganised", relationship: "Single" },
  dan: { study: "Sports science, 3rd year", marks: "Around 60", punctual: "On time", sleep: "Asleep at midnight, up at 8", active: "Most days", goals: "20 goals this season", career: "Doing a personal trainer course", fun: "Football, gym, nights out", words: "Loud, reckless, loyal", relationship: "Single" },
  tom: { study: "Accounting and Finance, 2nd year", marks: "Around 66", punctual: "Always early", sleep: "In bed by 11 most nights", active: "Most days", goals: "Sub-22 5k, minutes posted on time", career: "Applying for audit internships", fun: "In goal on Sundays, parkrun, Spurs", words: "Reliable, dry, Spurs fan", relationship: "In a relationship" },
  zara: { study: "Economics and Management, 2nd year", marks: "Around 70", punctual: "Usually a bit late", sleep: "Asleep about 1am, up at 7:30", active: "Now and then", goals: "A spring week offer, 200 Finance Soc members", career: "30 applications, UBS test passed, lots of rejections", fun: "Events, merch, networking", words: "Ambitious, busy, persuasive", relationship: "Single" },
  mum: { study: "Primary school teacher", punctual: "Always early", sleep: "Asleep by 10:30, up at 6", active: "Now and then", goals: "Everyone home for Sunday roast", fun: "Cooking, calling Ilyas, the garden", words: "Caring, organised, a worrier", relationship: "Engaged or married" },
  dad: { study: "Civil engineer, works from home on Fridays", punctual: "On time", sleep: "Asleep on the sofa by 9:30 most nights", active: "Rarely", goals: "Finish the shed before Christmas", fun: "Films (until he falls asleep), DIY, the news", words: "Calm, forgetful, stubborn", relationship: "Engaged or married" },
  yasmin: { study: "Sixth form in Harrow, applying for law", marks: "Maths mocks around a 7", punctual: "On time", sleep: "Asleep at midnight, up at 7", active: "Now and then", goals: "Pass her driving test, get into law", career: "Part-time at a café on Saturdays", fun: "FIFA, driving lessons, winding Zayn up", words: "Sharp, competitive, funny", relationship: "Seeing someone" },
  nadia: { study: "Medicine, 3rd year at UCL", marks: "Anatomy mocks around 68", punctual: "On time", sleep: "Asleep by 11, often during films", active: "A few times a week", goals: "Do well in year 3, the Paris weekend", career: "Hospital placements this year", fun: "Gym, films, cooking", words: "Kind, clever, sleepy", relationship: "In a relationship" },
  zayn: { study: "Junior engineer in Manchester, 24", punctual: "Usually a bit late", sleep: "Asleep about 1am, up at 7", active: "A few times a week", goals: "Sub-25 5k, pass probation", career: "Junior engineer, probation signed off", fun: "Man United, running, FIFA", words: "Laid-back, generous, slow to reply", relationship: "Single" },
  kofi: { study: "Computer science, 2nd year at Warwick", marks: "Averaging 74, hands in a day early", punctual: "Always early", sleep: "Asleep at midnight, up at 7", active: "A few times a week", goals: "A software internship, the Lisbon trip", career: "Two online assessments done for software internships", fun: "Spreadsheets, hackathons, five-a-side", words: "Organised, reliable, nerdy", relationship: "Single" },
  hana: { study: "Architecture, 2nd year at Edinburgh", marks: "Crits go well, work done the night before", punctual: "Usually a bit late", sleep: "3 to 4am before crits, otherwise about 1am", active: "Rarely", goals: "Survive crit season, get to Lisbon", career: "Not yet", fun: "Drawing, film photography, the studio", words: "Creative, slow to reply, warm" },
  theo: { study: "Accounting apprentice in Canary Wharf, studying for the ACA", marks: "Passed his first ACA exam", punctual: "Usually a bit late", sleep: "Asleep at midnight, up at 6:30 for work", active: "Now and then", goals: "Pass the ACA exams, make the reunion", career: "Apprenticeship, very busy at month end", fun: "The pub, FIFA, saying yes to plans", words: "Fun, flaky, busy", relationship: "Seeing someone" },
  ruby: { study: "English, 2nd year at Bristol", marks: "2:1s, essays written the night before", punctual: "Usually a bit late", sleep: "Asleep about 2am, up at 10", active: "Now and then", goals: "A 2:1, the Lisbon trip", career: "Maybe publishing, not applying yet", fun: "Books, karaoke, the train home", words: "Funny, last-minute, chatty", relationship: "Single" },
};

/** Added to each sample chat's AI context once, after whatever the chat already says. */
export const HABITS_MARK = "Habits everyone here knows:";
export const HABITS: Record<string, string> = {
  "Flat 4B": "Jake is late to most Friday dinners and blames the District line; he pays his rent share a few days late about half the time. Sam sleeps through most 9am lectures and forgets the bins on Wednesday nights. Maya is at the gym before 7 most mornings. Priya runs the rota and gets top marks. Ilyas cooks about half the Fridays he says he will.",
  "Maths & Econ Y2": "Leo skips lectures most weeks and asks for the problem-sheet answers. Chloe submits in the last hour before the deadline. Priya scores 9 or 10 on most Thursday quizzes. Aisha reads every lecture note and does well on problem sheets. Omar skips lectures to prepare for interviews.",
  "Sunday League": "Omar scores most weeks. Dan gets booked or takes someone out with a tackle about half the time. Jake turns up late more often than not, and Sam pays the pitch money late about a third of the time. Tom is in goal and rarely keeps a clean sheet. The team goes to the pub after most games.",
  "Spring Week Grind": "Omar gets through most HireVues and always does a mock before an interview. Zara gets more rejections than replies and only sometimes lands a first round. Chloe sends fewer applications than she plans. Ilyas applies late at night.",
  Family: "Dad falls asleep in front of the telly before the end of most films. Mum calls Ilyas several times a week. Sunday roast is usually on the table after 2pm. Yasmin sometimes brings her boyfriend to roast and is learning to drive.",
  "Run Club": "Maya runs about 25 km most weeks and finishes parkrun in 23 to 25 minutes. Sam rarely breaks 26 minutes at parkrun and skips about half the Tuesday intervals. Tom finishes in the top 30 and goes to bed early before runs. Chloe gets two or three runs in a week. Not everyone makes post-run brunch.",
  "Friday Dinner Crew": "Jake is late to most Friday dinners, often by more than 20 minutes, and slow to reply. Omar is late about a third of the time and pays people back late. Sam rarely makes it to the gym before work. Maya is never late. Priya sends the bill split the same night.",
  "Finance Soc Committee": "Zara starts committee meetings late more often than on time. Aisha's Monday newsletter goes out before 9am about half the time. Tom posts the minutes late more often than not. Leo's posts get around 80 to 120 likes. Omar confirms speakers and venues late.",
  Nadia: "Ilyas is late to date night about half the time and cooks on Thursday about half the time. Nadia replies to the morning text before 10 about half the time and falls asleep in about a third of films.",
  Siblings: "Zayn comes home most months but pays Ilyas back late and replies slowly. Ilyas and Zayn race to call Mum on Sundays. Yasmin revises maths on some school nights and is learning to drive.",
  "Harrow Sixth Form": "Theo cancels on the day more often than he turns up. Hana replies hours later, especially in crit week, and misses most group calls. Ruby nearly always makes the 23:52 but hands essays in late about half the time. Kofi pays first and hands work in early.",
};

/**
 * Settled stakes the example stakes lean on. Same shape as seed-rich-content.ts, except that the
 * share that came true is exactly round(p x times), so each person's record matches their habits.
 */
export type ContextStory = {
  group: string;
  subject: string | null;
  title: string;
  category: string;
  p: number;
  times: number;
  /** Deadline length in hours. */
  span: number;
  rule: string;
  yes: RichLine[][];
  no: RichLine[][];
};

export const CONTEXT_STORIES: ContextStory[] = [
  { group: "Flat 4B", subject: "sam", title: "{s} takes the bins out on Wednesday night", category: "home", p: 0.3, times: 6, span: 30,
    rule: "YES if Sam has both bins out on the street before midnight on Wednesday.",
    yes: [[["$s", "bins are out. both of them"], ["$a", "sam?? our sam??"]], [["$a", "bins went out on time this week"], ["$s", "I set an alarm called BINS"]]],
    no: [[["$a", "bins are still in the kitchen"], ["$s", "I thought it was thursday"], ["$b", "it is always wednesday sam"]], [["$a", "missed the collection again"], ["$s", "my bad, I'll do next week"]]] },
  { group: "Flat 4B", subject: "maya", title: "{s} is at the gym before 7am", category: "fitness", p: 0.8, times: 6, span: 24,
    rule: "YES if Maya checks in at the gym before 7am on the day.",
    yes: [[["$s", "done by 7:15, legs"], ["$a", "it's dark outside maya"]], [["$a", "heard the door at 6:10"], ["$s", "gym, obviously"]]],
    no: [[["$s", "slept through it, first time this month"], ["$a", "she's human after all"]]] },
  { group: "Maths & Econ Y2", subject: "leo", title: "{s} skips the Monday lecture", category: "uni", p: 0.7, times: 5, span: 30,
    rule: "YES if Leo isn't in the Monday 10am lecture in person.",
    yes: [[["$a", "no leo at the lecture"], ["$s", "I'll watch the recording"], ["$b", "you won't"]], [["$s", "can someone send me the notes from today"], ["$a", "so you skipped"]]],
    no: [[["$a", "leo is in the front row??"], ["$s", "new week new me"]], [["$s", "I was there, back left"], ["$b", "can confirm, he was asleep but there"]]] },
  { group: "Maths & Econ Y2", subject: "aisha", title: "{s} gets 70 or more on the problem sheet", category: "uni", p: 0.75, times: 5, span: 140,
    rule: "YES if Aisha's mark on this week's problem sheet is 70 or more.",
    yes: [[["$s", "got 82 back"], ["$a", "she reads the lecture notes, that's the secret"]], [["$a", "aisha what did you get"], ["$s", "76"], ["$b", "of course"]]],
    no: [[["$s", "only 64 this time, question 3 got me"], ["$a", "question 3 got everyone"]]] },
  { group: "Sunday League", subject: "tom", title: "{s} keeps a clean sheet on Sunday", category: "football", p: 0.2, times: 6, span: 48,
    rule: "YES if Tom's team concedes no goals while he's in goal.",
    yes: [[["$a", "CLEAN SHEET for tom"], ["$s", "told you, wall"]]],
    no: [[["$a", "3 conceded, two through tom's legs"], ["$s", "the defence left me alone"]], [["$s", "one goal, a deflection, doesn't count"], ["$b", "it counts tom"]]] },
  { group: "Spring Week Grind", subject: "zara", title: "{s} gets a first-round interview this week", category: "work", p: 0.3, times: 5, span: 168,
    rule: "YES if Zara is invited to a first-round interview by any bank within the week.",
    yes: [[["$s", "first round with barclays!!"], ["$a", "let's go zara"]]],
    no: [[["$s", "three rejections and a silence"], ["$a", "the silence is a maybe"]], [["$a", "any interviews this week zara"], ["$s", "nope, just the online tests"]]] },
  { group: "Family", subject: "mum", title: "{s} has the roast on the table by 2pm", category: "home", p: 0.3, times: 5, span: 30,
    rule: "YES if Sunday roast is served by 2pm.",
    yes: [[["$s", "food's on the table, 1:55, come down"], ["$a", "early?? who are you"]]],
    no: [[["$s", "the potatoes need 20 more minutes"], ["$a", "it's 2:15 mum"], ["$s", "they'll be worth it"]], [["$a", "roast at 2:40 again"], ["$s", "your dad was in the shed"]]] },
  { group: "Family", subject: "yasmin", title: "{s} passes her mock driving test", category: "other", p: 0.4, times: 3, span: 72,
    rule: "YES if Yasmin's instructor marks her mock test as a pass.",
    yes: [[["$s", "passed the mock!! 4 minors"], ["$a", "proud of you"]]],
    no: [[["$s", "failed the mock, roundabout again"], ["$a", "the roundabout by the station is evil"]]] },
  { group: "Run Club", subject: "sam", title: "{s} skips Tuesday intervals", category: "fitness", p: 0.5, times: 6, span: 30,
    rule: "YES if Sam isn't at Tuesday evening intervals.",
    yes: [[["$a", "no sam at intervals"], ["$s", "my calves said no"]], [["$s", "can't make it tonight, deadline"], ["$a", "the deadline is always on a tuesday"]]],
    no: [[["$s", "made it, dying"], ["$a", "sam at intervals, rare sighting"]]] },
  { group: "Friday Dinner Crew", subject: "priya", title: "{s} sends the bill split the same night", category: "money", p: 0.9, times: 5, span: 20,
    rule: "YES if Priya posts everyone's share of the bill before midnight on the night.",
    yes: [[["$s", "split sent, £23.40 each"], ["$a", "she's so quick"]], [["$s", "everyone owes me £18, details in the app"], ["$b", "before we've even left"]]],
    no: [[["$s", "split tomorrow, my phone died"], ["$a", "priya's phone died?? end of an era"]]] },
  { group: "Finance Soc Committee", subject: "omar", title: "{s} confirms the venue a week before the event", category: "work", p: 0.35, times: 4, span: 168,
    rule: "YES if Omar posts the confirmed venue at least seven days before the event.",
    yes: [[["$s", "venue confirmed for the 14th, Huxley 311"], ["$a", "a whole week early, omar"]]],
    no: [[["$a", "omar is the venue confirmed"], ["$s", "nearly, waiting on a reply"], ["$b", "the event is on thursday"]], [["$s", "venue sorted!"], ["$a", "the day before, again"]]] },
  { group: "Siblings", subject: "zayn", title: "{s} pays Ilyas back within a week", category: "money", p: 0.35, times: 4, span: 168,
    rule: "YES if Zayn transfers what he owes Ilyas within seven days.",
    yes: [[["$s", "sent you the £30"], ["$a", "within a week? are you ok"]]],
    no: [[["$a", "zayn the £25"], ["$s", "payday is friday, promise"]], [["$s", "will sort it at the weekend"], ["$a", "you said that last weekend"]]] },
  { group: "Siblings", subject: "yasmin", title: "{s} revises maths for an hour on a school night", category: "uni", p: 0.45, times: 5, span: 30,
    rule: "YES if Yasmin sends a photo of an hour of maths revision before 10pm.",
    yes: [[["$s", "one hour of integration done, photo attached"], ["$a", "proud of you"]]],
    no: [[["$s", "I was going to but FIFA"], ["$a", "classic"]], [["$a", "revision photo?"], ["$s", "tomorrow, definitely"]]] },
  { group: "Harrow Sixth Form", subject: "theo", title: "{s} cancels on the day", category: "social", p: 0.6, times: 6, span: 48,
    rule: "YES if Theo pulls out of an agreed plan on the day itself.",
    yes: [[["$s", "so sorry, work thing, can't make tonight"], ["$a", "the work thing strikes again"]], [["$s", "I'm going to have to bail, month end"], ["$b", "it's the 9th theo"]]],
    no: [[["$s", "I'm here, where are you lot"], ["$a", "theo is EARLY"]], [["$a", "theo actually came"], ["$s", "I always come"], ["$b", "you do not"]]] },
  { group: "Harrow Sixth Form", subject: "hana", title: "{s} joins the first-Sunday group call", category: "social", p: 0.35, times: 4, span: 24,
    rule: "YES if Hana joins the monthly 7pm group call for at least ten minutes.",
    yes: [[["$s", "joining now, sorry I'm on mute"], ["$a", "hana's here!!"]]],
    no: [[["$a", "no hana on the call"], ["$s", "sorry, studio till 11"]], [["$s", "just seeing this, was it fun"], ["$a", "it was two hours ago hana"]]] },
  { group: "Harrow Sixth Form", subject: "kofi", title: "{s} pays his share within an hour of the spreadsheet going out", category: "money", p: 0.85, times: 5, span: 24,
    rule: "YES if Kofi's share is marked paid within an hour of the spreadsheet being shared.",
    yes: [[["$s", "paid, marked green in the sheet"], ["$a", "the sheet went out 4 minutes ago"]], [["$s", "done"], ["$b", "kofi is the only one who pays"]]],
    no: [[["$s", "on a train, paying tonight"], ["$a", "kofi late to pay?? screenshot it"]]] },
];
