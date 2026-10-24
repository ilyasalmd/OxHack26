// Seed content for FriendStakes: three months of believable chat, bets and long-term situations.
// Content only. The seed engine lives elsewhere.

export type Person = { username: string; name: string; color: string; skill: number; boldness: number };
// skill 0..1: how well calibrated their trades are (0.9 sharp, 0.3 clueless). boldness 0..1: how much they stake.
export type Line = [who: string, text: string];
// who is a username, or "$a" / "$b" / "$c" = three distinct random group members (engine picks), or "$s" = the subject of the situation.
export type Template = {
  title: string;
  subject: string | null;
  p: number;
  hours: number;
  perWeek: number;
  before: Line[][];
  yes: Line[][];
  no: Line[][];
};
export type Stock = {
  by: string;
  title: string;
  subject: string | null;
  openDaysAgo: number;
  resolveDaysFromNow: number;
  p0: number;
  drift: number;
  outcome?: boolean;
};
export type LiveBet = { by: string; title: string; subject: string | null; hoursLeft: number };
export type Group = {
  name: string;
  members: string[];
  aiContext: string;
  activity: number;
  snippets: Line[][];
  templates: Template[];
  stocks: Stock[];
  liveBets: LiveBet[];
  recent: Line[];
};

export const PEOPLE: Person[] = [
  { username: "ilyas", name: "Ilyas", color: "#c6ff3d", skill: 0.7, boldness: 0.55 },
  { username: "jake", name: "Jake", color: "#ff6b6b", skill: 0.3, boldness: 0.9 },
  { username: "priya", name: "Priya", color: "#b388ff", skill: 0.9, boldness: 0.5 },
  { username: "sam", name: "Sam", color: "#4dd0e1", skill: 0.5, boldness: 0.6 },
  { username: "maya", name: "Maya", color: "#ff9ecb", skill: 0.65, boldness: 0.4 },
  { username: "omar", name: "Omar", color: "#ffb74d", skill: 0.8, boldness: 0.6 },
  { username: "chloe", name: "Chloe", color: "#7fe3a0", skill: 0.55, boldness: 0.3 },
  { username: "aisha", name: "Aisha", color: "#64b5f6", skill: 0.6, boldness: 0.4 },
  { username: "leo", name: "Leo", color: "#f4d35e", skill: 0.4, boldness: 0.7 },
  { username: "dan", name: "Dan", color: "#e76f51", skill: 0.35, boldness: 0.8 },
  { username: "tom", name: "Tom", color: "#9fa8ff", skill: 0.55, boldness: 0.5 },
  { username: "zara", name: "Zara", color: "#e57ee0", skill: 0.6, boldness: 0.5 },
  { username: "mum", name: "Mum", color: "#f2c6a0", skill: 0.6, boldness: 0.2 },
  { username: "dad", name: "Dad", color: "#a3c4a0", skill: 0.45, boldness: 0.35 },
  { username: "yasmin", name: "Yasmin", color: "#4db6ac", skill: 0.5, boldness: 0.6 },
];

export const PASSWORD = "demo1234";

