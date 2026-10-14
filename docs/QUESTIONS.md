# Questions

Where the spec is silent or contradicts itself, I don't invent the answer: the question goes here with the safest reversible default, which is in force until you decide (CLAUDE.md). They come from a full audit of the spec by fresh reviewers, each finding checked by a second reviewer who tried to refute it; 24 findings were refuted and dropped.

**How to answer:** in the pull request, write the number and your choice ("Q4: use the library", "Q2: default OK"). Silence keeps the default.

Line numbers refer to `docs/huddlings-spec.md`.

## Decided

- **D1. The repository stays public**, and the spec and the master sheets are pushed to it. Founder, Oct 14, 2026.
- **D2. All rights reserved** for everything in the repository: the MIT license from the initial commit is replaced before the first push, so no pushed commit pairs the spec or the sheets with MIT. Founder, Oct 14, 2026. Counsel may want to confirm the wording of `LICENSE`.

## Needed before phase 1

### Q1. Which iPhone do you test on, and can an iPhone 12 be used to measure the budgets before Gate B?
- **The spec says:** L716 "at most 2 ms of CPU per frame on an iPhone 12"; L723 "Measured on a real iPhone before Gate B ... with the Lab's Diagnostics in a TestFlight build on the founder's iPhone".
- **Why it matters:** a pass on a newer iPhone does not prove the iPhone 12 budget, and Gate B needs the Performance row green.
- **Default:** I measure on your iPhone with the Lab's Diagnostics, record the model and the numbers in `LIMITATIONS.md`, and mark the budget "not yet verified on an iPhone 12", never "met". The Performance row runs by hand before each gate and each TestFlight build, with the JSON attached; per-change CI covers the web and simulator rows.
- **Owner:** founder

### Q2. Should the copy lint also refuse other forms of the banned words?
- **The spec says:** L85 and L1933, "A lint matches them as whole words, ignoring case". The list has `miss` and `missed`, `die`, `dying` and `dead`, but not `misses`, `missing`, `died`, `forget`, `hurrying`, `sadly` or `streaks`; notifications refuse `feed` and `treat` but not `fed` or `treats`.
- **Why it matters:** matched only as listed, "{mochi} misses you", "it died" or "Don't forget" pass. A reviewer read the list the other way: R7 spells out the forms it wants.
- **Default:** the lint also refuses the other forms, reported as "R7 (other form)": `misses, missing, lonelier, loneliest, loneliness, forget, forgets, forgetting, died, dies, sadder, saddest, sadly, sadness, starved, starves, hurries, hurried, hurrying, streaks, last chances`, and in notifications `hungrier, hungriest, hunger, peckishness, energetic, feeds, fed, feeding, treats, treated, treating`. Every string in the spec passes. Dropping the two lists in `tools/copylint/copylint.py` undoes it.
- **Owner:** founder

## Needed by Gate A (the dog's look)

### Q3. What does the dog use for the squeeze (`> <`) and sparkle eyes its sheets never draw, and how are the new hungry and huffy faces shown?
- **The spec says:** L452 "squeeze | the `> <` eyes of the kitty's and the bear's Excited"; L457 "sparkle | Sparkle (star highlight) | `show_off`, `celebrate`, proud"; L495 "ticklish | squeeze"; L504 "Add no fur details, markings, toes, claws or shapes the sheets do not show".
- **Why it matters:** the dog's eye states are open, happy crescent, closed, sleepy, surprised and side glance. Ticklish (core motion 9) and proud call for eyes the dog sheets don't have.
- **Default:** for the dog (and later the rabbit), squeeze maps to the happy crescents, as L482 already allows for excited, and sparkle maps to happy crescents with star particles beside the head, as the dog's Proud panel draws. At Gate A I also show a dog-style `> <` and star-highlight eye labelled "not on the dog sheet" so you can choose, and the hungry and huffy faces as labelled new drawings with no crop.
- **Owner:** founder

## Needed by Gate B (the dog alive on your iPhone)

