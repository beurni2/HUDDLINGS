# Questions

Where the spec is silent or contradicts itself, I don't invent the answer. The question goes here with the safest reversible default, which holds until you decide (CLAUDE.md). Most come from a review of the whole spec by fresh reviewers, each finding checked by a second reviewer who tried to refute it; where each entry came from is listed in `qa/phase0/spec-audit.md`. Where the copy catalogue holds a string a question may change, it keeps the spec's own text until you answer.

**How to answer:** in the pull request, write the number and your choice ("Q4: use the library", "Q3: default OK"). Silence keeps the default. Line numbers (L) refer to `docs/huddlings-spec.md`.

## Decided

- **D1. The repository stays public**, and the spec and the master sheets are pushed to it. Founder, Oct 14, 2026.
- **D2. All rights reserved** for everything in the repository. The MIT license from the initial commit is replaced in the first commit of this branch, so no pushed commit pairs the spec or the sheets with MIT. Founder, Oct 14, 2026. Counsel may want to confirm the wording of `LICENSE`.

### Q24. Where the dog's sheet paints colours its printed palette doesn't have, do I draw what it paints?
- **The spec says:** L189 "The dog and rabbit values are their sheets' printed labels"; L181 "Markings | tan `#D9A379`: ears, head and body patches, tail"; L184 "Dark | `#3A2314`: eyes, nose"; L183 "Pink | `#F7B3A6`: blush, tongue"; L507 "one soft shade (the fill 8–12% darker ...)"; L504 "Each part's silhouette, the eye size and spacing ... match the sheet"; L524 the palette check, each region's dominant colour within ΔE2000 3 of the palette.
- **Why it matters:** measured on the turnaround and the hero (`characters/dog/DECISIONS.md` 17 and 18; `ref/overlays/palette.png`, `markings-colours.png`), five colours are far from the printed values. The pupils and upper iris are near-black `#200C02`, 8.5 to 9.6 from `#3A2314`; the nose is near-black too, 14.6 and 8.8 from `#3A2314` in the front and side views (4.2 in the three-quarter, which carries a large shine), `#200C02` matching the side's nose (0.4) and the front's darker still (8.1); `#3A2314` is nearest the lighter lower iris in the front view (2.8; 5.4 and 8.0 in the side and three-quarter views). The head patches are a paler tan, `#F0BC92`, 6.3 to 7.7 from `#D9A379`, which the ears (2.8 to 2.9) and the saddle (2.3 to 3.7 on the master sheet, up to 4.5 on the motion sheet) do match. The fur's soft shade is a warmer hue, `#FDE3C8`, 6.2 to 7.5 from the printed Soft Shadow, which is the fur × 0.91, exactly L507's rule (the printed value matches the sheet's ground shadow instead). The tongue is a deeper `#FB9A88`, 6.9 to 9.5 from the pink. The open mouth's inside has no printed value: `#9E241A` in the front view, `#69190C` in the three-quarter. Drawn in the printed values, the eyes look browner, the face patches darker and the tongue paler than the sheet's.
- **Decided: the default.** Draw what the sheet paints. `model.json` keeps the printed palette and holds the five values sampled on the front view beside it (`palettePainted`), each for its own region only. The palette check holds each region to one value at ΔE2000 3, never to whichever entry is nearest. What changes is that value: the pupils, the upper iris, the nose, the head patches, the fur's shade and the tongue are held to the sampled colours, and drawn in the printed ones they would fail. Gate A shows each view beside its turnaround crop, so the colours are judged by eye there too.
- **Answered:** founder, Oct 14, 2026, in the session: "Q24 default".

### Q25. The palette check would fail the sheet's own blush. May I check the blush as a level?
- **The spec says:** L474 "Blush: 0 to 100%; its resting level deepens a little with each stage"; L524 "the dominant colour of each region: ... blush ... ΔE2000 of 3 or less against the palette".
- **Why it matters:** the blush is the printed `#F7B3A6` at a level over the fur (L474). On the turnaround's cheeks it rests at 29 to 43%, about 35% (`DECISIONS.md` 19), so the cheek's dominant colour is about `#FCDDD1`, 12 from `#F7B3A6`: checked as L524 words it, the sheet's own blush fails. Checking the blush part's colour alone would never look at a render, and a wrong level, blend or missing blush would pass, which narrows a check (as Q3 does for four others).
- **Decided: the default.** Check it in two parts, on every render: the blush part's own colour within ΔE2000 3 of `#F7B3A6`, and the rendered cheek's level, fitted the same way `characters/refprep/palette.py` fits the sheet's, within the sheet's own spread at rest (29 to 43%) and at the level each clip asks for otherwise. Not a dominant colour against a composite: on a soft blush that is ill-defined, and at ΔE 3 it fails the sheet's cheeks too. `model.json` holds the resting level and the sheet's spread (`blush`).
- **Answered:** founder, Oct 14, 2026, in the session: "Q25 default".

## Needed before phase 1

### Q1. Which iPhone will measure the speed budgets?
- **The spec says:** L716 "at most 2 ms of CPU per frame on an iPhone 12"; L723 "Measured on a real iPhone before Gate B"; L2141 (M1) "60 fps on an iPhone 12 with device motion running"; L2143 (M3) "a link opens on the web on an iPhone 12 in Safari over slow 4G".
- **Why it matters:** a pass on a newer iPhone does not prove the iPhone 12 budget, and the M1 and M3 gates name an iPhone 12.
- **Default:** until you tell me, Gate B is judged on whichever iPhone you test TestFlight builds on, and the iPhone 12 budget is marked "not yet verified" in `LIMITATIONS.md`, never "met". An iPhone 12, owned or borrowed, is needed by the M1 gate. Telling me your iPhone's model and iOS version (`PLAN.md`, item 5) helps me set the measurements up.
- **Owner:** founder

## Needed by Gate A (the dog's look)

### Q2. What does the dog use for the squeeze (`> <`) and sparkle eyes its sheets never draw?
- **The spec says:** L452 "squeeze | the `> <` eyes of the kitty's and the bear's Excited"; L457 "sparkle | Sparkle (star highlight) | `show_off`, `celebrate`, proud"; L495 "ticklish | squeeze"; L504 "Add no fur details, markings, toes, claws or shapes the sheets do not show".
- **Why it matters:** the dog's eye states are open, happy crescent, closed, sleepy, surprised and side glance. Ticklish (core motion 9) and proud call for eyes the dog sheets don't have.
- **Default:** for the dog (and later the rabbit), squeeze becomes the happy crescents, as L482 already allows for excited, and sparkle becomes happy crescents with star particles beside the head, as the dog's Proud panel draws. At Gate A I also show a dog-style `> <` and star eye, labelled "not on the dog sheet", so you can choose.
- **Owner:** founder

### Q26. The sheets draw one catchlight in each eye; the spec asks for two or three. Which do I follow?
- **The spec says:** L446 "each eye (... two or three catchlights ...)"; L509 "one large catchlight high on the side toward the nose and one or two small ones, placed as the sheets draw them"; L504 "The sheet is the model".
- **Why it matters:** the dog's turnaround, hero, glossy-eyes panel and expression sheet each draw one catchlight per open eye. A second small one makes the eyes glossier but less like the sheet.
- **Default:** one catchlight, as the sheets draw it (`characters/dog/DECISIONS.md` 29). Adding the small ones is one line per eye.
- **Owner:** founder

### Q27. Two choices in the Faces check: how to hold faces whose panels turn the head, and whether an open mouth passes as cheeky
- **The spec says:** L525 holds each face preset to "its expression-sheet panel" by "the landmark check on eyes and mouth"; L480-498 name Curious, Shy, Sleepy and Mischievous as those panels; a face preset keeps the front's head (the lead's decision for the Faces check).
- **Why it matters:** (a) Both Curious panels, the only Shy and both Sleepy panels turn the head: their eyes sit 3.0 to 5.1 pt across from where the front puts them. Held by place against the nose, a correct curious or shy face on the front's head failed by 5 to 6 pt and could pass only with its eyes slid against its nose. (b) The master sheet's Cheeky, the lead's choice for mischievous and sly, draws the tongue out over a closed smile; the expression sheet's Mischievous draws an open mouth with the tongue in it. Every shape gate lets an open mouth pass Cheeky's mouth; only the share of deep red inside the mouth tells them apart (Cheeky 0.14, the open mouths 0.35 to 0.40, Mischievous 0.27, the face library's cheeky still 0.32).
- **Default:** (a) each keeps its own panel, recorded as turned, where the eyes are held by their shapes and their spacing and their place is held on the render's own head; the alternative is to hold curious and shy to the master sheet's Happy, level and front-on, as proud is held to Content (sleepy has no level panel with closed eyes). (b) an open mouth may pass mischievous and sly; the deep-red share is reported in every mouth row and judged by eye. A gate on it would fail the expression sheet's own Mischievous and the face library's cheeky mouth. (`characters/dog/DECISIONS.md` 110 and 118.)
- **Owner:** founder

