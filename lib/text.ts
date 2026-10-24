// Pure text helpers shared by the server and the browser.

export const CATEGORY_WORDS: Record<string, RegExp> = {
  punctuality: /\blate|on time|early|show up|turn up|arrive/i,
  football: /football|goal|match|league|arsenal|chelsea|united|city|liverpool|spurs|fc\b/i,
  sport: /tennis|f1|race|cricket|rugby|boxing|fight|game\b/i,
  uni: /\bfirst\b|2:1|exam|grade|module|dissertation|uni|degree|coursework|lecture/i,
  work: /intern|job|offer|promot|boss|shift|work|spring week|interview/i,
  relationships: /girlfriend|boyfriend|date|dating|crush|single|relationship|text back/i,
  fitness: /gym|run|marathon|weight|kg|steps|bench|lift/i,
  social: /party|club|pres|night out|drink|holiday|trip/i,
  friendship: /friend|fall out|argue|reply|call/i,
};

export function guessCategory(text: string) {
  for (const [c, re] of Object.entries(CATEGORY_WORDS)) if (re.test(text)) return c;
  return "other";
}