### Q4. Can Gate B use temporary licensed sounds, since section 24 only asks for the sound set before Gate C?
- **The spec says:** L612 Gate B "passes when ... its sounds and haptics land on their frames"; L807 "Animate the demo first, with its first sounds and haptics (Gate B)"; L2199 "Mochi's sound set per species: a sound designer or a licensed library. Before Gate C."; L884 "never words and never generated (rule R8)"; L2140 M0: "a file-system audit finds no audio files."
- **Why it matters:** Gate B can't pass without sounds, and R8 forbids generated ones.
- **Default:** until you choose a designer or a library, Gate B uses a few recorded sounds under CC0 or a licence that allows editing and shipping inside an app, listed with their sources in `characters/dog/sounds/LICENSES.md` and marked temporary; your set replaces them at Gate C. The M0 file-system audit covers the app's writable folders (Documents, Library, tmp, the App Group), not its own bundled sounds.
- **Owner:** founder

## M1: Home alive

### Q5. Should the Little and Growing stages have fluffier tufts, when stages may only change scale channels?
- **The spec says:** L663 "Little is drawn at 88% of the Grown height with its head 6% larger, its eyes 4% larger and its tufts fluffier"; L1481 "nothing about the rig, the parts or the scenes changes between stages"; L441 "Nothing else scales".
- **Why it matters:** fluffier tufts need extra drawings per stage and view; every new person starts at Little.
- **Default:** Little and Growing use only the listed scales and the blush level, with the tufts unchanged. I ask again at the dog's Gate D.
- **Owner:** founder

### Q6. What are the VoiceOver labels for the ear, tail, paw and show-off touches, and for Hungry's "give the snack"?
- **The spec says:** L87 "Every touch and scene action is also a VoiceOver action."; L267 "Touches are custom actions (`Boop`, `Pat`, `Scratch chin`, `Tickle`, `Hug`)."
- **Why it matters:** only five labels exist; R9 needs all of them.
- **Default:** provisional strings, lint-clean, for your wording: `Touch an ear`, `Touch the tail`, `Hold out a paw`, `Show off`, `Give it the snack`. Hug's hold reuses `Hug`, Grumpy reuses `Boop` and `Pat`; waking needs no action of its own.
- **Owner:** founder

### Q7. Can you approve the copy the spec needs but never words?
- **The spec says:** L85 the lint covers "App Intent and widget titles"; L937 tiles with "a name, an emoji and three traits"; L1132 "with a link to Settings"; L984 "A small torch button"; L1133 a draft "which S3 offers next time"; L1453 "up to three given names are listed, then `and others`".
- **Why it matters:** each of these is on screen, and I may not invent copy silently.
- **Default:** these drafts, lint-clean, until you approve: species emoji 🐶 🐱 🐻 🐰; widget name `Huddlings` and description `Your Huddling on your Home Screen.`; boop intent title `Boop your Huddling`, hidden from Shortcuts; the Settings link `Open Settings`; the torch `Light`; the draft offer `Use your last recording?` with `Use it` and `Delete`; one failure line for server errors not already covered, `That didn't go through. Try again.`; names joined with commas, as in `Sam, Ana, Leo and others`.
- **Owner:** founder

### Q8. What happens when the yearly teen re-check, or Apple's monthly age-range check, disagrees with the stored age band?
- **The spec says:** L1723 "Once a year, the app asks a teen the age question again (on iOS 26, Apple's age range is checked again at launch once a month)"; L2343 only `register` carries `ageBand`.
- **Why it matters:** no call can change the band the server uses for the teen word list, and an under-13 answer from an existing account is a COPPA question.
- **Default:** the phone keeps the date of the last check, and `set_device` takes an optional `ageBand`: adult to teen applies at once, teen to adult only after a fresh check. An under-13 answer shows the stop screen, stops sending and receiving, deletes the account and local data, and sets the 24-hour lockout. Counsel to confirm.
- **Owner:** founder with counsel

## M2: Treats