## Needed by phase 4 (the rig and Visual QA)

### Q3. As the spec words them, four Visual QA checks would fail good animation. May I narrow them?
- **The spec says:** L697 Twinning: "left and right parts (ears, paws, eyes) follow the same curve ... for more than 300 ms"; L704 Life: "8 s pass awake without a blink"; L695 Snaps: "a bone's angular speed jumps above 4× its 3-frame average"; L696 Even spacing: "a moving bone keeps a constant speed (within 5%) for more than 6 frames".
- **Why it matters:** CLAUDE.md says never to loosen a check without asking. Each change below makes its check flag less often:
  1. **Twinning:** leave out the eyes. Both eyes always aim at one point, and the Face check still catches crossed eyes.
  2. **Life:** pause the 8 s blink timer while the eyes are closed, for example during a long, contented pat.
  3. **Snaps:** flag a jump only when it is 4× faster and also above a minimum speed. From stillness the average is zero, so any start of a move would be a "snap".
  4. **Even spacing:** don't apply it to travel across the hill. Sliding paws, straight paths and the body's own bones still check the gaits.
- **Default:** the checks run and block as the spec words them. If one blocks motion that looks right, I stop and show you the frames with my reading, rather than loosening it.
- **Owner:** founder

## Needed by Gate B (the dog alive on your iPhone)

