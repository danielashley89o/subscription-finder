# Launch kit

Site: https://subscription-finder.subscription-finder.workers.dev
Demo link (opens straight on sample results): https://subscription-finder.subscription-finder.workers.dev/#demo

## Before you post anything

- [ ] Buying works end to end: checkout link in `config.js`, a test purchase made, the key unlocks the app
- [ ] Legal pages have your real name, town and email
- [ ] You've run at least one real statement from your own bank through it
- [ ] Lemon Squeezy is in live mode

You only get one first impression on each channel. Don't launch until all four are ticked.

## Order to do it in

1. **Google Search Console** (free, and lets Google find the site). Go to search.google.com/search-console, add a
   "URL prefix" property with the site address, and choose the **HTML file** verification method. Download the file
   Google gives you and send it to me; I'll put it on the site. Then submit `sitemap.xml` under Sitemaps.
2. **Friends and family first.** Ask 5 to 10 people to try it on their own statement and tell you what broke or
   confused them. Fix that before the public launch.
3. **Short videos.** Post 2 to 3 a week. They're your best free channel. Scripts are below.
4. **Reddit and forums**, one post each, spread over a couple of weeks.
5. **Product Hunt and Hacker News**, ideally on a weekday morning (UK time) once you've had some feedback.
6. **Seasonal pushes:** early January ("new year, money clear-out") and late November to December (Black Friday
   free trials turning into charges).

## Short video scripts (TikTok, Instagram Reels, YouTube Shorts)

Record your screen on your phone using the demo link. Keep each video under 30 seconds, put captions on screen,
and start with the result, not the explanation.

**Video 1: "The number"**
- (0–3s) On screen: the £1,265.16 a year tile. Text: "This is how much I was spending on subscriptions"
- (3–10s) Scroll through the list. Voice: "I dropped my bank statement into this and it found every one, even the
  £2.99 iCloud I'd forgotten about."
- (10–20s) Tap "Cancel it" on two. The savings tile goes up. Voice: "Marked the ones I don't use… that's £227 a year back."
- (20–28s) Text: "Doesn't need your bank login. Your statement never leaves your phone." Voice: "Link in bio."

**Video 2: "The sneaky price rise"**
- (0–3s) Zoom on the badge "Price went up from £4.99". Text: "Did you notice Disney+ went up?"
- (3–15s) Voice: "Neither did I. This app checks your statement for price rises and subscriptions you've forgotten."
- (15–25s) Show the calendar reminders download. Voice: "It even reminds you before free trials start charging."

**Video 3: "Private by design"** (good for privacy-minded audiences)
- Show the page working with wifi turned off. Voice: "Most apps like this want your bank login. This one works
  with your internet switched off. Your statement never leaves your phone."

Note: the demo uses made-up data. Say "this sample" or use your own real results. Don't present sample numbers
as your own spending.

## Reddit

Read each subreddit's rules first. Many ban self-promotion, and r/UKPersonalFinance is strict.
Good fits that allow it: r/SideProject, r/indiehackers, r/privacy (only if the post is about the privacy design).

**r/SideProject post**

> **Title:** I built a subscription finder that never sees your bank login or uploads your statement
>
> Most "find your subscriptions" apps want to connect to your bank account. I didn't like that, so I built one
> that works from a CSV statement you download yourself, and runs entirely in the browser. The page is locked
> so it physically can't send data anywhere (you can turn your wifi off and it still works).
>
> It finds recurring payments, shows the yearly cost, flags price rises, spots subscriptions that have stopped,
> and makes calendar reminders before renewals and free trials end.
>
> You can try it free on a sample statement; using it on your own statement is a one-off £4.99 (no subscription, obviously).
>
> Demo with sample data: [link]/#demo
>
> I'd love feedback, especially if your bank's CSV doesn't read properly. Tell me which bank and I'll fix it.

## Product Hunt