### Q9. What are the `{aFood}` and `{aRealFood}` forms for the twelve foods?
- **The spec says:** L980 "`{aFood}` (a banana, an apple, grapes), `{aRealFood}` (a real banana, real grapes) and `{Food}` (Banana, Grapes)".
- **Why it matters:** only five forms are given, and "a real broccoli" is exactly the wrong reading the spec warns about.
- **Default:** a banana, an apple, an orange, a carrot, a strawberry, grapes, a watermelon, a pineapple, an avocado, broccoli, a pumpkin, a coconut; with "a real" or "real" in front (real grapes, real broccoli). Added to the catalogue at the start of M2 for your approval.
- **Owner:** founder

## M3: sending, the trip, Giggle and Hug

### Q10. Can you provide the accounts and assets section 24 doesn't list?
- **The spec says:** L1169 links live at `https://huddlings.app/p/{token}`; L1221 "`{safetyEmail}`, safety@huddlings.app"; L2099 "TelemetryDeck or PostHog"; L1514 "the small Huddlings mark". Nothing describes the app icon.
- **Why it matters:** links, universal links, the preview spike and the safety address need the domain and a watched mailbox; analytics need an account; every TestFlight upload needs an app icon.
- **Default:** the domain and the safety address are single configuration values; the M3 spikes run on the edge host's default subdomain and the M1 Safari spike on a temporary HTTPS host. Until your icon arrives, a placeholder drawn in code from the dog's parts (never sheet pixels), marked as a placeholder. Needed: the domain and DNS (M3), Supabase staging and production (M3), the safety mailbox and who watches it (M3), a channel to alert you about reports (M3), the analytics account (before the beta), the final icon (before any external build), the Huddlings mark (M7).
- **Owner:** founder

### Q11. How long may a reported voice note's audio be kept, given R2 promises deletion within a week?
- **The spec says:** L80 "deleted from the server within a week of being opened, or after a week if nobody opens it"; L1763 reports are "kept 30 days after review, with its audio copy".
- **Why it matters:** a reported note's sound could stay about 31 days, which breaks R2 and makes `What {mochi} hears` untrue.
- **Default:** the review copy of the audio is deleted no later than the item itself would have been; the report row stays 30 days without audio. If counsel needs longer, the privacy copy changes first.
- **Owner:** founder with counsel

### Q12. Are the "before the beta" legal items also due before the optional early test after M3?
- **The spec says:** L2136 "a dog-only TestFlight build with Giggle and Hug, given to 20 people"; L2193 "The Terms and the Privacy policy. Before the beta."; L1914 Terms "ship with the first send (rule P10)".
- **Why it matters:** outsiders would record and send before the Terms, the Privacy policy and the consent wording exist.
- **Default:** every outsider-facing legal item is due before the first build that reaches anyone but you; until then M3 builds go to internal testers only.
- **Owner:** founder with counsel

### Q13. Should a returning person be able to restore their Huddling before hatching, and what happens to what a new local Mochi earned when sign-in swaps in the server's?
- **The spec says:** L1694 "the server's Mochi wins and replaces the local one, so nothing earned is ever lost (rule R3)".
- **Why it matters:** after a reinstall the person hatches a new Mochi, feeds it, and at the first send it is silently replaced, losing what it found.
- **Default:** keep the server's species and name; `register` replays the local treats onto the server Mochi by the normal rules, so growth and keepsakes never go down and the first banana is never given twice. Whether S0a or S0b offers "restore with Apple" is your call.
- **Owner:** founder

### Q14. Should a souvenir's laugh play aloud with the silent switch on, and when does `mark_shown` run?
- **The spec says:** L1443 "`home_laugh` ... and the laugh plays"; L885 Mochi's sounds "respect the silent switch"; L1457 "When the show has played, the app marks it shown".
- **Why it matters:** on a silenced phone the laugh would play silently and then be gone for good, which defeats "Get their laugh back".
- **Default:** souvenir sounds play like voice notes (the playback session, aloud with the silent switch on); `mark_shown` runs only after the sound has finished, and a show cut short replays next time.
- **Owner:** founder