### Q4. Can Gate B use temporary licensed sounds?
- **The spec says:** L612 Gate B "passes when ... its sounds and haptics land on their frames"; L807 "Animate the demo first, with its first sounds and haptics (Gate B)"; L2199 "Mochi's sound set per species: a sound designer or a licensed library. Before Gate C."; L884 "never words and never generated (rule R8)".
- **Why it matters:** Gate B can't pass without sounds, R8 forbids generated ones, and the sound set is only due a gate later.
- **Default:** until you choose a designer or a library, Gate B uses a few recorded sounds under CC0 or a licence that allows shipping inside an app, listed with their sources in `characters/dog/sounds/LICENSES.md` and marked temporary. Your set replaces them at Gate C.
- **Owner:** founder

## M1: Home alive

### Q5. Is "sleep" its own curled posture, or the lie posture with closed eyes?
- **The spec says:** L533 "Postures are sit ..., stand ..., lie (chin on paws, as the Sleepy panels), sleep (curled) and upright"; L903 "Mochi is asleep on its perch when you arrive (`lie_down`, then `idle_sleep`)"; L232 lists no transition into a sleep posture.
- **Why it matters:** the spec asks for a curled sleep, but no dog sheet draws one and no transition leads to it. A curled pose would be a new drawing for each species.
- **Default:** sleep is the lie posture with closed eyes and sleep breathing, as L903 describes. The curled pose is deferred until you decide, by the dog's Gate D.
- **Owner:** founder