export const GROUPS: Group[] = [
  // ---------------------------------------------------------------------------------------------
  // 1. FLAT 4B
  // ---------------------------------------------------------------------------------------------
  {
    name: "Flat 4B",
    members: ["ilyas", "jake", "priya", "sam", "maya"],
    aiContext:
      "Five flatmates share a flat in South Kensington near Imperial. Friday dinners are at 7:30pm in the flat and the cook rotates. Bins go out Wednesday night for Thursday collection, the cleaning rota swaps on Mondays, and the landlord's flat inspection is on 12 November.",
    activity: 1.6,
    snippets: [
      [["maya", "anyone want anything from tesco"], ["sam", "oat milk and the good bread pls"], ["maya", "which is the good bread"], ["sam", "the seeded one not the sad one"]],
      [["priya", "reminder bins are tonight"], ["jake", "wasnt it last week"], ["priya", "it's every week jake"], ["jake", "fair"]],
      [["sam", "who finished the peanut butter"], ["ilyas", "not me"], ["maya", "not me"], ["sam", "so it just evaporated"], ["jake", "it was already low when i got here"]],
      [["ilyas", "landlord emailed, boiler guy coming tuesday between 8 and 6"], ["priya", "great so one of us has to stay in"], ["sam", "i have a 9am"], ["maya", "you have never made a 9am"], ["sam", "that was a cheap shot"]],
      [["jake", "who took my charger"], ["maya", "its in the lounge under the cushion"], ["jake", "mad how you always know"]],
      [["$a", "the heating is finally on"], ["$b", "i can feel my toes again"], ["$c", "dont touch the thermostat, its set to 19 on purpose"]],
      [["maya", "gym at 7 anyone"], ["ilyas", "its 6:40pm and i am in bed"], ["maya", "thats a no then"], ["priya", "I'll come, give me 10"]],
      [["sam", "kitchen bin is overflowing"], ["priya", "then take it out"], ["sam", "thats a big ask at this time"], ["ilyas", "its 3pm sam"]],
      [["ilyas", "pasta bake tonight, whos in"], ["jake", "me"], ["maya", "me, no onions"], ["ilyas", "its a pasta bake maya, onions are the point"], ["maya", "then no from me"], ["priya", "I'll have hers"]],
      [["priya", "rota for next week is in the group description"], ["jake", "nobody reads that"], ["priya", "you literally just did"]],
      [["jake", "south ken station is chaos today"], ["sam", "signal failure again?"], ["jake", "yeah. 35 min wait for the district line"], ["ilyas", "walk, its 20 mins"], ["jake", "absolutely not"]],
      [["maya", "someone left the window open all night, my room is a fridge"], ["sam", "that was me sorry, it was stuffy"], ["maya", "its october sam"]],
      [["$a", "wetherspoons after the lecture?"], ["$b", "im skint till friday"], ["$a", "they do the curry club thing on thursday though"], ["$b", "fine twist my arm"]],
      [["priya", "who's got the hoover"], ["jake", "think sam had it last"], ["sam", "I did not"], ["jake", "then its a mystery"], ["ilyas", "its in the cupboard under the stairs"], ["priya", "thank you ilyas"]],
      [["sam", "just saw a fox outside, massive"], ["maya", "send pic"], ["sam", "its gone, it looked at me like i owed it money"]],
      [["ilyas", "signed for a parcel earlier, someone's"], ["jake", "mine?"], ["ilyas", "its a kettlebell"], ["maya", "mine!"]],
      [["maya", "anyone seen my blue water bottle"], ["jake", "was it by the sink"], ["maya", "yes"], ["jake", "dont look in the dishwasher"], ["maya", "JAKE"]],
      [["priya", "landlord says the inspection is on the 12th"], ["sam", "do we need to like clean"], ["priya", "yes. properly. not a sock-under-the-sofa clean"], ["sam", "ok so no"], ["ilyas", "I'll do the oven if someone does the bathroom"], ["maya", "bathroom me"]],
      [["jake", "pub quiz thursday?"], ["ilyas", "depends are you going to argue with the quizmaster again"], ["jake", "he was wrong, it was a trick question"], ["ilyas", "it was a capital cities round jake"]],
      [["sam", "what's everyone doing for dinner"], ["maya", "chicken and rice, same as always"], ["sam", "do you ever get bored"], ["maya", "its 40g of protein sam"]],
      [["priya", "can we not all shower at 8am"], ["jake", "I shower at 11"], ["priya", "you shower whenever you get up so thats a no from me"], ["ilyas", "hot water ran out at 8:20 yesterday"], ["sam", "that was me, im sorry"]],
      [["ilyas", "got a cheeky 74 on the stats sheet"], ["maya", "well done"], ["priya", "I got 81"], ["ilyas", "didnt ask priya"], ["priya", "just sharing"]],
      [["$a", "anyone going into the library tmrw"], ["$b", "10am"], ["$a", "I'll save you a desk"], ["$b", "legend"]],
      [["jake", "somebody put a pizza box in the recycling with grease still in it"], ["priya", "you put it there"], ["jake", "how do you know"], ["priya", "because you told me last night"]],
      [["sam", "do we have any more bin bags"], ["maya", "tesco on the high street do a 40 pack for like 3 quid"], ["sam", "ill get them later if anyone gives me a lift"], ["ilyas", "its a 4 min walk sam"]],
      [["maya", "parkrun in the morning if anyone fancies it"], ["jake", "i have a headache already"], ["maya", "its saturday night jake"], ["jake", "exactly, planning ahead"]],
      [["priya", "did anyone see the friend stocks leaderboard"], ["jake", "im bottom arent i"], ["priya", "you are 400 coins down"], ["jake", "its a long game"]],
      [["sam", "I put 300 coins on myself waking up before 9"], ["maya", "you are going to lose those"], ["sam", "its called believing in yourself"]],
      [["ilyas", "who has all the coins now"], ["priya", "me. obviously"], ["maya", "you literally only bet when you know the answer"], ["priya", "that's the skill"]],
      [["maya", "reminder the coins are fake so stop being weird when you lose"], ["jake", "they feel real"], ["sam", "that's the whole point of them"]],
    ],
    templates: [
      {
        title: "{s} is late to Friday dinner",
        subject: "jake",
        p: 0.8,
        hours: 70,
        perWeek: 1.0,
        before: [
          [["priya", "friday dinner is 7:30, ilyas is making curry"], ["sam", "jake will stroll in at 8 like its nothing"], ["$s", "I will be there at 7:30 on the dot"]],
          [["sam", "taking bets on jake and friday dinner"], ["$s", "you're all so negative"]],
          [["ilyas", "ok friday, 7:30, jake that includes you"], ["$s", "I have a call at 6 but it should be fine"], ["maya", "it should be fine, he says"]],
        ],
        yes: [
          [["priya", "its 7:52"], ["$s", "sorry sorry the tube was a nightmare"], ["sam", "the tube is a nightmare every single friday apparently"]],
          [["maya", "pay up everyone who said late"], ["$s", "I was hovering outside"], ["ilyas", "hovering outside for 25 mins is just late with extra steps"]],
          [["$s", "ok I was late but I brought dessert"], ["priya", "from the corner shop, I can see the price sticker"], ["$s", "it is still dessert"]],
        ],
        no: [
          [["priya", "jake is here. 7:28. who am I"], ["$s", "told you"], ["sam", "I want an investigation"]],
          [["maya", "hang on he's actually early"], ["$s", "I'm a changed man"], ["ilyas", "he set 4 alarms, I heard them"]],
          [["$s", "on time. no excuses. you can pay me now"], ["sam", "fine. one time doesnt make a trend"]],
        ],
      },
      {
        title: "{s} sleeps through their 9am",
        subject: "sam",
        p: 0.55,
        hours: 36,
        perWeek: 0.9,
        before: [
          [["maya", "sam has a 9 tomorrow right"], ["priya", "he's got a 9 every day and he's made about two"], ["$s", "this time I have put my phone across the room"]],
          [["ilyas", "ok market on sam waking up for his 9am"], ["$s", "I'm going to be there, early even"], ["jake", "your alarm has been going off since 8:15 every day, I hear it"]],
          [["priya", "I'll knock on his door at 8:30 if someone bets on him"], ["$s", "I dont need a babysitter"]],
        ],
        yes: [
          [["$s", "I woke up at 10:40, the alarm didnt go off"], ["maya", "we heard you swear from the hallway"], ["priya", "it did go off, I heard it for forty minutes"]],
          [["$s", "can someone send me the notes"], ["ilyas", "from the 9am you slept through?"], ["$s", "the very same"]],
          [["$s", "ok I'll be honest, I turned it off and went back to sleep"], ["jake", "that's the first honest thing you've said all term"]],
        ],
        no: [
          [["$s", "I'm in the lecture. in the actual lecture."], ["priya", "I'd like a photo"], ["$s", "I've sat at the front out of fear"]],
          [["maya", "well done for being a person today"], ["$s", "the knocking helped"], ["priya", "you're welcome"]],
          [["$s", "9am: made it. I am a new man"], ["ilyas", "its 9:04, you're also late"], ["$s", "I'm taking the win"]],
        ],
      },
      {
        title: "Somebody forgets the bins this week",
        subject: null,
        p: 0.45,
        hours: 60,
        perWeek: 0.8,
        before: [
          [["$a", "bins are tuesday night i think"], ["$b", "wednesday"], ["$a", "it changed in september"]],
          [["$a", "the bin cupboard smells like a crime scene"], ["$b", "whose turn is it this week"]],
          [["$a", "I swear we always miss bin day"], ["$b", "this week we wont"], ["$a", "bet"]],
        ],
        yes: [
          [["$a", "bin men came, bins still in the kitchen"], ["$b", "whose week was it"], ["$c", "not saying"]],
          [["$a", "we missed it again, theres a bag on the counter growing legs"], ["$b", "I thought you were doing it"]],
          [["$a", "next collection is next thursday so that's a week of smell"], ["$b", "I'm going to the library to live"]],
        ],
        no: [
          [["$a", "bins are out. a hero walks among us"], ["$b", "who was it"], ["$a", "no idea, they were already outside when I checked"]],
          [["$a", "bins done, recycling too"], ["$b", "you're a legend"]],
          [["$a", "both bins out before 9pm, I'm not even sure I live here"], ["$b", "wow. nobody jinx it"]],
        ],
      },
      {
        title: "{s} gets to the gym 4 times this week",
        subject: "maya",
        p: 0.85,
        hours: 150,
        perWeek: 0.6,
        before: [
          [["sam", "maya's got her weekly gym target again"], ["$s", "four sessions. non negotiable"], ["jake", "what if theres a really good show on"]],
          [["priya", "maya you looked like you were dying on thursday"], ["$s", "legs day. I'll be back tomorrow"]],
          [["ilyas", "hearing a lot of 'gym tonight' from maya's room"], ["$s", "I'm just psyching myself up"]],
        ],
        yes: [
          [["$s", "four sessions done. I ache everywhere"], ["sam", "you're a machine"], ["$s", "rest day tomorrow. or parkrun"]],
          [["$s", "made it, 5 in the end"], ["jake", "overachiever"]],
          [["$s", "told you. legs are jelly"], ["priya", "I will take my winnings"]],
        ],
        no: [
          [["$s", "I got 3. I had a deadline"], ["jake", "I've been waiting all term for this"], ["$s", "its one session!"]],
          [["$s", "did two. I was ill. dont look at me"], ["sam", "nobody's judging"]],
          [["$s", "didn't make it. got caught up with the problem sheet, then it was 9pm"], ["priya", "ok that's fair"]],
        ],
      },
      {
        title: "The big Tesco shop comes in under £60",
        subject: null,
        p: 0.4,
        hours: 30,
        perWeek: 0.7,
        before: [
          [["$a", "big shop tomorrow, I'll make the list"], ["$b", "put the good coffee on it"], ["$a", "the good coffee is £6"]],
          [["$a", "shop is going to be at least eighty quid knowing us"], ["$b", "not if we skip the snacks"], ["$a", "we are not skipping the snacks"]],
          [["$a", "who's got the clubcard"], ["$b", "me, it saves like 40p"]],
        ],
        yes: [
          [["$a", "shop came to £54.30"], ["$b", "wait that's great"], ["$a", "we forgot the milk but sure"]],
          [["$a", "£57, cheaper than last week. the list works"], ["$b", "I'm shocked"]],
          [["$a", "£49.80 with the clubcard prices. split is about £10 each"], ["$b", "love that"]],
        ],
        no: [
          [["$a", "£71"], ["$b", "how"], ["$c", "someone put prosecco in the trolley, it was on offer"]],
          [["$a", "£68 and we still forgot the toilet roll"], ["$b", "of course we did"]],
          [["$a", "£63.40, it was the cheese and the oat milk"], ["$b", "every time"]],
        ],
      },
      {
        title: "{s} cooks tonight instead of getting a takeaway",
        subject: "ilyas",
        p: 0.6,
        hours: 20,
        perWeek: 0.5,
        before: [
          [["priya", "its ilyas's cooking night. what's it going to be"], ["$s", "something with pasta, probably"], ["sam", "that's a takeaway in a trench coat"]],
          [["maya", "ilyas you said you'd do the chicken thing tonight"], ["$s", "I was going to, depends how the lecture goes"], ["jake", "that's a no"]],
          [["sam", "we have no food in and its ilyas's night"], ["$s", "deliveroo is a form of cooking if you plate it nicely"]],
        ],
        yes: [
          [["$s", "chicken and rice, ready at 8. nobody touch the oven"], ["maya", "incredible"], ["sam", "I smell garlic. this is real"]],
          [["$s", "made a curry from scratch, theres loads left"], ["priya", "it's really good actually"]],
          [["$s", "cooked. dont make it weird"], ["jake", "I'm proud of you"]],
        ],
        no: [
          [["$s", "ok the oven didnt work out, I ordered nandos"], ["priya", "I knew it"], ["$s", "I'll put the receipt in for the split"]],
          [["$s", "got home at 8 and could not face it, pizza is on its way"], ["jake", "fine by me"]],
          [["$s", "tried to cook. burnt the onions. ordering"], ["sam", "the smoke alarm told us"]],
        ],
      },
      {
        title: "The smoke alarm goes off at least once this week",
        subject: null,
        p: 0.25,
        hours: 100,
        perWeek: 0.4,
        before: [
          [["$a", "I'm doing toast under the grill"], ["$b", "please watch it"], ["$a", "I always watch it, trust me"]],
          [["$a", "the alarm has been chirping again"], ["$b", "just take the battery out"], ["$a", "apparently that's against the lease"]],
          [["$a", "chip pan night"], ["$b", "is that a real thing in 2026"], ["$a", "it is in this flat"]],
        ],
        yes: [
          [["$a", "ok that wasn't my fault, the toaster is cursed"], ["$b", "the whole building heard it"], ["$c", "the neighbour has knocked"]],
          [["$a", "alarm went off at 11pm, so that's that"], ["$b", "I was in the shower"], ["$a", "sorry"]],
          [["$a", "who burnt the garlic bread"], ["$b", "it was golden brown"], ["$a", "it was black"]],
        ],
        no: [
          [["$a", "not a peep from the alarm all week, new record"], ["$b", "the toast was fine this time"]],
          [["$a", "quiet week on the alarm front"], ["$b", "dont jinx it"]],
          [["$a", "cooked a whole meal and no alarm, I'm basically a chef"], ["$b", "I wouldn't go that far"]],
        ],
      },
    ],
    stocks: [
      { by: "ilyas", title: "Jake pays back the broadband money by the end of September", subject: "jake", openDaysAgo: 55, resolveDaysFromNow: -24, p0: 0.5, drift: -0.25, outcome: false },
      { by: "sam", title: "Sam passes his driving theory test first time", subject: "sam", openDaysAgo: 70, resolveDaysFromNow: -15, p0: 0.4, drift: 0.2, outcome: true },
      { by: "priya", title: "Priya's cleaning rota survives until Christmas", subject: "priya", openDaysAgo: 30, resolveDaysFromNow: 62, p0: 0.5, drift: -0.15 },
      { by: "sam", title: "Maya deadlifts 100kg by Christmas", subject: "maya", openDaysAgo: 60, resolveDaysFromNow: 62, p0: 0.3, drift: 0.2 },
    ],
    liveBets: [
      { by: "sam", title: "Jake is late to Friday dinner", subject: "jake", hoursLeft: 110 },
      { by: "maya", title: "Sam sleeps through his 9am on Monday", subject: "sam", hoursLeft: 44 },
      { by: "priya", title: "The bins go out before Wednesday night ends", subject: null, hoursLeft: 90 },
    ],
    recent: [
      ["priya", "sam you have a 9 on monday"],
      ["sam", "I know I know"],
      ["maya", "theres a market on you btw"],
      ["sam", "a market on my sleep. unbelievable"],
      ["jake", "I put 200 coins on you not making it"],
      ["sam", "thanks for the vote of confidence jake"],
    ],
  },

  // ---------------------------------------------------------------------------------------------
  // 2. MATHS & ECON Y2
  // ---------------------------------------------------------------------------------------------
  {
    name: "Maths & Econ Y2",
    members: ["priya", "ilyas", "omar", "chloe", "aisha", "leo"],
    aiContext:
      "Second-year Maths and Economics at Imperial. Term ends on 11 December and the January exams run from 5 to 16 January 2027. Problem sheets are due Tuesday 5pm, the weekly quiz is on Thursday mornings, and the library fills up after 10am.",
    activity: 1.3,
    snippets: [
      [["chloe", "is the problem sheet due tuesday or monday"], ["priya", "tuesday 5pm"], ["chloe", "thank god. I have not started"], ["omar", "same"], ["leo", "can someone send question 3"], ["priya", "no"]],
      [["aisha", "anyone want to do the sheet in the library tmrw"], ["omar", "what time"], ["aisha", "10, before it fills up"], ["omar", "I can do 10:30"], ["aisha", "ok save me a desk if you beat me"]],
      [["leo", "what did he say the answer to 2b was"], ["ilyas", "you cant ask for answers mid-lecture, we're in the room"], ["leo", "I can see my phone is still in my hand"], ["chloe", "he asks every single week"]],
      [["omar", "new rule, no talking in the library before 11"], ["aisha", "who are you saying that to"], ["omar", "the 2 guys by the window"]],
      [["priya", "the quiz average was 7.8 last week, what happened"], ["ilyas", "we had that one with the integrals i think"], ["priya", "I got 9, I'm just saying"], ["omar", "that was a flex wasnt it"]],
      [["chloe", "reminder the thursday lecture moved to the other building"], ["aisha", "what, not the usual room?"], ["chloe", "sorry, it moved, check moodle"], ["leo", "you're a hero"]],
      [["ilyas", "does anyone get the proof for the cauchy sequence thing"], ["priya", "do you want the long way or the nice way"], ["ilyas", "the nice way"], ["priya", "I'll write it up in the doc"], ["ilyas", "legend"]],
      [["leo", "does someone have the lecture 6 notes, I was ill"], ["aisha", "ill ill or hungover ill"], ["leo", "medium ill"], ["aisha", "fair, I'll send them"]],
      [["omar", "who's going to the careers fair next week"], ["chloe", "me, I want the free tote bags"], ["omar", "valid reason"]],
      [["priya", "I am so behind on revision, dont let me stop"], ["ilyas", "exams are in 10 weeks"], ["priya", "10 weeks is nothing"], ["aisha", "you've already done more than all of us"]],
      [["chloe", "the coffee in the south ken cafe is 4 quid now"], ["omar", "highway robbery"], ["chloe", "I'm bringing a flask"], ["aisha", "I'll join the flask club"]],
      [["leo", "has anyone seen the econometrics slides"], ["priya", "moodle, week 5 folder"], ["leo", "it's empty"], ["priya", "its the week 6 slides, you're clicking the wrong week"]],
      [["aisha", "who knows why my regression says everything is significant"], ["omar", "because you put the dependent variable in as a regressor"], ["aisha", "oh no"], ["omar", "it happens to the best of us"], ["chloe", "it happens to me weekly"]],
      [["ilyas", "whats the plan for friday night"], ["omar", "spring week prep, sorry"], ["chloe", "I can do pizza after 8"], ["aisha", "count me in"]],
      [["priya", "library 4th floor is quiet, 3rd is a zoo"], ["omar", "on my way"], ["leo", "where's the 4th floor"], ["priya", "above the 3rd"]],
      [["chloe", "my laptop died mid quiz, I am crying"], ["ilyas", "did it save"], ["chloe", "I got 6 out of 10 and I want to cry"], ["aisha", "its one quiz, its like 3 percent"]],
      [["omar", "anyone free for a mock interview thursday evening"], ["priya", "I can do it at 6"], ["omar", "you're on. dont be nice to me"], ["priya", "I'm never nice in interviews"]],
      [["leo", "how many hours did everyone spend on the sheet"], ["priya", "about 4"], ["ilyas", "about 5"], ["aisha", "probably 6 with the chat"], ["leo", "I did 2. is that bad"], ["chloe", "you'll find out when the marks come back"]],
      [["aisha", "they've changed the tutorial room again"], ["ilyas", "I can never keep up"], ["aisha", "its in the maths building, room 340"], ["ilyas", "got it thanks"]],
      [["priya", "cake in the common room, someone's birthday"], ["omar", "I'll be there in 2"], ["chloe", "I'm already on the stairs"]],
      [["omar", "I'm 600 coins up on the study group leaderboard"], ["leo", "because you bet on yourself every week"], ["omar", "and I win every week"], ["aisha", "lucky streak"]],
      [["chloe", "hold on is priya really top of the leaderboard"], ["priya", "I dont bet on weak ones"], ["ilyas", "she only bets when she knows the answer"], ["priya", "it's called being right"]],
      [["leo", "my coins are almost gone"], ["omar", "you bet on yourself to finish the sheet early"], ["leo", "it was a good bet at the time"]],
      [["aisha", "I'm going to stake a big chunk of my coins on myself for the next quiz, 8 or more"], ["chloe", "that's bold"], ["aisha", "I'm feeling confident"]],
      [["ilyas", "tutor said the january paper will include a bit of measure theory"], ["priya", "that's not on the syllabus"], ["ilyas", "he said lightly touched"], ["omar", "what does that mean"], ["priya", "it means 20 marks"]],
      [["leo", "can someone explain lagrange multipliers in 1 sentence"], ["priya", "you're maximising something subject to a constraint and the multiplier is the shadow price"], ["leo", "that was 1 sentence, thank you"], ["ilyas", "it was a long sentence"]],
      [["chloe", "anyone else's brain just stop at 3pm"], ["aisha", "I'm eating my third biscuit"], ["omar", "go outside for 10 mins, walk round the park"], ["chloe", "too cold"]],
      [["omar", "just had a cheese toastie in the dining hall for £5"], ["ilyas", "didnt know that was legal"]],
      [["priya", "january exam timetable is out"], ["omar", "oh no, when"], ["priya", "analysis on the 5th, 9:30"], ["ilyas", "the first day, great"], ["aisha", "at least we get it over with"], ["chloe", "I'm going to be sick"]],
      [["leo", "what time is the lecture again"], ["aisha", "10"], ["leo", "I thought it was 9"], ["aisha", "it is 10"], ["leo", "I'm already in the building"], ["omar", "go get a coffee then"]],
    ],
    templates: [
      {
        title: "{s} scores 9 or 10 on the Thursday quiz",
        subject: "priya",
        p: 0.82,
        hours: 60,
        perWeek: 1.0,
        before: [
          [["omar", "quiz thursday, is priya going to get full marks again"], ["$s", "there's no such thing as full marks, only fewer mistakes"], ["chloe", "that's what people with full marks say"]],
          [["aisha", "quiz this week is on the series chapter"], ["$s", "I did 20 practice questions last night"], ["leo", "why is she like this"]],
          [["ilyas", "honestly priya never drops below 8"], ["$s", "I dropped to 7 once. in week 2"], ["omar", "we remember"]],
        ],
        yes: [
          [["$s", "10 out of 10"], ["omar", "sit down, nobody asked"], ["$s", "you did"]],
          [["$s", "9. one silly sign error"], ["chloe", "I got 5 and a headache"]],
          [["$s", "got 9, the high score for the room apparently"], ["ilyas", "the standard"]],
        ],
        no: [
          [["$s", "7. I misread question 4"], ["omar", "I literally want to frame this"], ["$s", "it was a typo in the question I'm convinced"]],
          [["$s", "8 only, what a disaster"], ["chloe", "I'd cry with joy for an 8"], ["$s", "exactly, it's tragic"]],
          [["$s", "quiz was brutal, got 6"], ["aisha", "she's human after all"]],
        ],
      },
      {
        title: "{s} asks someone for the answers to the problem sheet",
        subject: "leo",
        p: 0.9,
        hours: 70,
        perWeek: 0.9,
        before: [
          [["priya", "sheet is due tuesday, I'm betting leo messages me by monday night asking for answers"], ["$s", "I might not need to"], ["omar", "you've asked every week"]],
          [["chloe", "leo's gone quiet which means he'll ask for the answers at 4:59"], ["$s", "I'm working on it. independently. like an adult"]],
          [["aisha", "ok so the sheet is hard"], ["ilyas", "leo will message the second he sees question 5"], ["$s", "I'm not that predictable"]],
        ],
        yes: [
          [["$s", "quick one, anyone got 3b? just the final answer"], ["priya", "here we go"], ["omar", "I have the number but I'm not sending it"]],
          [["$s", "what did you all get for question 5"], ["aisha", "called it"], ["chloe", "pay up"]],
          [["$s", "dont judge but I'm stuck on 4"], ["ilyas", "I'll give you a hint, not the answer"], ["$s", "a hint is fine. a number would be better"]],
        ],
        no: [
          [["$s", "finished it by myself, you can all look away now"], ["priya", "I'm a bit proud actually"], ["omar", "I need to see the working"]],
          [["$s", "did the whole sheet without asking anyone"], ["chloe", "who is this and what have you done with leo"]],
          [["$s", "no help needed this time, did it in the library"], ["aisha", "growth"]],
        ],
      },
      {
        title: "{s} submits the problem sheet in the last hour before the deadline",
        subject: "chloe",
        p: 0.65,
        hours: 50,
        perWeek: 0.7,
        before: [
          [["omar", "chloe will submit at 4:58 again"], ["$s", "I'll be early this week"], ["priya", "she says that every week"]],
          [["aisha", "deadline is 5pm, it's 3"], ["$s", "still doing question 6, relax"], ["ilyas", "we're relaxed. its you who isnt"]],
          [["leo", "who's submitting early this week"], ["$s", "I will, I've got a plan"], ["priya", "what's the plan"]],
        ],
        yes: [
          [["$s", "submitted. 4:51. my heart is in my throat"], ["omar", "pay up"]],
          [["$s", "just uploaded, 4:59 with two seconds to spare"], ["aisha", "same story every week"]],
          [["$s", "done. it was 4:42, I was cutting it fine"], ["priya", "as predicted"]],
        ],
        no: [
          [["$s", "I submitted at 1pm and I feel great"], ["omar", "I'm not ready to process this"]],
          [["$s", "sheet's in, done last night. dont talk to me"], ["priya", "I'm very impressed"]],
          [["$s", "handed in, midday. see you at the cafe"], ["aisha", "who are you"]],
        ],
      },
      {
        title: "{s} skips tomorrow's lecture to prep for interviews",
        subject: "omar",
        p: 0.35,
        hours: 30,
        perWeek: 0.6,
        before: [
          [["chloe", "omar's got that hirevue thing this week right"], ["$s", "tomorrow afternoon and I'm not ready"], ["priya", "are you skipping the lecture to prep?"]],
          [["aisha", "omar's missed two lectures already this month"], ["$s", "they're recorded"], ["ilyas", "that's what everyone says"]],
          [["ilyas", "are you coming to the stats lecture tomorrow"], ["$s", "I've got a mock interview at 10, so maybe not"]],
        ],
        yes: [
          [["$s", "skipped. watched it on 1.5x later"], ["priya", "you wont remember it"], ["$s", "I will remember the part about the interview"]],
          [["$s", "gave the lecture a miss, practice round went on until 11"], ["ilyas", "I saved you a handout"]],
          [["$s", "I'll watch the recording, promise"], ["aisha", "you said that last week"]],
        ],
        no: [
          [["$s", "I went. sat at the front, did the interview prep on the train"], ["chloe", "very organised"]],
          [["$s", "made it in, took notes, did the practice questions at lunch"], ["priya", "nice balance"]],
          [["$s", "lecture first, then hirevue. discipline"], ["leo", "you're better than me"]],
        ],
      },
      {
        title: "{s} gets 70 or more on the econometrics assignment",
        subject: "aisha",
        p: 0.6,
        hours: 150,
        perWeek: 0.4,
        before: [
          [["priya", "econometrics assignment back on friday"], ["$s", "fingers crossed, I put hours into the writeup"], ["omar", "you spent a whole weekend on the graphs"]],
          [["chloe", "aisha are you nervous about the assignment mark"], ["$s", "very. I made a few assumptions I wasn't sure about"], ["ilyas", "they're fine"]],
          [["leo", "I think the pass mark is 40 and a first is 70"], ["$s", "and I'm aiming for the 70"]],
        ],
        yes: [
          [["$s", "74! I'm so happy"], ["priya", "well done"], ["omar", "I got 62, I'm happy for you"]],
          [["$s", "got 71 and a comment saying good writeup"], ["chloe", "amazing"]],
          [["$s", "72, the feedback said clean interpretation"], ["ilyas", "love to see it"]],
        ],
        no: [
          [["$s", "65. he said my standard errors need a robustness check"], ["priya", "that's still a 2:1"], ["$s", "I wanted the 70"]],
          [["$s", "I got 58 and I'm not okay"], ["chloe", "let's get food"]],
          [["$s", "68. two marks. two"], ["omar", "so close"]],
        ],
      },
      {
        title: "The lecturer overruns by more than 10 minutes",
        subject: null,
        p: 0.5,
        hours: 40,
        perWeek: 0.5,
        before: [
          [["$a", "last lecture ran 12 mins over"], ["$b", "does he not look at the clock"], ["$a", "he looks at it, he just doesn't care"]],
          [["$a", "tomorrow's lecture is on measure theory"], ["$b", "that's an overrun for sure"]],
          [["$a", "do we think he'll finish on time today"], ["$b", "no"]],
        ],
        yes: [
          [["$a", "he overran again, it was 11 past when we left"], ["$b", "missed my lunch deal"]],
          [["$a", "ran 15 over. that's a whole sandwich of time"], ["$b", "I couldn't even hear him by the end, my stomach was louder"]],
          [["$a", "well that was a marathon"], ["$b", "I'm so hungry"]],
        ],
        no: [
          [["$a", "finished at 10:50, ten minutes early. I dont know what to do with myself"], ["$b", "it's a miracle"]],
          [["$a", "bang on time today"], ["$b", "suspicious"]],
          [["$a", "lecture ended early for once, free pastry time"], ["$b", "I'm in"]],
        ],
      },
      {
        title: "{s} finishes the problem sheet before the weekend",
        subject: "ilyas",
        p: 0.55,
        hours: 90,
        perWeek: 0.8,
        before: [
          [["priya", "ilyas always says he'll finish before the weekend and then it's Sunday night"], ["$s", "this week I'm doing it Friday"], ["omar", "let's see"]],
          [["aisha", "sheet's hard this week"], ["$s", "I'll have it done by Friday, I swear"], ["leo", "I'd like that in writing"]],
          [["chloe", "who's getting the sheet done before the weekend"], ["$s", "me, I have plans on Saturday"]],
        ],
        yes: [
          [["$s", "sheet done. Friday 6pm. I'm free"], ["priya", "impressive"]],
          [["$s", "finished it Thursday night, just the last proof"], ["omar", "okay show off"]],
          [["$s", "done. Saturday morning is mine"], ["leo", "he actually did it"]],
        ],
        no: [
          [["$s", "still on question 6. its Sunday, in my defence the proof was horrible"], ["priya", "I did say"]],
          [["$s", "not done, got distracted on Saturday"], ["omar", "what a surprise"]],
          [["$s", "half done. I'll finish it Monday morning"], ["chloe", "classic"]],
        ],
      },
    ],
    stocks: [
      { by: "chloe", title: "Chloe gets through the whole summer reading list before term starts", subject: "chloe", openDaysAgo: 85, resolveDaysFromNow: -20, p0: 0.4, drift: -0.25, outcome: false },
      { by: "aisha", title: "Priya graduates with a First", subject: "priya", openDaysAgo: 80, resolveDaysFromNow: 600, p0: 0.65, drift: 0.1 },
      { by: "chloe", title: "Leo passes every January exam first time", subject: "leo", openDaysAgo: 25, resolveDaysFromNow: 100, p0: 0.55, drift: -0.1 },
      { by: "priya", title: "Ilyas gets a first in the January exams", subject: "ilyas", openDaysAgo: 20, resolveDaysFromNow: 110, p0: 0.4, drift: 0.05 },
    ],
    liveBets: [
      { by: "priya", title: "Leo asks for the answers before Tuesday's deadline", subject: "leo", hoursLeft: 60 },
      { by: "omar", title: "Priya scores 9 or 10 on Thursday's quiz", subject: "priya", hoursLeft: 96 },
      { by: "aisha", title: "The lecturer overruns by more than 10 minutes on Monday", subject: null, hoursLeft: 40 },
    ],
    recent: [
      ["leo", "does anyone have the sheet for tuesday"],
      ["priya", "you have the sheet. everyone has the sheet"],
      ["leo", "I mean the answers"],
      ["omar", "called it"],
      ["chloe", "nobody send him anything"],
      ["leo", "I'm being used for betting purposes"],
    ],
  },

  // ---------------------------------------------------------------------------------------------
  // 3. SUNDAY LEAGUE
  // ---------------------------------------------------------------------------------------------
  {
    name: "Sunday League",
    members: ["jake", "ilyas", "sam", "dan", "tom", "omar"],
    aiContext:
      "Five-a-side every Sunday at 11am on the pitches in Hyde Park, warm up from 10:45. Arsenal v Spurs is on Sunday 1 November 2026 at 4:30pm; Omar and Jake are Arsenal fans, Tom is Spurs. The game is informal, teams are picked on the pitch, and Dan is known for his tackles.",
    activity: 1.0,
    snippets: [
      [["tom", "are we on this sunday?"], ["dan", "pitch is booked 11"], ["jake", "can we do 11:30"], ["tom", "no"], ["jake", "ok but im going to be a bit late"], ["tom", "you're always a bit late"]],
      [["sam", "just got my boots out, one of them smells like a crime scene"], ["omar", "the left or the right"], ["sam", "both. theyve been in a bag since march"]],
      [["dan", "who's got the bibs"], ["ilyas", "tom does"], ["tom", "I thought omar had them"], ["omar", "I have never had the bibs"], ["dan", "brilliant, so we play in different shades of blue and hope for the best"]],
      [["omar", "arsenal spurs on the 1st, who's coming round to watch"], ["jake", "I'll be at yours at 4"], ["sam", "I'll watch as a neutral, I just want chaos"], ["tom", "I'm watching it in the pub, I cant take the gloating"]],
      [["dan", "did anyone see my tackle on sunday"], ["jake", "the one on tom"], ["tom", "I'm still limping"], ["dan", "I got the ball"], ["tom", "you got the ball after you got me"]],
      [["ilyas", "what's the weather looking like for sunday"], ["sam", "rain from 9 till 1"], ["ilyas", "so we're playing in it"], ["sam", "as always"]],
      [["tom", "someone needs to bring water, it's been a month"], ["omar", "I brought it last time"], ["tom", "it was a lucozade"], ["omar", "it was a hydration solution"]],
      [["jake", "just scored 3 on fifa, who wants to see"], ["dan", "not the same as scoring on the pitch"], ["jake", "give me time"]],
      [["sam", "can we play 6-a-side next week, there's 9 of us"], ["dan", "pitch fits 5"], ["sam", "tell that to the fella who walked on last week"]],
      [["ilyas", "who's got the car for the pitch, my bag is massive"], ["omar", "I can take 2"], ["ilyas", "I'll walk then, 20 mins"], ["tom", "I'll take the bag"]],
      [["tom", "need a new pair of shin pads, my old ones snapped"], ["jake", "sports direct"], ["tom", "I'll go on saturday"], ["dan", "buy a pair for me, I've borrowed yours twice"]],
      [["omar", "did we pay for the pitch this week"], ["dan", "yeah I put it on my card"], ["omar", "I'll send you my share"], ["jake", "same, I'll do it sunday"], ["dan", "you said that last month"]],
      [["sam", "I think I pulled something"], ["ilyas", "what did you pull"], ["sam", "a muscle I didnt know existed"], ["tom", "it's your own fault"], ["sam", "I know"]],
      [["omar", "who's got the better away kit, arsenal or spurs"], ["tom", "spurs, obviously"], ["omar", "I'll block you"], ["dan", "you cant block people from the football group"]],
      [["jake", "anyone got a spare shirt, I forgot mine"], ["ilyas", "I've got a green one"], ["jake", "that works"], ["ilyas", "I want it back this time"]],
      [["dan", "pre game meal is a full english, change my mind"], ["sam", "bacon sandwich only"], ["tom", "I just have a banana"], ["omar", "a banana isn't a meal"]],
      [["ilyas", "think I'm going to play in goal this week"], ["tom", "you're the fastest on the pitch"], ["ilyas", "that's why I'm tired of running"]],
      [["tom", "spurs conceded in the 90th again, I'm done"], ["omar", "you've said that since 2019"], ["tom", "the difference is I mean it this time"]],
      [["sam", "anyone fancy a pint and a roast after"], ["dan", "it's 12 on a sunday sam"], ["sam", "a perfectly reasonable time"], ["jake", "I'm in"]],
      [["omar", "just had a dream I scored a hat trick"], ["ilyas", "did you try and go back to sleep to keep it going"], ["omar", "I'm not that sad"]],
      [["jake", "our team is better than the lot on the next pitch"], ["dan", "they have a real referee"], ["jake", "they also have worse shirts"]],
      [["tom", "how many are we on sunday?"], ["ilyas", "6"], ["tom", "so 3 v 3"], ["ilyas", "with a keeper each"], ["tom", "that's 4 v 4"], ["sam", "that's maths done wrong"]],
      [["dan", "150 coins on jake being late sunday"], ["tom", "that's the safest bet in the app"], ["dan", "the price is terrible though, it's already at 90"]],
      [["omar", "who's on top of the sunday league leaderboard"], ["ilyas", "me"], ["omar", "how"], ["ilyas", "I only bet on dan's tackles"], ["dan", "what does that mean"], ["ilyas", "I mean there's always a foul"]],
      [["omar", "bet idea: spurs fail to score in the derby"], ["tom", "I'm not even touching that, I'll end up with no coins"], ["omar", "coward"]],
      [["jake", "I'm down to 40 coins"], ["ilyas", "you put 500 on yourself being on time"], ["jake", "it felt right at the time"], ["dan", "it never feels right"]],
      [["omar", "anyone watching the champions league tuesday"], ["sam", "we'll go to the pub near south ken"], ["omar", "count me in"], ["jake", "I'll be there at kickoff"], ["tom", "he means half time"]],
      [["tom", "car park charges at hyde park are insane"], ["ilyas", "just walk"], ["tom", "I've come all the way from wembley"], ["ilyas", "then you're not walking"]],
      [["sam", "I'm injured but I'll come and watch"], ["dan", "that's not how it works"], ["sam", "I'll be mentally present"]],
      [["jake", "anyone want to start a group fantasy league"], ["ilyas", "we have one"], ["jake", "a new one then, I want to be winning something"]],
    ],
    templates: [
      {
        title: "{s} is late to Sunday football",
        subject: "jake",
        p: 0.75,
        hours: 70,
        perWeek: 1.0,
        before: [
          [["tom", "11am sharp on sunday, no excuses"], ["$s", "I'll be there at 10:45 for the warm up"], ["dan", "I'll believe it when I see you"]],
          [["ilyas", "starting a market on jake and kick-off"], ["$s", "you lot are unbelievable"]],
          [["omar", "jake's going to roll up at 11:20 with a coffee"], ["$s", "the place by the park takes ages, that's not my fault"]],
        ],
        yes: [
          [["dan", "11:25, jake. we've already played 12 minutes"], ["$s", "traffic. a bus broke down"], ["tom", "you live 9 mins away"]],
          [["$s", "sorry sorry I overslept"], ["sam", "that's your excuse every week, get a new one"]],
          [["$s", "I'm here, I'm here. where's my bib"], ["omar", "you've missed the warm up and the first goal"]],
        ],
        no: [
          [["$s", "10:50. who's laughing now"], ["sam", "I'm stunned"], ["dan", "did he sleep in his kit"]],
          [["tom", "jake is actually on time. should I check for a catch"], ["$s", "no catch. I had an early night"]],
          [["$s", "early. I've done a lap of the pitch. you're welcome"], ["omar", "fine you win this one"]],
        ],
      },
      {
        title: "{s} scores in Sunday's five-a-side",
        subject: "omar",
        p: 0.7,
        hours: 60,
        perWeek: 0.9,
        before: [
          [["jake", "omar always has a good game when he's not hungover"], ["$s", "I had a quiet night, I'm ready"], ["dan", "good luck"]],
          [["tom", "omar's on form, he's been scoring every week"], ["$s", "it's the new boots"], ["sam", "it's not the boots"]],
          [["ilyas", "omar for the first goal?"], ["$s", "I'll play striker, someone feed me"]],
        ],
        yes: [
          [["$s", "two. TWO. bottom corner and a tap in"], ["dan", "he wont shut up now"]],
          [["$s", "scored in the last minute, we won 6-5"], ["tom", "what a chaotic game"]],
          [["$s", "a bit of magic, a back heel"], ["ilyas", "it hit his shin and went in"], ["$s", "a bit of magic"]],
        ],
        no: [
          [["$s", "hit the post three times and put a tap in over the bar, I dont want to talk about it"], ["jake", "that's very sad"]],
          [["$s", "no goals but I got 4 assists"], ["sam", "assists dont count"]],
          [["$s", "their goalie was on fire"], ["dan", "your shots were at his chest"]],
        ],
      },
      {
        title: "{s} takes someone out with a rash tackle",
        subject: "dan",
        p: 0.65,
        hours: 60,
        perWeek: 0.8,
        before: [
          [["tom", "dan is on the other team this week, I'm scared"], ["$s", "I only tackle the ball"], ["jake", "and the legs of whoever's holding it"]],
          [["ilyas", "we need a rule, no tackling dan"], ["$s", "I go for the ball"], ["sam", "you go for everything"]],
          [["omar", "last week dan sent sam flying"], ["$s", "he was running into me"], ["sam", "I was standing still"]],
        ],
        yes: [
          [["$s", "sorry mate, I got the ball"], ["tom", "you got the ball and then you got me"]],
          [["jake", "dan slid in from about 4 yards away"], ["$s", "it was a good tackle"], ["ilyas", "it was a very loud tackle"]],
          [["sam", "I'm limping but I'll live. dan, next time shout before"], ["$s", "I did shout, it was you who didn't move"]],
        ],
        no: [
          [["$s", "clean game, I'm proud of myself"], ["tom", "I'm surprised"]],
          [["$s", "zero fouls this week, an improvement"], ["jake", "he's changed"], ["sam", "he was in goal, that's why"]],
          [["omar", "dan kept it tidy today"], ["$s", "I'm learning"]],
        ],
      },
      {
        title: "{s} pulls out of Sunday football with an injury",
        subject: "sam",
        p: 0.3,
        hours: 80,
        perWeek: 0.5,
        before: [
          [["$s", "knee's a bit sore after last week"], ["dan", "are you playing sunday?"], ["$s", "probably, I'll see how it feels"]],
          [["tom", "sam says his hamstring's dodgy again"], ["$s", "it's tight, not dodgy"], ["ilyas", "tight is dodgy with extra steps"]],
          [["omar", "sam plays best when he's a bit injured"], ["$s", "I havent said I'm injured"]],
        ],
        yes: [
          [["$s", "I can't come, hamstring has gone. I'll watch from the side"], ["tom", "get well"], ["dan", "we need a sub"]],
          [["$s", "sorry lads, ankle's the size of a grapefruit"], ["jake", "I'll be there instead"]],
          [["$s", "out for sunday. physio said rest"], ["omar", "you dont have a physio"], ["$s", "a youtube physio"]],
        ],
        no: [
          [["$s", "I'm fine, just stretched it out. I'll be there"], ["dan", "good"]],
          [["$s", "played the full game, no pain"], ["tom", "I'd call that a miracle"]],
          [["$s", "knee is better, I'm back"], ["omar", "great, we need someone to run"]],
        ],
      },
      {
        title: "{s} brings the bibs on Sunday",
        subject: "tom",
        p: 0.35,
        hours: 70,
        perWeek: 0.6,
        before: [
          [["dan", "tom's got the bibs this week"], ["$s", "I dont remember agreeing to that"], ["dan", "it's in the minutes"]],
          [["jake", "can tom bring the bibs this time"], ["$s", "where are they"], ["ilyas", "in the boot of your car"]],
          [["omar", "bibs on sunday, who's got them"], ["$s", "not me, I'm bringing the water"], ["omar", "and the bibs"]],
        ],
        yes: [
          [["$s", "bibs in the bag. clean and everything"], ["sam", "did you wash them"], ["$s", "dont ask questions"]],
          [["$s", "got them, they're a bit orange now"], ["dan", "still bibs"]],
          [["$s", "I've brought the bibs AND a spare ball"], ["jake", "a hero"]],
        ],
        no: [
          [["$s", "left them in my other bag, sorry"], ["dan", "so we're playing in colours again"]],
          [["$s", "forgot the bibs. shirts v tops"], ["ilyas", "I'm playing in the green one"]],
          [["$s", "bibs are in the wash, by which I mean they're in the shed"], ["omar", "unusable"]],
        ],
      },
      {
        title: "It rains during Sunday's game",
        subject: null,
        p: 0.55,
        hours: 50,
        perWeek: 0.8,
        before: [
          [["$a", "forecast says rain from 10 till 2"], ["$b", "we still play"], ["$a", "of course we play, I just want my boots to suffer"]],
          [["$a", "cold and grey out there"], ["$b", "at least it's dry"], ["$a", "the app says 70 percent rain"]],
          [["$a", "I'm bringing a rain jacket"], ["$b", "it'll drip down your arms"]],
        ],
        yes: [
          [["$a", "pouring since half time"], ["$b", "the pitch is a swamp"], ["$a", "never been so cold"]],
          [["$a", "ten minutes of heavy rain and the whole game turned into water polo"], ["$b", "I'm soaked"]],
          [["$a", "drizzle most of the game, sometimes real rain"], ["$b", "I'm fine with drizzle"]],
        ],
        no: [
          [["$a", "dry the whole way through, I can't believe it"], ["$b", "I wore my waterproof for nothing"]],
          [["$a", "not a drop. bright sunshine"], ["$b", "never trust the forecast"]],
          [["$a", "cold but dry, I'll take it"], ["$b", "at least the ball bounces"]],
        ],
      },
      {
        title: "Sunday's game kicks off before 11:15",
        subject: null,
        p: 0.5,
        hours: 40,
        perWeek: 0.7,
        before: [
          [["$a", "who's got the pitch key"], ["$b", "it's open already I think"], ["$a", "fine"]],
          [["$a", "we need ten by quarter past or we play 4 v 4"], ["$b", "let me count"]],
          [["$a", "11am start but I don't see anyone"], ["$b", "I'm parking now"]],
        ],
        yes: [
          [["$a", "kicked off at 11:05, everyone showed"], ["$b", "miracle"]],
          [["$a", "we started at 11:10, the fastest all season"], ["$b", "stop talking or you'll jinx it"]],
          [["$a", "full game, kick off at 11:02"], ["$b", "someone report this"]],
        ],
        no: [
          [["$a", "it was 11:40 when we started"], ["$b", "by then I'd lost the will"]],
          [["$a", "didn't start until 11:30, we only had 3 people"], ["$b", "the last one rolled in at half past"]],
          [["$a", "started at noon, someone had the wrong pitch"], ["$b", "we lost the booking"]],
        ],
      },
      {
        title: "{s} keeps a clean sheet in goal",
        subject: "ilyas",
        p: 0.35,
        hours: 50,
        perWeek: 0.4,
        before: [
          [["dan", "ilyas in goal this week, apparently"], ["$s", "I said I'd have a go"], ["tom", "we'll lose 10-0"]],
          [["omar", "ilyas keeps saying he has good reflexes"], ["$s", "I used to play in goal at school"], ["sam", "that was seven years ago"]],
          [["jake", "tom and omar upfront against ilyas, he's got no chance"], ["$s", "I'll do my best"]],
        ],
        yes: [
          [["$s", "clean sheet. I'm basically the best keeper in west london"], ["dan", "you saved one"], ["$s", "I saved one"]],
          [["$s", "0-0, and I kept it that way. a dive and a fingertip save"], ["tom", "okay that was good"]],
          [["$s", "a clean sheet. someone tell my mum"], ["sam", "unbelievable"]],
        ],
        no: [
          [["$s", "conceded 5, 3 of them were deflections"], ["omar", "they were not deflections"]],
          [["$s", "let in 4, none of them were my fault"], ["dan", "all of them were your fault"]],
          [["$s", "went the wrong way for every penalty"], ["tom", "there was a penalty??"], ["$s", "we're not talking about it"]],
        ],
      },
    ],
    stocks: [
      { by: "tom", title: "Jake is on time for Sunday football four weeks in a row", subject: "jake", openDaysAgo: 45, resolveDaysFromNow: -10, p0: 0.3, drift: -0.2, outcome: false },
      { by: "sam", title: "Dan goes a whole month without taking anyone out", subject: "dan", openDaysAgo: 52, resolveDaysFromNow: -22, p0: 0.35, drift: -0.2, outcome: false },
      { by: "omar", title: "Arsenal beat Spurs on 1 November", subject: null, openDaysAgo: 6, resolveDaysFromNow: 8, p0: 0.5, drift: 0.1 },
      { by: "dan", title: "The Sunday league finally buys proper bibs before Christmas", subject: null, openDaysAgo: 30, resolveDaysFromNow: 62, p0: 0.35, drift: 0.1 },
    ],
    liveBets: [
      { by: "tom", title: "Jake is on time for 11am football tomorrow", subject: "jake", hoursLeft: 24 },
      { by: "dan", title: "It rains during tomorrow's game", subject: null, hoursLeft: 26 },
      { by: "jake", title: "Omar scores in tomorrow's five-a-side", subject: "omar", hoursLeft: 26 },
    ],
    recent: [
      ["tom", "right lads 11am tomorrow, dont be late"],
      ["jake", "I'll be there"],
      ["dan", "jake's just posted a market on himself"],
      ["jake", "I'm confident"],
      ["sam", "he's not in any way confident"],
      ["ilyas", "I took the other side"],
    ],
  },

  // ---------------------------------------------------------------------------------------------
  // 4. SPRING WEEK GRIND
  // ---------------------------------------------------------------------------------------------
  {
    name: "Spring Week Grind",
    members: ["omar", "ilyas", "zara", "chloe"],
    aiContext:
      "Four students applying for spring weeks and internships at banks. Applications close at the end of January and many banks reply on a rolling basis. HireVues and online tests come first, then assessment centres. Mock interviews run through the careers service, and the group does practice sessions on Wednesdays at 4pm.",
    activity: 1.0,
    snippets: [
      [["omar", "JPMorgan sent the hirevue link, 3 questions, 30 seconds prep"], ["zara", "I got the same, deadline is Friday"], ["ilyas", "I'm doing mine at 7am so I dont overthink"], ["chloe", "you're so unwell"]],
      [["zara", "does anyone have a good answer for why this bank"], ["omar", "every bank wants the same answer in different words"], ["zara", "that's not helpful"], ["omar", "but it's true"]],
      [["chloe", "I just did the numerical test and got 14 out of 20"], ["omar", "what's the pass mark"], ["chloe", "nobody tells you"], ["ilyas", "I'd say 15, dont think about it"]],
      [["ilyas", "has anyone heard back from Lazard"], ["zara", "not yet, they say within 4 weeks"], ["omar", "it's been 5"], ["chloe", "I'm refreshing my email every 5 mins"]],
      [["omar", "tell me about a time you led a team"], ["zara", "I led the group project on econ"], ["omar", "what did you do"], ["zara", "I made a spreadsheet and told people to fill it in"], ["omar", "use that. but say 'drove alignment'"], ["zara", "yuck, but ok"]],
      [["chloe", "what are you all wearing for the assessment centre"], ["ilyas", "suit, navy"], ["zara", "blazer and trousers"], ["omar", "same as ilyas. we'll look like twins"]],
      [["ilyas", "I wrote my application at 2am and submitted"], ["chloe", "did you proofread"], ["ilyas", "I read it twice"], ["chloe", "did you read the part where you said 'Barclays' in the UBS application"], ["ilyas", "no. oh no."]],
      [["zara", "UBS sent a 'we'd like to learn more about you' email, is that good"], ["omar", "it's an automated invite to the next stage"], ["zara", "oh my god"], ["omar", "that's good"]],
      [["omar", "what are we doing about networking, I've messaged 10 people on linkedin"], ["chloe", "how many replied"], ["omar", "two"], ["chloe", "that's 20 percent"], ["omar", "that's what I told myself"]],
      [["ilyas", "mock interview at 5 with the careers service, who's in"], ["chloe", "I'm at 6"], ["zara", "I'm doing mine tomorrow"]],
      [["zara", "why do they ask what's your biggest weakness every time"], ["omar", "say perfectionism"], ["zara", "everyone says perfectionism"], ["ilyas", "say you overcommit to group projects"], ["zara", "that's true actually"]],
      [["chloe", "just spent 3 hours on one cover letter"], ["omar", "do they even read them"], ["chloe", "not sure but I'd feel bad if I didn't write one"]],
      [["omar", "goldman spring week opens soon, set an alarm"], ["ilyas", "it's rolling so apply early"], ["zara", "I applied last night"], ["chloe", "I'm editing mine, tomorrow"]],
      [["ilyas", "anyone know what a dcf is in simple terms"], ["omar", "you forecast the cash a company will make and discount it back to today"], ["ilyas", "and discount it because?"], ["omar", "money tomorrow is worth less than money today"], ["ilyas", "got it, thanks"]],
      [["zara", "got a rejection from barclays, a template one with no feedback"], ["chloe", "I'm sorry, it's brutal"], ["omar", "one down, loads left. it's a numbers game"], ["ilyas", "drinks tonight?"]],
      [["chloe", "what's a good answer to 'what's going on in the markets'"], ["omar", "read the ft summary every morning for a week"], ["ilyas", "I read the morning briefing from the bank's own site"], ["chloe", "I'll do that"]],
      [["omar", "every interview asks about the bank of england now"], ["ilyas", "just say rates and inflation and that you're following it"], ["zara", "'following it closely'"], ["chloe", "I follow it from a distance"]],
      [["ilyas", "spent the whole day on the CV, moved a bullet point three times"], ["omar", "it's like the tiniest change"], ["ilyas", "it matters though"]],
      [["zara", "hirevue camera angle: do I look at the camera or the screen"], ["omar", "camera"], ["zara", "that feels so weird"], ["chloe", "practise with a post-it next to the lens"]],
      [["chloe", "anyone doing the job fair on thursday"], ["omar", "yes, I've got 3 questions ready"], ["ilyas", "I'll mostly stand near the stalls with free stuff"], ["omar", "there's a strategy in that"]],
      [["omar", "I'm putting 500 coins on myself getting an assessment centre invite"], ["chloe", "that's a lot of faith"], ["omar", "I'm backing myself"]],
      [["ilyas", "made a bet on whether lazard emails us by friday"], ["zara", "stake 200 coins on no"], ["chloe", "you're so pessimistic"], ["zara", "I'm realistic"]],
      [["chloe", "omar is top of the leaderboard but I'd say it's because he reads everything"], ["omar", "I read the bank pages and I read the room"], ["ilyas", "he reads the room, that's his edge"]],
      [["zara", "who has the most coins in this chat"], ["omar", "me"], ["zara", "how is that fair, you're on a streak"], ["omar", "it's skill"], ["ilyas", "it's luck"]],
      [["omar", "I got an assessment centre invite from lazard"], ["zara", "amazing!! when"], ["omar", "18th of next month"], ["chloe", "we're so proud"], ["ilyas", "can I come as your plus one"]],
      [["chloe", "we should all do a practice group exercise, they always have those at ACs"], ["ilyas", "I hate those"], ["zara", "everyone hates those"], ["omar", "so we should practise"]],
      [["zara", "if I get asked for a stock pitch what do I say"], ["omar", "pick something you actually use. a sportswear brand or a coffee chain"], ["zara", "can I pitch tesco"], ["omar", "if you can say why. yes"]],
      [["ilyas", "that's the 40th application form I've seen this week with the same questions"], ["chloe", "copy paste your answers then"], ["ilyas", "they can tell"], ["chloe", "they cannot tell"]],
      [["omar", "wednesday 4pm, library 3rd floor, group interview practice. everyone has to come"], ["zara", "I'm in"], ["chloe", "I'll bring snacks"], ["ilyas", "I'll bring the questions"]],
      [["zara", "I need to sleep, I did 5 hours of UBS numerical and my brain is mush"], ["omar", "go to bed"], ["chloe", "go to bed, you've done enough"]],
    ],
    templates: [
      {
        title: "{s} gets through the HireVue stage",
        subject: "omar",
        p: 0.75,
        hours: 120,
        perWeek: 0.7,
        before: [
          [["ilyas", "hirevue results come in a week apparently"], ["$s", "I stared at the timer instead of the camera for question 2"], ["chloe", "they dont count the ums"]],
          [["zara", "omar did his hirevue and thinks he blew it"], ["$s", "I said um like nine times"], ["chloe", "nobody fails over ums"]],
          [["chloe", "omar are you stressing about the hirevue"], ["$s", "a bit. you only get one go per question"], ["ilyas", "you were calm in practice"]],
        ],
        yes: [
          [["$s", "through to the next stage!!"], ["zara", "I knew it"], ["chloe", "amazing, drinks"]],
          [["$s", "email just came in: invited to the next round"], ["ilyas", "let's go"]],
          [["$s", "passed the hirevue. need to book an AC date now"], ["zara", "you legend"]],
        ],
        no: [
          [["$s", "rejection email. 'we wont be taking your application further'"], ["ilyas", "their loss, honestly"], ["chloe", "I'm gutted for you"]],
          [["$s", "didn't get through. no feedback, as usual"], ["zara", "I'm sorry"]],
          [["$s", "a no on that one. regrouping"], ["ilyas", "tomorrow we find another"]],
        ],
      },
      {
        title: "{s} hears back from a bank by Friday",
        subject: "zara",
        p: 0.4,
        hours: 90,
        perWeek: 0.6,
        before: [
          [["chloe", "zara's been waiting for ubs for ages"], ["$s", "they said by Friday and it's Wednesday"], ["omar", "they never reply when they say they will"]],
          [["ilyas", "do we think zara hears back from the bank this week"], ["$s", "stop, I can't think about it"]],
          [["omar", "UBS said they'd reply by the end of the week to everyone"], ["$s", "every time I refresh it's just a newsletter"]],
        ],
        yes: [
          [["$s", "just got a response, it's an invite to the next round"], ["chloe", "get in"]],
          [["$s", "got a reply at 4:50pm on Friday. 4:50"], ["ilyas", "they know how to build tension"]],
          [["$s", "got an email. it's a no but at least they replied"], ["omar", "at least it's something"]],
        ],
        no: [
          [["$s", "nothing. radio silence"], ["omar", "could be Monday"], ["$s", "could be never"]],
          [["$s", "it's Friday evening and no email. I'm done refreshing"], ["chloe", "come over, we'll order food"]],
          [["$s", "no news, I've checked spam three times"], ["ilyas", "spam is where the good ones hide"]],
        ],
      },
      {
        title: "{s} gets a good rating at her mock interview",
        subject: "chloe",
        p: 0.6,
        hours: 48,
        perWeek: 0.5,
        before: [
          [["omar", "chloe's mock interview at the careers service is tomorrow"], ["$s", "I'm hoping I dont panic on the competency bit"], ["ilyas", "you've done 4 practice rounds"]],
          [["zara", "chloe, what's the feedback going to be"], ["$s", "I think they'll say I need to be more concise"], ["omar", "everyone gets that"]],
          [["ilyas", "chloe's up next for the mock thing"], ["$s", "wish me luck, I've slept 4 hours"]],
        ],
        yes: [
          [["$s", "they rated me 'strong' on 3 out of 4 areas"], ["omar", "great"], ["zara", "I knew it"]],
          [["$s", "feedback was 'good, structured answers'. I'm so happy"], ["ilyas", "proud of you"]],
          [["$s", "got a 'strong' overall. they said I should apply to everything"], ["omar", "then do that"]],
        ],
        no: [
          [["$s", "'needs development'. in a nice way, but still"], ["zara", "that's helpful though, you know what to fix"]],
          [["$s", "they said my answers rambled. so that's the work"], ["omar", "I ramble too"], ["ilyas", "we all ramble"]],
          [["$s", "mixed bag, I forgot the STAR structure on question 2"], ["zara", "the star structure is a lot to remember"]],
        ],
      },
      {
        title: "{s} submits another application tonight",
        subject: "ilyas",
        p: 0.7,
        hours: 20,
        perWeek: 0.8,
        before: [
          [["omar", "ilyas have you applied to the barclays one yet"], ["$s", "I'll do it tonight after dinner"], ["zara", "you said that last night"]],
          [["chloe", "deadline's friday, are we all submitting tonight"], ["$s", "I'm not, I'll be up late proofing it"]],
          [["zara", "ilyas, how many have you sent"], ["$s", "six, I'm doing another this evening"], ["omar", "I'll believe it"]],
        ],
        yes: [
          [["$s", "submitted. 11:48pm. that's number seven"], ["omar", "nice"]],
          [["$s", "sent. proofread twice. going to bed"], ["zara", "good night"]],
          [["$s", "application in, now I wait"], ["chloe", "you're a machine"]],
        ],
        no: [
          [["$s", "didnt submit, I fell asleep on the sofa"], ["zara", "it happens, do it tomorrow morning"]],
          [["$s", "not tonight, I was stuck on the cover letter"], ["omar", "do it in the morning"]],
          [["$s", "got dinner, then watched one episode, then it was midnight"], ["chloe", "classic"]],
        ],
      },
      {
        title: "Someone in the group gets a rejection email today",
        subject: null,
        p: 0.6,
        hours: 24,
        perWeek: 1.0,
        before: [
          [["$a", "it's the day applications close for a few"], ["$b", "expect emails in the afternoon"], ["$a", "I'm braced"]],
          [["$a", "I feel like rejections come out on a Tuesday"], ["$b", "you've made that up"], ["$a", "it's a pattern"]],
          [["$a", "phone's on loud"], ["$b", "I turned notifications off, I can't deal"]],
        ],
        yes: [
          [["$a", "got one today. 'after careful consideration'"], ["$b", "me too, same template"], ["$c", "it's not you, it's the volume"]],
          [["$a", "the email just landed, I'm not opening it for an hour"], ["$b", "just rip it off"]],
          [["$a", "rejection, 4pm, boilerplate"], ["$b", "I got mine at 3:55"]],
        ],
        no: [
          [["$a", "nothing today, which could be good or it could be nothing"], ["$b", "I'm taking it as good"]],
          [["$a", "no emails today, my inbox is clear"], ["$b", "I'm so relieved"]],
          [["$a", "no news is no news"], ["$b", "wise words"]],
        ],
      },
      {
        title: "Someone in the group gets an assessment centre invite this week",
        subject: null,
        p: 0.35,
        hours: 100,
        perWeek: 0.5,
        before: [
          [["$a", "anyone heard about assessment centre invites"], ["$b", "apparently they go out this week"], ["$a", "fingers crossed"]],
          [["$a", "I've cleared my calendar for the 18th, just in case"], ["$b", "optimistic"]],
          [["$a", "the careers service said invites are rolling"], ["$b", "so it could be any day"]],
        ],
        yes: [
          [["$a", "got my AC invite! 18th of next month"], ["$b", "congrats"], ["$c", "let's do prep sessions"]],
          [["$a", "an invite just landed in my inbox"], ["$b", "get in"]],
          [["$a", "I'm invited to the final round, I feel sick"], ["$b", "good sick?"], ["$a", "very"]],
        ],
        no: [
          [["$a", "nobody has heard anything, it's been a quiet week"], ["$b", "let's keep applying"]],
          [["$a", "no invites this week, it's all very slow"], ["$b", "that's banking for you"]],
          [["$a", "still waiting, nothing from anyone"], ["$b", "it's a waiting game"]],
        ],
      },
    ],
    stocks: [
      { by: "chloe", title: "Omar lands a spring week offer by March", subject: "omar", openDaysAgo: 70, resolveDaysFromNow: -8, p0: 0.45, drift: 0.3, outcome: true },
      { by: "omar", title: "Ilyas gets a spring week offer by March", subject: "ilyas", openDaysAgo: 70, resolveDaysFromNow: 140, p0: 0.4, drift: 0.1 },
      { by: "ilyas", title: "Zara gets her first bank interview before Christmas", subject: "zara", openDaysAgo: 28, resolveDaysFromNow: 62, p0: 0.5, drift: -0.1 },
      { by: "zara", title: "Chloe sends 20 applications by the end of November", subject: "chloe", openDaysAgo: 45, resolveDaysFromNow: 37, p0: 0.5, drift: 0.2 },
    ],
    liveBets: [
      { by: "chloe", title: "Zara hears back from UBS by Wednesday", subject: "zara", hoursLeft: 72 },
      { by: "omar", title: "Ilyas submits his Barclays application tomorrow night", subject: "ilyas", hoursLeft: 30 },
      { by: "zara", title: "Someone in the group gets an assessment centre invite this week", subject: null, hoursLeft: 118 },
    ],
    recent: [
      ["zara", "still nothing from UBS"],
      ["omar", "checked spam?"],
      ["zara", "three times"],
      ["chloe", "the thing says by wednesday apparently"],
      ["ilyas", "I took the 'yes she hears back' side"],
      ["zara", "thank you for believing in me ilyas"],
    ],
  },

  // ---------------------------------------------------------------------------------------------
  // 5. FAMILY
  // ---------------------------------------------------------------------------------------------
  {
    name: "Family",
    members: ["mum", "dad", "ilyas", "yasmin"],
    aiContext:
      "Family chat: Mum, Dad, Ilyas (at Imperial in London) and Yasmin (Year 11). The Sunday call is at 6pm and Sunday roast is at 2pm when Ilyas is home. Yasmin's GCSE mocks run from 23 November to 4 December. Dad is building a shed in the garden.",
    activity: 0.4,
    snippets: [
      [["mum", "Hello darling, are you eating properly? I saw the photo of your fridge and it was mostly condiments."], ["ilyas", "there's an egg in there"], ["mum", "One egg is not a plan."], ["dad", "Send him a lasagne"]],
      [["dad", "Shed update: roof felt is on"], ["ilyas", "nice dad"], ["dad", "Just the door and the paint left"], ["mum", "And the guttering, and the shelves, and the lock."], ["dad", "Details"]],
      [["yasmin", "mum can i get a lift to rubys at 4"], ["mum", "Yes, but you need to tell me by lunchtime, not at 3:55."], ["yasmin", "ok"], ["yasmin", "its 3:55"], ["mum", "Yasmin."]],
      [["mum", "What time are you coming home on Friday, so I know how much to cook?"], ["ilyas", "probably around 7, the 5:40 train"], ["mum", "Lovely. I will make that chicken you like."], ["dad", "I'll pick you up from the station"]],
      [["yasmin", "I hate maths so much"], ["ilyas", "what topic"], ["yasmin", "algebra. its all letters"], ["ilyas", "call me tonight and I'll walk you through it"], ["yasmin", "ok but not before 8"], ["mum", "Thank you, Ilyas, that is very kind."]],
      [["dad", "Spoke to your uncle about the van. He says we can borrow it for the timber."], ["mum", "Which weekend?"], ["dad", "This one. Saturday."], ["mum", "You told me nothing about this."], ["dad", "I'm telling you now"]],
      [["mum", "I found your old school jumper in the loft, shall I keep it?"], ["ilyas", "bin it"], ["mum", "I cannot bin a jumper with your name sewn in."], ["yasmin", "I'll wear it"]],
      [["dad", "Football on tonight, anyone watching?"], ["ilyas", "arsenal at 8"], ["dad", "Good lad"], ["yasmin", "dad's going to shout at the telly again"]],
      [["mum", "Did you both see the photos from your cousin's wedding? I sent them in the other chat."], ["yasmin", "I saw them"], ["ilyas", "looks good, you look great mum"], ["mum", "Thank you, that is the correct response."]],
      [["yasmin", "can i have 20 pounds for the school trip"], ["dad", "What's it for?"], ["yasmin", "art gallery thing"], ["dad", "Ask your mother, she keeps the receipts"], ["mum", "I heard that."]],
      [["mum", "Ilyas, have you booked your dentist? It has been over a year."], ["ilyas", "next week I'll sort it"], ["mum", "You said that in June."], ["ilyas", "fair"]],
      [["dad", "Found a mouse in the garage. Name him Gary."], ["yasmin", "dad no"], ["dad", "Too late, we've bonded"], ["mum", "Please remove Gary."]],
      [["ilyas", "just had the worst tube journey of my life"], ["mum", "What happened, darling?"], ["ilyas", "stuck for 40 mins in a tunnel with a man eating a kebab"], ["yasmin", "at 9am?!"], ["ilyas", "yes"]],
      [["mum", "Roast this Sunday if you're free, I'm doing lamb."], ["ilyas", "cant, library. next sunday"], ["mum", "I will keep a plate for you and you will pretend to be less busy."], ["ilyas", "deal"]],
      [["dad", "Yasmin, did you do your homework?"], ["yasmin", "yes"], ["dad", "All of it?"], ["yasmin", "most of it"], ["mum", "Which means some of it."]],
      [["ilyas", "call tonight at 6?"], ["mum", "Yes, I will put the kettle on."], ["dad", "I'll be there if the football's over"], ["yasmin", "football's never over with dad"]],
      [["yasmin", "someone took my phone charger from the kitchen"], ["dad", "I needed it for the drill"], ["yasmin", "dad"], ["dad", "It's a good charger"]],
      [["mum", "Please remember to wear a coat, it is going to be cold this week."], ["ilyas", "i have a coat"], ["mum", "I mean wear it, not carry it."]],
      [["dad", "Dropped the paint tin. The shed is now partially green."], ["mum", "It was supposed to be sage."], ["dad", "It's a bold sage"], ["yasmin", "send pic"]],
      [["ilyas", "got 74 on the stats sheet"], ["mum", "That is wonderful, I am so proud of you."], ["dad", "Well done son"], ["yasmin", "show off"]],
      [["yasmin", "dad you have to download the friend stocks thing"], ["dad", "What is it?"], ["yasmin", "its coins and you bet on stuff. like whether mum is late for the school run"], ["mum", "I am never late."], ["yasmin", "you literally are"]],
      [["dad", "I've got 900 coins"], ["ilyas", "how"], ["dad", "I bet on the shed being finished late. I'm a realist"], ["mum", "You are not a realist, you are an expert at not finishing things."]],
      [["mum", "I do not understand the leaderboard, why am I last?"], ["yasmin", "because you put everything on dad finishing the shed"], ["mum", "I have faith in him."], ["dad", "Thanks, love"], ["yasmin", "faith loses coins mum"]],
      [["ilyas", "everyone remember it's play coins, nobody owes anyone anything"], ["mum", "I know that, Ilyas, but your father is telling people he won."], ["dad", "I did win"]],
      [["mum", "Do you need anything from Sainsbury's? I am going tomorrow and can post a parcel."], ["ilyas", "some teabags and crumpets"], ["mum", "I will add a few extras, you will be grateful."], ["ilyas", "I always am"]],
      [["yasmin", "mock timetable is out. history is on the 23rd"], ["mum", "So that is the first one."], ["yasmin", "im going to fail"], ["ilyas", "you'll be fine, revise the weimar bit"], ["yasmin", "ok"]],
      [["dad", "Garden centre has a sale on screws. I bought 400."], ["mum", "Why 400?"], ["dad", "Because it was cheaper per screw"], ["yasmin", "are you building a boat"]],
      [["ilyas", "coming home in 2 weeks for a long weekend"], ["mum", "That is wonderful news. Your room is still exactly as you left it."], ["dad", "Except for the pile of timber."], ["ilyas", "what"], ["yasmin", "dad is storing the wood in there"]],
      [["mum", "Happy Friday everyone. Please have a lovely weekend."], ["dad", "Same"], ["yasmin", "bye"], ["ilyas", "love you all"], ["mum", "Love you too, darling."]],
      [["yasmin", "are you home this weekend? i need help with english"], ["ilyas", "not this one, call me sunday"], ["yasmin", "ok. unless dad's on the phone"], ["dad", "I am not always on the phone"], ["mum", "He is on the phone every Sunday."]],
    ],
    templates: [
      {
        title: "{s} makes progress on the shed this weekend",
        subject: "dad",
        p: 0.6,
        hours: 100,
        perWeek: 0.5,
        before: [
          [["mum", "Your father is heading to the garden centre again."], ["$s", "Only for hinges."], ["mum", "You said that last time and came back with a ladder."]],
          [["ilyas", "dad what's the plan for the shed this weekend"], ["$s", "Door and a coat of varnish if the weather holds"], ["yasmin", "it will rain"]],
          [["$s", "Weekend project: shed shelves"], ["mum", "Please measure twice."], ["$s", "I measure three times, I just cut once wrong"]],
        ],
        yes: [
          [["$s", "Door is on. Hinges work. Very pleased."], ["mum", "Well done, love."], ["yasmin", "send a pic"]],
          [["$s", "Shelves are up and nothing has fallen off yet."], ["ilyas", "amazing dad"]],
          [["$s", "Two coats of varnish. The shed smells like a pine forest."], ["mum", "The whole garden does."]],
        ],
        no: [
          [["$s", "Rained all day. Shed progress: nil."], ["mum", "You could have done something indoors."], ["$s", "That is not how sheds work"]],
          [["$s", "Ran out of screws. Back to the shop on Monday."], ["mum", "I did say to check before you started."]],
          [["$s", "Spent the day looking for the spirit level. It was in the shed."], ["mum", "Of course it was."]],
        ],
      },
      {
        title: "{s} reminds everyone to wear a coat",
        subject: "mum",
        p: 0.75,
        hours: 48,
        perWeek: 0.5,
        before: [
          [["ilyas", "weather app says 4 degrees tomorrow"], ["yasmin", "I'm wearing my hoodie"]],
          [["dad", "Frost on the car this morning."], ["yasmin", "iced windscreen again"]],
          [["yasmin", "its freezing out there"], ["ilyas", "I'm cycling to uni in it"]],
        ],
        yes: [
          [["$s", "Please wear your coat this week, both of you. I do not want any sniffles."], ["yasmin", "ok mum"]],
          [["$s", "Ilyas, it is cold. Wear a scarf. Yasmin, a coat. Not a jumper."], ["yasmin", "its a big jumper"]],
          [["$s", "A reminder: coats, gloves, no excuses."], ["dad", "Even me?"], ["$s", "Especially you."]],
        ],
        no: [
          [["$s", "Good morning everyone, I hope you all have a lovely day."], ["dad", "Same to you"]],
          [["$s", "Dinner will be at six tonight, please be home on time."], ["yasmin", "yes"]],
          [["$s", "Lovely sunshine today, I am going to do the garden."], ["dad", "Wear a hat"]],
        ],
      },
      {
        title: "{s} finishes her homework before 9pm",
        subject: "yasmin",
        p: 0.4,
        hours: 30,
        perWeek: 0.8,
        before: [
          [["mum", "Yasmin, homework first, then your phone."], ["$s", "I'll do it after dinner"], ["dad", "She said that yesterday"]],
          [["ilyas", "yasmin have you got homework tonight"], ["$s", "just english and a bit of chem"], ["mum", "A bit?"]],
          [["dad", "Yasmin is on her phone"], ["$s", "I'm checking the homework on it"], ["mum", "Which homework?"]],
        ],
        yes: [
          [["$s", "done all of it before 9. can i have my phone now"], ["mum", "You may."], ["dad", "Impressive"]],
          [["$s", "finished the chem, english was easy"], ["mum", "Well done, darling."]],
          [["$s", "all done. someone give me a medal"], ["ilyas", "medal incoming"]],
        ],
        no: [
          [["$s", "I'll do the english tomorrow morning, im too tired"], ["mum", "Absolutely not, it is due tomorrow."]],
          [["$s", "its 10pm and im on question 3 of 10"], ["dad", "Better late than never"], ["mum", "Better early than late."]],
          [["$s", "i forgot it was due"], ["ilyas", "just do it now"]],
        ],
      },
      {
        title: "{s} remembers to call home on Sunday",
        subject: "ilyas",
        p: 0.5,
        hours: 48,
        perWeek: 0.9,
        before: [
          [["mum", "Are you calling on Sunday, Ilyas?"], ["$s", "yes yes, 6pm"], ["yasmin", "he said that last week and called on tuesday"]],
          [["dad", "Calling Sunday? We have a lot to tell you."], ["$s", "I'll ring at six"]],
          [["yasmin", "bet he forgets"], ["$s", "I won't, I put a reminder in my phone"]],
        ],
        yes: [
          [["$s", "calling now"], ["mum", "Lovely, I will put it on speaker."]],
          [["$s", "rang at 6 on the dot, you all looked well"], ["dad", "Good to see you son"]],
          [["$s", "sorry for the dodgy connection, but good chat"], ["mum", "It was lovely to see your face."]],
        ],
        no: [
          [["mum", "We waited until 7 and then had dinner."], ["$s", "sorry sorry, I was at the library and lost track of time"], ["mum", "It is alright. Call tomorrow."]],
          [["dad", "Ilyas hasn't called."], ["yasmin", "told you"]],
          [["$s", "so sorry, I fell asleep after football. calling tomorrow"], ["mum", "Of course, darling. Rest."]],
        ],
      },
      {
        title: "Sunday roast is on the table by 2pm",
        subject: null,
        p: 0.35,
        hours: 60,
        perWeek: 0.6,
        before: [
          [["mum", "Roast this Sunday, chicken and all the trimmings."], ["dad", "Time?"], ["mum", "Two o'clock."]],
          [["yasmin", "what time is lunch on sunday"], ["mum", "Two, if your father stops moving the oven shelves."], ["dad", "They were crooked"]],
          [["ilyas", "I'm home Sunday, what's for lunch"], ["mum", "Roast beef."]],
        ],
        yes: [
          [["mum", "Roast is on the table at 2pm exactly."], ["dad", "Impressive timing"], ["yasmin", "I'm starving"]],
          [["mum", "We sat down at five to two, a good result."], ["dad", "Excellent roasties"]],
          [["mum", "Lunch at two. Everyone wash their hands, please."], ["yasmin", "coming"]],
        ],
        no: [
          [["mum", "Lunch will be a little late, the potatoes need longer."], ["dad", "I'm happy to wait"], ["yasmin", "I'm not"]],
          [["mum", "We sat down at 3:15. The oven decided to be difficult."], ["dad", "Worth the wait"]],
          [["mum", "Apologies, lunch is at half past two. The beef was bigger than I thought."], ["yasmin", "I ate a whole bag of crisps"]],
        ],
      },
      {
        title: "{s} falls asleep in front of the telly before 9pm",
        subject: "dad",
        p: 0.8,
        hours: 14,
        perWeek: 0.7,
        before: [
          [["yasmin", "dad's already yawning and it's 8"], ["$s", "I'm resting my eyes"], ["mum", "That is called sleeping."]],
          [["mum", "Your father has put the telly on."], ["yasmin", "he'll be asleep in 10 minutes"], ["$s", "I'm watching the quiz"]],
          [["ilyas", "what's dad up to tonight"], ["mum", "Sofa, blanket, football."]],
        ],
        yes: [
          [["mum", "Asleep. Mouth open. Not even half time."], ["yasmin", "photo evidence incoming"], ["mum", "Do not post it."]],
          [["yasmin", "dad is snoring so loud i can't hear the telly"], ["ilyas", "classic"]],
          [["mum", "He fell asleep at 8:40 with the remote in his hand."], ["ilyas", "very consistent"]],
        ],
        no: [
          [["$s", "Stayed up for the whole match. See, I can do it"], ["mum", "It finished at 9."]],
          [["$s", "Watched the whole film. Tell you what, it was long."], ["yasmin", "dad you were awake? who are you"]],
          [["mum", "He stayed up for once, he was drawing something at the table."], ["$s", "The shed plans"]],
        ],
      },
    ],
    stocks: [
      { by: "yasmin", title: "Ilyas passes his driving theory test first time", subject: "ilyas", openDaysAgo: 60, resolveDaysFromNow: -35, p0: 0.55, drift: 0.15, outcome: true },
      { by: "ilyas", title: "Dad finishes the shed before New Year", subject: "dad", openDaysAgo: 40, resolveDaysFromNow: 69, p0: 0.35, drift: -0.15 },
      { by: "mum", title: "Yasmin gets a grade 7 or above in her English mock", subject: "yasmin", openDaysAgo: 20, resolveDaysFromNow: 55, p0: 0.5, drift: 0.05 },
      { by: "mum", title: "Dad books the summer holiday before February", subject: "dad", openDaysAgo: 35, resolveDaysFromNow: 100, p0: 0.4, drift: 0.1 },
    ],
    liveBets: [
      { by: "yasmin", title: "Dad falls asleep on the sofa before 9pm tonight", subject: "dad", hoursLeft: 8 },
      { by: "mum", title: "Ilyas calls home on Sunday before 7pm", subject: "ilyas", hoursLeft: 40 },
      { by: "ilyas", title: "Dad makes progress on the shed this weekend", subject: "dad", hoursLeft: 48 },
    ],
    recent: [
      ["mum", "Dad is outside in the garden with a spirit level."],
      ["yasmin", "is it raining?"],
      ["mum", "A little. He says it does not matter for varnish."],
      ["ilyas", "it matters for varnish"],
      ["dad", "I have a tarp"],
      ["yasmin", "dad please"],
    ],
  },

  // ---------------------------------------------------------------------------------------------
  // 6. RUN CLUB
  // ---------------------------------------------------------------------------------------------
  {
    name: "Run Club",
    members: ["maya", "sam", "chloe", "tom", "ilyas"],
    aiContext:
      "Run club: parkrun at 9am every Saturday in a park near Imperial, intervals on Tuesday evenings, long runs on Sundays. Everyone is entered for a half marathon in March and the group has a shared weekly target of 25 km. Sam's 5k best is 26:12, Tom's is 22:40.",
    activity: 0.8,
    snippets: [
      [["maya", "parkrun tmrw 9, who's in"], ["sam", "I'm in if the weather's not awful"], ["chloe", "I'm in"], ["tom", "I'll jog over from home"], ["ilyas", "I need a rest day but I'll come and cheer"]],
      [["sam", "my legs are destroyed from tuesday's intervals"], ["maya", "that's how you know it worked"], ["sam", "that's not how it works"], ["tom", "it kind of is"]],
      [["chloe", "what's everyone's pb at the moment"], ["tom", "22:40"], ["maya", "24:10"], ["ilyas", "25:30"], ["sam", "26:12 but I was in a fog"], ["chloe", "27:05. we are all at different parts of the journey"]],
      [["tom", "new trainers arrived, they're pink"], ["maya", "send pic"], ["tom", "they were the only ones in my size"], ["maya", "they're great"]],
      [["maya", "anyone want to do a long run sunday, 14k"], ["sam", "what pace"], ["maya", "easy, 6:00/km"], ["sam", "my easy is your tempo"], ["maya", "we'll meet in the middle"]],
      [["ilyas", "weekly km: 18 so far, need 25"], ["chloe", "I'm on 21"], ["tom", "30, dont mind me"], ["maya", "show off"]],
      [["sam", "do you stretch after running"], ["tom", "every time"], ["sam", "I stand there and think about stretching"], ["chloe", "that's a good start"]],
      [["chloe", "it was so foggy this morning I got lost in the park"], ["maya", "how do you get lost in the park"], ["chloe", "it's a big park"]],
      [["tom", "gels or no gels for the half"], ["maya", "one at 10k, one at 16k"], ["ilyas", "I'd rather eat a banana"], ["maya", "a banana and a gel"]],
      [["sam", "anyone fancy brunch after parkrun"], ["chloe", "yes, the place near high st ken"], ["tom", "the one with the avocado thing"], ["maya", "vegan pancakes only for me"]],
      [["maya", "rest day. rest day. rest day."], ["ilyas", "you said rest day yesterday"], ["maya", "it's an ongoing commitment"]],
      [["tom", "new running playlist, link in a sec"], ["sam", "is it mostly 90s dance"], ["tom", "it's mostly 90s dance"], ["sam", "so yes please"]],
      [["chloe", "starting to get nervous about the half in march"], ["maya", "we have 20 weeks"], ["chloe", "I've never run more than 12k"], ["tom", "long runs, you'll be fine"], ["ilyas", "we'll do the distance together"]],
      [["sam", "just got overtaken by a man in jeans"], ["tom", "happens to me every week"], ["sam", "he wasn't even trying"]],
      [["ilyas", "my watch says my vo2 max is 52"], ["maya", "mine says 49"], ["tom", "mine says 'unknown'"], ["sam", "mine says low"], ["chloe", "mine says it needs a software update"]],
      [["maya", "who wants to try the hill repeats tuesday at 7"], ["tom", "I do"], ["ilyas", "I'll try one and see"], ["sam", "I'll watch"], ["maya", "that's called not trying"]],
      [["tom", "did anyone sign up for the marathon ballot"], ["maya", "I did, I'll find out if I get in soon"], ["chloe", "I'm too scared"], ["ilyas", "half first"]],
      [["sam", "I ran in the rain this morning, felt great"], ["chloe", "I stayed in bed and felt even better"]],
      [["maya", "my left knee is making a clicking noise"], ["tom", "does it hurt?"], ["maya", "only when I run"], ["tom", "see a physio"], ["maya", "after the half"]],
      [["chloe", "can someone tell me how to pace a 5k"], ["tom", "start slower than you think"], ["chloe", "how much slower"], ["tom", "a lot slower"], ["ilyas", "do the first km at 5:30 and speed up"]],
      [["ilyas", "there's a free 10k at the weekend in the park"], ["maya", "I'm in"], ["sam", "how free"], ["ilyas", "free as in no fee"], ["sam", "then yes"]],
      [["tom", "hot take: running with music is better than running with a podcast"], ["chloe", "I disagree"], ["sam", "podcast. it's the only way I get through"], ["maya", "music for races, podcasts for easy runs"]],
      [["sam", "I'm staking 200 coins I run sub 25 by christmas"], ["maya", "you've been saying that for months"], ["sam", "but this time the coins are on the line"], ["tom", "coins aren't real"], ["sam", "they are to me"]],
      [["tom", "I'm top of the run club leaderboard, probably because I bet on myself every parkrun"], ["chloe", "you keep winning"], ["tom", "I run fast. it's simple"]],
      [["chloe", "I lost 150 coins betting against maya's long run"], ["maya", "I told you I'd do 14k"], ["chloe", "you did 14.2"], ["maya", "and I'd have done more if I wasn't talking to you"]],
      [["ilyas", "new bet idea: someone finishes a parkrun in fancy dress"], ["tom", "I'll do it in a banana costume"], ["maya", "do not put that on the app"]],
      [["sam", "what's everyone eating before a long run"], ["maya", "porridge and honey"], ["tom", "toast with peanut butter"], ["chloe", "nothing, I get a stitch"], ["ilyas", "a banana at 7, then the run"]],
      [["maya", "been looking at the half course, there's a massive hill at 9 miles"], ["tom", "oh no"], ["maya", "it's in the elevation graph"], ["chloe", "I'm not looking at the graph"]],
      [["tom", "so who's bringing the post-run snacks tomorrow"], ["sam", "I'll bring the jaffa cakes"], ["maya", "I'll bring bananas"], ["chloe", "I'll bring the tea"], ["tom", "ok that's covered"]],
      [["ilyas", "legs are a bit tight, going to do a recovery jog"], ["sam", "what's a recovery jog"], ["ilyas", "it's when you move slower than a walk"], ["sam", "love that for you"]],
    ],
    templates: [
      {
        title: "{s} runs parkrun in under 26 minutes",
        subject: "sam",
        p: 0.35,
        hours: 50,
        perWeek: 1.0,
        before: [
          [["tom", "sam's going for sub 26 tomorrow"], ["$s", "if the wind stays down, yes"], ["maya", "excuses already"]],
          [["maya", "sam what's your plan for parkrun"], ["$s", "go out at 5:05 per km and hang on"], ["tom", "dont go out too hot"]],
          [["chloe", "sam did you eat properly last night"], ["$s", "pasta, 2 helpings, an early night"], ["ilyas", "looks promising"]],
        ],
        yes: [
          [["$s", "25:48. 25:48!! I almost threw up at the finish"], ["tom", "well done"], ["maya", "that's a huge improvement"]],
          [["$s", "25:55 and I could have gone a bit quicker"], ["chloe", "amazing"]],
          [["$s", "I did it, 25:37. feels good"], ["ilyas", "I'm proud of you"]],
        ],
        no: [
          [["$s", "26:20. went out too hard, died at 4k"], ["tom", "classic"]],
          [["$s", "26:33. my legs felt heavy"], ["maya", "still good"]],
          [["$s", "wind was ridiculous, 27:02. not my day"], ["chloe", "there's always next week"]],
        ],
      },
      {
        title: "{s} finishes parkrun in the top 30",
        subject: "tom",
        p: 0.65,
        hours: 50,
        perWeek: 0.6,
        before: [
          [["maya", "there's a big field tomorrow, loads of visitors"], ["$s", "I should be top 30 if I get a good start"]],
          [["chloe", "tom's been smashing the training"], ["$s", "I've done sessions on tuesday and thursday"], ["sam", "he'll be top 10"]],
          [["ilyas", "is tom running parkrun hard tomorrow or easy"], ["$s", "hard, I've got a point to prove"]],
        ],
        yes: [
          [["$s", "22:28, 14th place"], ["maya", "unreal"], ["sam", "he'd be insufferable if he wasn't nice"]],
          [["$s", "24th! the pb is closer than I thought"], ["chloe", "great run"]],
          [["$s", "top 30, easy. 17th"], ["ilyas", "he said easy"]],
        ],
        no: [
          [["$s", "34th. big field. should have gone out faster"], ["maya", "you did well"]],
          [["$s", "a rubbish one. I was 41st"], ["sam", "I'd take 41st"]],
          [["$s", "38th. a cold and a late night"], ["chloe", "rest up"]],
        ],
      },
      {
        title: "{s} hits 25 km for the week",
        subject: "maya",
        p: 0.85,
        hours: 150,
        perWeek: 0.8,
        before: [
          [["chloe", "maya's weekly km is on 12 on wednesday"], ["$s", "I'll get the rest at the weekend"], ["tom", "you say that every week"]],
          [["sam", "maya never misses the weekly target"], ["$s", "I have a spreadsheet"], ["ilyas", "of course you do"]],
          [["ilyas", "maya what's the plan to get to 25"], ["$s", "tuesday 8k, thursday 6k, parkrun 5k, sunday long run"]],
        ],
        yes: [
          [["$s", "27.4 km for the week. I'm tired"], ["tom", "what a legend"]],
          [["$s", "25.1. just got there, the last 100m on sunday"], ["sam", "she's a machine"]],
          [["$s", "hit 26. celebratory pancakes"], ["chloe", "you earned them"]],
        ],
        no: [
          [["$s", "22 km, my knee wasn't happy"], ["tom", "rest is training"]],
          [["$s", "only 19, I had to cut sunday short because of the rain"], ["chloe", "you can do next week"]],
          [["$s", "23.6 km. sat on the sofa when I should have run"], ["sam", "at last, a human"]],
        ],
      },
      {
        title: "{s} makes it to parkrun on Saturday",
        subject: "chloe",
        p: 0.55,
        hours: 40,
        perWeek: 0.9,
        before: [
          [["maya", "chloe are you in for tomorrow?"], ["$s", "if I wake up"], ["sam", "set 3 alarms"]],
          [["tom", "who's coming to parkrun"], ["$s", "I'm thinking about it"], ["ilyas", "she's thinking about it. that's a no"]],
          [["sam", "chloe's been up late at the library all week"], ["$s", "I'm tired but I'll try"]],
        ],
        yes: [
          [["$s", "I made it. 9:02 start. I'm at the back"], ["maya", "well done"]],
          [["$s", "got there. 28:30, not my best but I'm happy"], ["tom", "good work"]],
          [["$s", "woke up at 8, ran, and had a croissant. perfect day"], ["sam", "goals"]],
        ],
        no: [
          [["$s", "sorry, I slept through it"], ["maya", "there's always next week"]],
          [["$s", "I'm not coming, I've got a headache and a problem sheet"], ["tom", "rest up"]],
          [["$s", "woke up at 9:15. I'm so sorry"], ["sam", "we ran for you"]],
        ],
      },
      {
        title: "{s} makes the Tuesday intervals",
        subject: "ilyas",
        p: 0.45,
        hours: 36,
        perWeek: 0.7,
        before: [
          [["maya", "intervals on tuesday, 6x800, who's in"], ["$s", "I have a 9am the next day but yes"], ["tom", "he's wavering"]],
          [["sam", "ilyas, are you doing the intervals or hiding"], ["$s", "I'll be there if I finish the sheet"]],
          [["chloe", "I'm doing the intervals but at half the pace"], ["$s", "I'll join the half the pace group"]],
        ],
        yes: [
          [["$s", "done, 6x800. my lungs hurt"], ["maya", "good work"]],
          [["$s", "made it. 3:05 average, a bit slow"], ["tom", "that's fine"]],
          [["$s", "did them. still alive"], ["sam", "impressive"]],
        ],
        no: [
          [["$s", "skipped, I was stuck in the library until 8"], ["maya", "next time"]],
          [["$s", "I'm out, got a cold coming"], ["tom", "get well"]],
          [["$s", "sorry, I fell asleep after lectures and woke up at 8pm"], ["sam", "relatable"]],
        ],
      },
      {
        title: "Parkrun is cancelled because of the weather",
        subject: null,
        p: 0.15,
        hours: 40,
        perWeek: 0.4,
        before: [
          [["$a", "there's a frost warning for tomorrow"], ["$b", "if it's icy they'll cancel"], ["$a", "fingers crossed, I mean toes crossed"]],
          [["$a", "it's been raining all week, the park is a swamp"], ["$b", "they cancel when it floods"]],
          [["$a", "has anyone seen the parkrun page"], ["$b", "it says 'event is on' for now"]],
        ],
        yes: [
          [["$a", "just got the email, parkrun is cancelled"], ["$b", "oh good, back to bed"]],
          [["$a", "cancelled due to flooding. let's do our own run along the path"], ["$b", "fine by me"]],
          [["$a", "parkrun cancelled, ice on the paths"], ["$b", "I'll go for a jog anyway"]],
        ],
        no: [
          [["$a", "it's on. the sun's out"], ["$b", "I'm up, I'm up"]],
          [["$a", "no cancellation, still on. cold but dry"], ["$b", "great"]],
          [["$a", "it's a go, muddy but a go"], ["$b", "wear trail shoes"]],
        ],
      },
      {
        title: "Someone in the group gets a parkrun PB this Saturday",
        subject: null,
        p: 0.3,
        hours: 50,
        perWeek: 0.6,
        before: [
          [["$a", "conditions are perfect tomorrow, flat and cool"], ["$b", "a day for a pb"], ["$a", "if only my legs agreed"]],
          [["$a", "someone is going to get a pb tomorrow, it's that kind of weather"], ["$b", "let it be me"]],
          [["$a", "long training block done, everyone's fresh"], ["$b", "tomorrow's the day"]],
        ],
        yes: [
          [["$a", "new pb! 24:12"], ["$b", "well done"], ["$c", "I got one too, by 4 seconds"]],
          [["$a", "I got a pb. it only took 3 months"], ["$b", "brilliant"]],
          [["$a", "pb by 18 seconds. my legs feel like jelly"], ["$b", "champion"]],
        ],
        no: [
          [["$a", "no pb, but a nice run"], ["$b", "same, legs were heavy"]],
          [["$a", "nobody got a pb, too windy"], ["$b", "next week"]],
          [["$a", "too hot and too busy, no pb"], ["$b", "fair"]],
        ],
      },
    ],
    stocks: [
      { by: "ilyas", title: "Chloe completes her first 10k without stopping", subject: "chloe", openDaysAgo: 60, resolveDaysFromNow: -14, p0: 0.4, drift: 0.25, outcome: true },
      { by: "maya", title: "Sam runs a sub-25 minute 5k before Christmas", subject: "sam", openDaysAgo: 50, resolveDaysFromNow: 62, p0: 0.35, drift: 0.1 },
      { by: "tom", title: "Maya finishes the March half marathon in under 1:50", subject: "maya", openDaysAgo: 30, resolveDaysFromNow: 140, p0: 0.5, drift: 0.1 },
      { by: "sam", title: "Tom runs a parkrun in under 22 minutes before the year ends", subject: "tom", openDaysAgo: 40, resolveDaysFromNow: 68, p0: 0.45, drift: 0.0 },
    ],
    liveBets: [
      { by: "chloe", title: "Maya hits her 25 km weekly target", subject: "maya", hoursLeft: 44 },
      { by: "tom", title: "Ilyas makes the Tuesday intervals", subject: "ilyas", hoursLeft: 90 },
      { by: "maya", title: "Next Saturday's parkrun is cancelled because of the weather", subject: null, hoursLeft: 118 },
    ],
    recent: [
      ["maya", "19.8 km so far this week"],
      ["chloe", "you need 5 more"],
      ["maya", "sunday long run will do it"],
      ["tom", "weather says rain"],
      ["maya", "I run in rain"],
      ["sam", "the market says 80 percent you hit it"],
    ],
  },
];