### Q15. What should closing an unplayed link note say, since "It can't be opened again" is not true for links?
- **The spec says:** L1392 "`Close this note? It can't be opened again.`"; L1380 opening a link again "shows the note again".
- **Why it matters:** the warning would be false for links (R6).
- **Default:** the veil shows only for direct visits and replies; an unplayed link note closes without it.
- **Owner:** founder

### Q16. How does "Send your voice. Get their laugh back." join the share texts?
- **The spec says:** L40 "The line for the App Store and every share"; L1164 the link share text is `{mochi} is bringing you something from {sender}.`; L1545 a Mochi Cam share is `Made with {mochi} on Huddlings`.
- **Why it matters:** "every share" suggests it is added to both, but neither share text includes it.
- **Default:** the share texts stay as section 9 and 13 give them; the line is used on the App Store. It is in the catalogue as `share.tagline`.
- **Owner:** founder

## M4: every scene

### Q17. In Secret Agent, in what order do the ear, the payoff and the voice happen, given that the proximity sensor turns the screen off?
- **The spec says:** L1288 "holding the phone to the ear (the proximity sensor) is the action"; L1386 the voice "starts by itself after the payoff, except in Secret Agent, which waits for the ear".
- **Why it matters:** on the ear path the payoff would play on a dark screen, then wait for an ear that is already there.
- **Default:** proximity monitoring starts at the Wait beat. Ear path: covering the sensor completes the action and the voice starts in the earpiece at once; lowering pauses, raising resumes. Speaker path: the payoff plays visibly, then the voice starts on the loudspeaker.
- **Owner:** founder

## M7: Mochi Cam

### Q18. Does an interruption delete the partial clip (rule C3) or open it in S8a (step 7)?
- **The spec says:** L1524 "deleted after Share, Save or Delete, after an interruption"; L1546 "If the app is still in memory, what was recorded so far opens in S8a".
- **Default:** follow C3, the hard rule: any interruption discards the partial clip.
- **Owner:** founder

### Q19. Can you approve a microphone permission text that covers Mochi Cam?
- **The spec says:** L1876 "`Huddlings uses the microphone only when you tap to record, laugh or clap.`"; L1606 Mochi Cam listens "while the camera is open".
- **Default:** a draft `perm.micCam` for M7: `Huddlings uses the microphone only when you tap to record, laugh or clap, and while Mochi Cam is open. Nothing leaves your phone unless you send or share it.`
- **Owner:** founder

### Q20. Should the M7 Settings text also change its camera sentence?
- **The spec says:** L2048 `settings.hears.bodyCam` is "The same, with its first sentence as: ...", so it keeps "The camera only looks for the treat you chose and keeps no picture."
- **Why it matters:** once Mochi Cam films, that sentence is untrue (R6).
- **Default:** the catalogue follows the spec as written until you decide, before M7.
- **Owner:** founder

## Engineering decisions taken

Decided by me under CLAUDE.md ("decide everything else and note it"). Tell me if you disagree.