### Q6. Should the Little and Growing stages have fluffier tufts, when stages may only change scale?
- **The spec says:** L663 "Little is drawn at 88% of the Grown height with its head 6% larger, its eyes 4% larger and its tufts fluffier"; L1481 "nothing about the rig, the parts or the scenes changes between stages"; L441 "Nothing else scales".
- **Why it matters:** fluffier tufts need extra drawings per stage and view, and every new person starts at Little.
- **Default:** Little and Growing change only the listed sizes and the blush, with the tufts unchanged. I ask again at the dog's Gate D.
- **Owner:** founder

### Q7. What are the VoiceOver labels for the ear, tail, paw and show-off touches, and for Hungry's snack?
- **The spec says:** L87 "Every touch and scene action is also a VoiceOver action."; L267 "Touches are custom actions (`Boop`, `Pat`, `Scratch chin`, `Tickle`, `Hug`)."
- **Why it matters:** only five labels exist; rule R9 needs all of them.
- **Default:** these drafts, for your wording: `Touch an ear`, `Touch the tail`, `Hold out a paw`, `Show off`, `Give it the snack`. Hug's hold reuses `Hug`, and Grumpy reuses `Boop` and `Pat`.
- **Owner:** founder

### Q8. Can you approve the copy the spec needs but never words?
- **The spec says:** L85 the lint covers "App Intent and widget titles"; L937 tiles with "a name, an emoji and three traits"; L1132 "with a link to Settings"; L984 "A small torch button"; L1133 a draft "which S3 offers next time"; L1453 "up to three given names are listed, then `and others`".
- **Why it matters:** each of these is on screen, and I may not invent copy silently.
- **Default:** these drafts until you approve them: species emoji 🐶 🐱 🐻 🐰; widget name `Huddlings` and description `Your Huddling on your Home Screen.`; boop action title `Boop your Huddling`, hidden from Shortcuts; the Settings link `Open Settings`; the torch `Light`; the draft offer `Use your last recording?` with `Use it` and `Delete`; one line for server errors not already covered, `That didn't go through. Try again.`; names joined as in `Sam, Ana, Leo and others`.
- **Owner:** founder

### Q9. What happens when a later age check disagrees with the stored age band?
- **The spec says:** L1723 "Once a year, the app asks a teen the age question again (on iOS 26, Apple's age range is checked again at launch once a month)". Only the sign-in call sets the account's band (L2343); the device call has no band (L2344), and the bands sent with web visits are a reader's own (L1758).
- **Why it matters:** nothing can update the band the server uses for the teen word list, and an under-13 answer from an existing account is a COPPA question.
- **Default:** the app can update the band later: adult to teen at once, teen to adult only after a new check. An under-13 answer shows the stop screen, deletes the account and the data on the phone, and starts the 24-hour lockout. Counsel to confirm.
- **Owner:** founder with counsel

## M2: Treats

### Q10. What are the "a banana" and "a real banana" forms for the twelve foods?
- **The spec says:** L980 "`{aFood}` (a banana, an apple, grapes), `{aRealFood}` (a real banana, real grapes) and `{Food}` (Banana, Grapes)".
- **Why it matters:** only five forms are given, and "a real broccoli" is exactly the wrong reading the spec warns about.
- **Default:** a banana, an apple, an orange, a carrot, a strawberry, grapes, a watermelon, a pineapple, an avocado, broccoli, a pumpkin, a coconut; and with "real" (a real banana, real grapes, real broccoli). Added to the catalogue at the start of M2.
- **Owner:** founder

## M3: sending, the trip, Giggle and Hug