- **Name:** Subscription Finder
- **Tagline (max 60 characters):** Find forgotten subscriptions without sharing your bank login
- **Description:** Drop in a bank statement and see every subscription and regular payment, what it costs you a
  year, when it renews and which prices have crept up. Mark what to cancel, track free trials and get calendar
  reminders. It runs entirely in your browser, so your statement never leaves your device. Free sample to try;
  £4.99 once to use it on your own statements.
- **First comment (from you):** Explain why you built it (the privacy angle), and ask people which bank they use
  so you can check its export works.
- **Images:** `og-image.png`, plus screenshots of the results screen and the reminders.

## Hacker News ("Show HN")

> **Title:** Show HN: Subscription finder that runs locally – the page can't make network requests
>
> **Text:** It parses a bank CSV in the browser, groups transactions by normalised merchant name, clusters by
> amount (so a £2.99 and a £10.99 Apple charge stay separate, but a £4.99→£5.99 price rise stays together),
> then checks gaps between charges against weekly/monthly/quarterly/yearly patterns. The app page sets a CSP of
> `connect-src 'none'`, so it can't send your data anywhere. Only a separate unlock page can talk to the licence
> server. Plain HTML and JS, no build step, no framework. Free sample statement to try; £4.99 to use it on your own. Feedback on the detection
> is very welcome.

HN readers dislike marketing language and like technical detail, honesty and paid products that are fairly priced.
Reply to every comment.

## Measuring how it's going

- **Sales:** your payments dashboard.
- **Google traffic:** Search Console shows which searches find you.
- The site deliberately has no analytics (it's part of the privacy promise). To see which channel works, launch
  one channel at a time and watch for a jump in sales, and ask early buyers where they heard about it.

## Directory listings (copy and paste)

Each of these is free to list on, and each listing is a link back to the site, which also helps Google.
Sign up with your own account. Do one or two a day rather than all at once. Sites change, so skip any that
have closed or started charging.

| Site | What it's for |
|---|---|
| Product Hunt (producthunt.com) | Launch day. Save it for when friends have tried the app (see above) |
| AlternativeTo (alternativeto.net) | List it as an alternative to subscription trackers like Emma and Snoop |
| SaaSHub (saashub.com) | Software directory |
| Indie Hackers (indiehackers.com) | Product page plus a "how I built it" post |
| BetaList (betalist.com) | New products |
| Uneed (uneed.best) | Daily launches |
| Microlaunch (microlaunch.net) | Monthly launches |
| Peerlist Launchpad (peerlist.io) | Weekly launches |

**Copy for the forms**

- **Name:** Subscription Finder
- **URL:** https://subscription-finder.subscription-finder.workers.dev
- **Tagline (short):** Find forgotten subscriptions without sharing your bank login
- **One sentence:** Drop in a bank statement and see every subscription, what it costs you a year and when it
  renews, without your data ever leaving your device.
- **Description:**
  Subscription Finder reads a bank statement CSV in your browser and lists every subscription and regular payment:
  what each one costs per month and per year, when it next renews, and which prices have crept up. Mark what you
  want to cancel to see your savings, track free trials, and add calendar reminders before anything renews.
  Unlike apps that connect to your bank account, it never asks for your bank login, and the page that reads your
  statement can't connect to the internet at all. Try it free on a sample statement; £4.99 once to use it on your own, with no subscription.
- **Category / tags:** Personal finance, Budgeting, Privacy, Productivity, Subscriptions
- **Pricing:** Free demo, £4.99 one-off to use on your own statements
- **Platforms:** Web, works on iPhone and Android (installable), offline
- **Images:** `og-image.png`, plus screenshots of the results and reminders screens
- **Maker comment / first post:** "I built this because every 'find your subscriptions' app wanted my bank login.
  This one works from a CSV you download yourself and runs entirely in your browser. You can turn your wifi off
  and it still works. I'd love to hear which bank you use, so I can make sure its export reads properly."