- **E1. No sheet pixels in any build.** The sheet overlay lives only in the web Lab, run from the repository and never hosted. The iOS Lab and its Diagnostics compile only into an internal configuration for your internal TestFlight group; external builds (the early test, the beta) have no Lab. A CI check fails if anything from `characters/reference/` or `characters/*/ref/` reaches the app. (Spec L121, L668, L678 against L172 and R8.)
- **E2. The touch path the gates need moves into M0.** Phase 5 builds hit testing on each part's outline, the boop, pat, chin scratch, tickle and hug recognisers with the section 6 thresholds, the controller calls the core motions need and the FX player; the rest of section 6 stays in M1. (L610, L733 against L808 and L2126.)
- **E3. Visual QA's Twinning check covers ears, paws and limbs, not the eyes** (both eyes must aim at one point, which the Face check covers), and the Life check's 8 s blink timer runs only while the eyes are open, so a long pat with closed eyes is not a failure. No threshold is loosened. (L697, L704.)
- **E4. QA thresholds get explicit floors** in a versioned `qa/thresholds.json`: Snaps needs both the 4× ratio and an absolute speed; "still" for Dead holds is measured on clip channels without the always-on layers; Even spacing applies to bone channels, not to travel along a path. Each check is proven by a clip with a planted failure. (L695, L696, L699.)
- **E5. "Sleep" is the lie posture with closed eyes** and sleep breathing, as L903 and the Sleepy panels show; a curled pose is yours to ask for later.
- **E6. The M0 hatch skeleton runs only in internal builds**; the age screen (R12) lands in M1, before anything reaches anyone else.
- **E7. "Away" for the greeting means the app was in the background**; veils inside the app don't count. On return one queue runs when Home is calm: waking, the greeting, a pending treat or departure, `stage_up`, arrivals and shows oldest first, hints. (L129, L909, L933.)
- **E8. Report review tooling (M3):** reports record the reported person and a severity set at review; service-only functions uphold, dismiss and lift a pause; the audio copy sits in a private bucket and follows Q11; a scheduled check alerts you about reports older than a few hours, through the channel in Q10.
- **E9. Link souvenirs and `Add {name}` survive a link's expiry (M3):** the Appendix B cascades that would delete unshown souvenirs and break `add_friend` on day 7 are changed, with contract tests. (L1759, L1366, L2305, L2367.)
- **E10. Mochi's own sounds are muted while anything records** (S3, scene sound paths, Mochi Cam), so they never end up in a voice note; haptics and motion continue.
- **E11. The send flow gets a back step**, and closing it keeps what was recorded or typed as the one draft; only `Delete` discards it. When the recipient is fixed (a reply, the friend's envelope), S3c shows only that person.
- **E12. Analytics carry what the beta targets need** (L2105 to L2111): a salted hash of the visit id on visit and souvenir events, the scene path from the web's calls, and a daily job that keeps per-day totals before rows expire. Still no content and no counts shown to anyone.
- **E13. Catalogue keys I named** where the spec's table combines several strings: `treats.wearPlural`, `treats.takeOffPlural`, `report.reasons.*`, `prop.*`, `species.*`, `share.tagline`, `note.speed.*`; the speeds use "×", as sections 11, 14 and 22 write them.

## From the spec (section 24)

Unchanged, with where each stands. Owners and defaults are the spec's.

| Question | Default until decided | Owner | Needed by |
| --- | --- | --- | --- |
| Trademark search for Huddlings | Huddlings | founder | the beta |
| Grumpy and Hungry in the first update instead | in the beta | founder | the M4 gate |
| Should link visits always run, whatever the energy | no | founder | two beta weeks |
| Energy numbers (cost 15, thresholds 40 and 15, trot 15 min, walk 60 min, treat 35) | launch-test settings | product | two beta weeks |
| Voice notes up to 5 minutes, web replies up to 2 | as specified | founder | after the beta |
| Teens in states with app store accountability laws | Apple's age range wherever available | founder with counsel | the beta |
| The Terms and the Privacy policy | none (see Q12) | founder with counsel | the beta (see Q12) |
| The edge host for the visit page | Cloudflare Workers or similar | engineering, approved by the founder | M3 |
| Recording consent wording | as specified | founder | the beta (see Q12) |
| Moderation: hand review in the beta, a service before launch | hand review | founder | public launch |
| The word list's source and the teen list | none | founder | M3 |
| The twelve foods after the recognition test | the twelve | engineering, approved by the founder | M2 |
| Mochi's sound set per species | none (see Q4) | founder | Gate C (see Q4) |
| Build environment for iOS and the Apple Developer account | the macOS runner | founder | phase 1 (`PLAN.md`) |
| Each companion's marking map | proposed at Gate A | founder | each Gate A |
| The shared collar blue | `#7DB7E8` | founder | the dog's Gate A |
| The early test after M3 | decided at the M3 gate | founder | the M3 gate |
| Counsel on the character art | none | founder | the beta |