### Q11. Can you provide the accounts and assets section 24 doesn't list?
- **The spec says:** L1169 links live at `https://huddlings.app/p/{token}`; L1221 "`{safetyEmail}`, safety@huddlings.app"; L2099 "TelemetryDeck or PostHog"; L1514 "the small Huddlings mark". Nothing describes the app icon.
- **Why it matters:** links and the preview spike need the domain; reports need a watched mailbox; every TestFlight upload needs an app icon.
- **Default:** the domain and the safety address are single settings. The M3 spikes run on the edge host's own subdomain, and the M1 Safari spike on a temporary HTTPS host. Until your icon arrives, a placeholder drawn in code from the test character's plain shapes (the dog's parts after Gate A), never sheet pixels. Needed: the domain and its DNS and Supabase staging and production (M3); the safety mailbox, who watches it, and a channel to alert you about reports (M3); the analytics account (before the beta); your icon (before any build reaches anyone but you); the Huddlings mark (M7).
- **Owner:** founder

### Q12. How soon should I alert you about a report nobody has reviewed?
- **The spec says:** L1220 "Review: by hand during the beta, every report within 24 hours."
- **Default:** after 4 hours, through the channel in Q11.
- **Owner:** founder

### Q13. How long may a reported voice note's audio be kept, given R2 promises deletion within a week?
- **The spec says:** L80 "deleted from the server within a week of being opened, or after a week if nobody opens it"; L1763 reports are "kept 30 days after review, with its audio copy".
- **Why it matters:** a reported note's sound could stay about 31 days, which breaks R2 and makes `What {mochi} hears` untrue.
- **Default:** the review copy of the audio is deleted no later than the item itself would have been, and the report stays 30 days without audio. If counsel needs longer, the privacy copy changes first.
- **Owner:** founder with counsel

### Q14. Are the "before the beta" legal items also due before the optional early test after M3?
- **The spec says:** L2136 "a dog-only TestFlight build with Giggle and Hug, given to 20 people"; L2193 "The Terms and the Privacy policy. Before the beta."; L1914 Terms "ship with the first send (rule P10)".
- **Why it matters:** outsiders would record and send before the Terms, the Privacy policy and the consent wording exist.
- **Default:** every outsider-facing legal item is due before anyone but you uses a build, and drafts are enough until then; M3 builds go only to your own Apple IDs.
- **Owner:** founder with counsel

### Q15. Should a returning person be able to restore their Huddling before hatching a new one?
- **The spec says:** L1694 "If the Apple ID already has a Mochi on the server (a reinstall or a new phone), the server's Mochi wins and replaces the local one, so nothing earned is ever lost (rule R3)".
- **Why it matters:** after a reinstall the person hatches a new Mochi, feeds it, and at the first send it is silently replaced.
- **Default:** no restore step before hatching, as the spec has it. At sign-in the server's Mochi wins, and the foods the new one found are added to it, so growth and keepsakes never go down and the first banana is never given twice.
- **Owner:** founder

### Q16. Should a souvenir's laugh play aloud when the silent switch is on?
- **The spec says:** L1443 "`home_laugh` ... and the laugh plays"; L885 Mochi's sounds "respect the silent switch"; L1617 voice notes play "even with the silent switch on".
- **Why it matters:** on a silenced phone the laugh would play silently and then be gone for good, which defeats "Get their laugh back".
- **Default:** souvenir sounds play like voice notes, aloud with the silent switch on.
- **Owner:** founder

### Q17. What should closing an unplayed link note say, since "It can't be opened again" is untrue for links?
- **The spec says:** L1392 "`Close this note? It can't be opened again.`"; L1380 opening a link again "shows the note again".
- **Default:** the question shows only for direct visits and replies; an unplayed link note closes without it.
- **Owner:** founder

### Q18. Does "Send your voice. Get their laugh back." go into the share texts?
- **The spec says:** L40 "The line for the App Store and every share"; L1164 the link's share text is `{mochi} is bringing you something from {sender}.`; L1545 Mochi Cam's is `Made with {mochi} on Huddlings`.
- **Default:** the share texts stay as sections 9 and 13 give them, and the line is used on the App Store. It is in the catalogue as `share.tagline`, marked for the store.
- **Owner:** founder

### Q19. May beta analytics link the events of one visit?
- **The spec says:** L2071 "Events carry no content"; L2105 and L2111 targets need "link visits opened by someone within 48 h" and "median openers per link visit"; no event carries a visit id.
- **Why it matters:** a visit joins a sender and a recipient, so a shared visit code links two people's events at the analytics company.
- **Default:** nothing new leaves our server. A daily job on our server works those targets out from its own tables before rows expire, and sends only the day's totals.
- **Owner:** founder with counsel

## M4: every scene

### Q20. In Secret Agent, in what order do the ear, the payoff and the voice happen?
- **The spec says:** L1288 "holding the phone to the ear (the proximity sensor) is the action"; L1386 the voice "starts by itself after the payoff, except in Secret Agent, which waits for the ear".
- **Why it matters:** the proximity sensor turns the screen off at the ear, so the payoff would play on a dark screen and then wait for an ear that is already there.
- **Default:** ear path: raising the phone completes the action and the voice starts in the earpiece at once; lowering pauses, raising resumes. Speaker path: the payoff plays, then the voice starts on the loudspeaker.
- **Owner:** founder

## M7: Mochi Cam

### Q21. Does an interruption delete the partial clip (rule C3) or open it (step 7)?
- **The spec says:** L1524 "The temporary copy is deleted after Share, Save or Delete, after an interruption"; L1546 "If the app is still in memory, what was recorded so far opens in S8a".
- **Default:** follow C3, the hard rule: any interruption discards the partial clip.
- **Owner:** founder

### Q22. Can you approve a microphone permission text that covers Mochi Cam?
- **The spec says:** L1876 "`Huddlings uses the microphone only when you tap to record, laugh or clap.`"; L1606 Mochi Cam listens "while the camera is open".
- **Default:** a draft for M7: `Huddlings uses the microphone only when you tap to record, laugh or clap, and while Mochi Cam is open. Nothing leaves your phone unless you send or share it.`
- **Owner:** founder

### Q23. Should the M7 Settings text also change its camera sentence?
- **The spec says:** L2048 the M7 text is "The same, with its first sentence as: ...", so it keeps "The camera only looks for the treat you chose and keeps no picture."
- **Why it matters:** once Mochi Cam films, that sentence is untrue (R6).
- **Default:** from M7 that sentence is replaced by the spec's own M7 camera text (L2056); the catalogue keeps the spec's text until then: `Huddlings uses the camera to spot the treat you chose for your Huddling, and to film with Mochi Cam when you open it. No picture is kept unless you save or share a video.`
- **Owner:** founder

## Engineering decisions taken

Decided by me under CLAUDE.md ("decide everything else and note it"). Tell me if you disagree.

- **E1. No sheet pixels in any build.** The sheet overlay lives only in the web Lab, run from the repository and never hosted. The iOS Lab and its Diagnostics compile only into an internal build for your internal TestFlight group; external builds have no Lab. A CI check fails if anything from `characters/reference/` or `characters/*/ref/` reaches the app. (L121, L668, L678 against L172 and R8.)
- **E2. The touch path the gates need moves into M0.** Phase 5 builds hit testing, the boop, pat, chin scratch, tickle and hug recognisers with the section 6 thresholds, the controller calls the core motions need and the FX player; the rest of section 6 stays in M1. (L610, L733 against L808 and L2126.)
- **E3. Dead holds measure stillness on the clips' own motion,** leaving out breathing and micro-motion, so the check cannot be passed by the life layer alone. This makes it stricter. (L699, L563.)
- **E4. The M0 hatch skeleton runs only in internal builds**; the age screen (R12) arrives in M1, before anything reaches anyone else.
- **E5. "Away" for the greeting means the app was in the background**; screens inside the app don't count. On return, one queue runs when Home is calm: waking, the greeting, a pending treat or departure, `stage_up`, arrivals and shows oldest first, hints. (L129, L909, L933.)
- **E6. Report review tooling (M3):** reports record the reported person and a severity set at review; only server tools can uphold, dismiss or lift a pause; the audio copy sits in a private bucket and follows Q13.
- **E7. Link souvenirs and `Add {name}` survive a link's expiry (M3).** The cascades in Appendix B (L2308, L2311) would delete unshown souvenirs with the link on day 7, and L2284 would cut a reply off from its link, which `add_friend` needs (L2367). Both change, with contract tests.
- **E8. Mochi's own sounds are muted while anything records** (S3, scene sound paths, Mochi Cam), so they never end up in a voice note; haptics and motion continue.
- **E9. The send flow gets a back step**, and closing it keeps what was recorded or typed as the one draft; only `Delete` discards it. When the recipient is fixed (a reply, a friend's envelope), S3c shows only that person.
- **E10. A souvenir is marked shown only after its sound has finished;** a show cut short plays again next time. (L1457.)
- **E11. The copy lint also refuses other forms of the R7 words** (misses, missing, died, forget, hurrying, sadly, streaks and so on; in notifications also hunger, fed, feeding, treats). The spec lists exact words; refusing their other forms is my stricter choice, and no string in the spec is affected. Tell me if you want only the exact listed words.
- **E12. The M0 file-system audit covers the app's writable folders** (Documents, Library, tmp, the App Group). The spec says "no audio files" (L2140), but Mochi's own sounds ship inside the app; the audit is about recordings.
- **E13. Catalogue keys I named** where the spec's table combines several strings: `treats.wearPlural`, `treats.takeOffPlural`, `report.reasons.*`, `prop.*`, `species.*`, `share.tagline`, `note.speed.*`. The speeds use "×", as sections 11, 14 and 22 write them.

From phase 1 (the runtimes), E14 to E19 and E21 pinned in `characters/format/README.md` and E20 in `tools/qa/parity.py`. E14 to E17 are held by tests in both runtimes, E18 by the parity check, E19 by the build's validator, E20 by the parity check's tests, and E21 by a probe on the simulator:

- **E14. A bone's squash or scale never changes its children's size or shape.** It moves where they attach, and scales only its own parts. So breathing lifts the head without growing it, and a squashed body never skews a tilted head (5b: heads stay rigid). The root's scale, the companion's perspective, still scales everything.
- **E15. Springs never stop dead at a limit.** A spring driven past its room eases into the limit and swings back out, and it never changes the motion a clip keys. A jump (a view swap, a cut in a clip) moves a part without flinging its spring. (5b: overshoot up to the limit; CLAUDE.md: nothing stops dead.)
- **E16. Keys ease in and out unless they say otherwise;** linear motion has to be asked for (5b: nothing robotic or evenly spaced).
- **E17. Bends: both runtimes draw the same dense mesh.** Section 5b says to set SpriteKit's `subdivisionLevels` "to match the WebGL mesh", but Apple never documents how SpriteKit subdivides, so I expand the bend grid myself, identically in both, and tell SpriteKit not to subdivide. Proposed in the phase 1 PR.
- **E18. SpriteKit draws one sprite per part, placed by the shared engine,** rather than a node per bone as `PLAN.md` first said. The two runtimes then compute every position the same way, and SpriteKit never has to represent a skewed node.
- **E19. A marking on a bending part is painted into that part**, not laid over it (the kitty's tail patch, M5). SpriteKit cannot clip to a bent part or bend an overlay with its part reliably; painted in, the patch still moves with the tail and never crosses its outline, which is what 5b asks for. In format version 1 clips also do not nest; the lids inside the eyes inside the head (phase 4) add nesting.
- **E20. Parity also fails a part one runtime draws and the other does not.** Section 5b scores parity as SSIM 0.95 "on the character": I average the SSIM map over the pixels either frame draws, so the empty background cannot hide a difference. A missing tag, nose or shadow can still move that average too little to fail, so a frame also fails on any patch where the renders disagree: strongly (more than 64 in a channel, 3 px across), in coverage (one draws, the other does not, 3 px across), or faintly (more than 24, 7 px across). Measured on the test character: drawings a quarter or half a pixel off, or blurred by half a pixel, raise no patch; a diagonal half-pixel shift at the small size, or a part about a pixel off there, already does; a missing shadow, tag or nose fails every frame at both sizes. Both runs (full size and small) and the same frames on both sides are required. This only adds failures; `tools/qa/test_parity.py` plants each one and pins each patch size.
- **E21. Neither runtime uses mipmaps; proposed instead: reduced atlas sets, built when first needed.** Section 5b expects SpriteKit to mipmap power-of-two pages ("That protects about four mip levels"). Measured through `SKRenderer` on the iOS 26.2 simulator, with Xcode 16.4 and 26.3: a page decoded from PNG, asked for mipmaps before first use and drawn through a sub-texture at 81% and 62% of its size, came out identical to level 0 alone (`RenderProbes.swift`). So the app no longer asks for mipmaps, and WebGL samples linearly without them too. With mipmaps on the web only, parity's small run fell to 0.947; without them on either side it is 0.979. The cost, measured on web renders against mipmapped ones: wherever an atlas set is drawn below its own size it shimmers more, by about 15% between 35% and 100% of full size, and by about 68% for the small set drawn below its own size (under 33% of full size on a 3x iPhone, at any size below 35% on a 2x one), as the trip's far figure will be (M3). Phase 1's app draws only at full size, so nothing shows yet. **Proposal, departing from the letter of 5b:** when trips arrive (M3), the build adds reduced sets (for example half and a quarter of the small set) and both runtimes pick the nearest, as a mip level would, so they stay identical. The widget's poses and share images (from the 5x set, M1 and later) are rendered images, so they get a proper downscaling filter at that step. I'll show you frames before building either.

## From the spec (section 24)

The spec's own open questions, with where each stands. Owners are the spec's; where a default or a timing is mine, it says so.

| Question | Default until decided | Owner | Needed by |
| --- | --- | --- | --- |
| Trademark search for Huddlings | Huddlings | founder | the beta |
| Grumpy and Hungry in the first update instead | in the beta | founder | the M4 gate |
| Should link visits always run, whatever the energy | no | founder | two beta weeks |
| Energy numbers (cost 15, thresholds 40 and 15, trot 15 min, walk 60 min, treat 35, no daytime refill) | launch-test settings | product | two beta weeks |
| Voice notes up to 5 minutes, web replies up to 2 | as specified | founder | after the beta |
| Teens in states with app store accountability laws | Apple's age range wherever available (L1729) | founder with counsel | the beta |
| The Terms and the Privacy policy | drafts for builds only you use (Q14) | founder with counsel | before anyone but you uses a build (Q14) |
| The edge host for the visit page | Cloudflare Workers or similar | engineering, approved by the founder | before M3 |
| Counsel on recording consent wording for voice notes and souvenirs | none | founder | the beta, or earlier (Q14) |
| Moderation: hand review in the beta, a service or staffing before public launch | hand review | founder | public launch |
| The word list's source and additions, and the stricter teen list | none | founder | M3 (mine: the filter ships with the first send, P10) |
| The twelve foods after the recognition test | the twelve | engineering, approved by the founder | the beta (L977) |
| Mochi's sound set per species | none (see Q4) | founder | Gate C (see Q4) |
| Build environment for iOS and the Apple Developer account | the macOS runner (CLAUDE.md) | founder | phase 1 (`PLAN.md`) |
| Each companion's marking map | proposed at Gate A | founder | each Gate A |
| The shared collar blue | `#7DB7E8` | founder | the dog's Gate A |
| The early test after M3 | decided at the M3 gate | founder | the M3 gate |
| Counsel on the character art | none | founder | the beta |
