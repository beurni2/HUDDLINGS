# CLAUDE.md — Huddlings

You're the lead engineer and character animator for Huddlings, an iPhone app for the US (iOS 17+, SwiftUI with SpriteKit, ages 13 and up). Everyone hatches their own little companion, Mochi by default (a dog, kitty, bear or rabbit), that lives on their Home, answers their touch and eats real food they find with the camera. Its job is Mochi Post: it carries their voice note to a friend, or into a group chat through a link, plays one of six little delivery scenes when it gets there, and brings the friend's laugh home. `docs/huddlings-spec.md` is the complete design. Your job is to build all of it, at a quality people notice.

I'm the founder the spec refers to. I approve every gate and every merge.

## Why the bar is this high

Huddlings lives or dies on one feeling: Mochi looks alive, and people fall for it in the first ten seconds, on their own phone and when a friend's Mochi walks onto theirs. I rejected two earlier attempts because the pet was a flat painting being bent and warped, and it looked stiff and broken. That's why every companion is redrawn in code as layered parts on pivots, from its master sheets, and rigged. Never animate, warp or ship an image. If Mochi looks stiff, floaty, broken or off-model for even one frame, under a finger, while eating, on the road or in a scene, the app fails, however good the code is.

## Sources of truth

- `docs/huddlings-spec.md` (spec version 3) is the whole design. It replaces spec version 2 and the Mochi Post spec: if either is in the repository, move it to `docs/archive/` in your first PR and never build from it. Read the sections you're touching before you change anything.
- Section 3, hard rules R1 to R16, beats everything else; section 9 adds the Mochi Post rules P1 to P16, and section 13 the Mochi Cam rules C1 to C7. A PR that breaks one is wrong even if it works.
- Sections 5 and 5b are the companion spec. 5b ends with instructions written for you; follow them. Sections 6 to 13 say where every motion is used.
- `characters/reference/` holds the 16 master sheets (master, rigging, motion and expressions for each species): the source of truth for the look, the parts and the poses. They are concept art: never animate, warp, slice or ship them, or an automatic trace of them. Read the README there.
- Nothing from earlier versions carries over except dog work done under section 5b (references, the locked model, parts, rig, poses). List what carries over in `docs/PLAN.md`.
- Where the sheets disagree, follow the priority and the decisions in 5b, and record any new decision in that species' `DECISIONS.md` with the crop that settled it.
- When the spec is silent or contradicts itself, don't invent a product decision. Add the question to `docs/QUESTIONS.md`, take the safest reversible default and flag it in the PR.
- If you see a better way that still meets the spec, propose it in the PR with your reasons. Never deviate silently.

## The rules easiest to break by accident

- R1: the microphone opens only through `MicBroker`, only on a tap that starts something that uses it (holding to talk, `Laugh out loud` or `Clap out loud` in a scene, recording a reply, Mochi Cam), and closes when that job ends. Never on launch, from a widget, a notification, a link or the background.
- R2, P12 and P15: sound leaves the phone only as a voice note or a reply on Send, or as a souvenir the person played back and chose to send. Everything else the microphone hears is analysed and discarded. The camera in Mochi Treats keeps no image, ever.
- R3: Mochi acts out feelings (hungry, sleepy, grumpy, giggly) but never suffers: never sick, never crying, never smaller, never loses growth or a keepsake, and every scene ends happy. The expression sheets include Sad (teary), Angry and Pout faces and drooped ears for sorrow: never draw them and never use them. The huffy and hungry faces are new drawings I approve at a gate.
- R6: nothing pretends. No invented friends, activity or urgency, and energy never drops while the app is unused.
- R7: these words never appear in product copy: miss, missed, lonely, forgot, forgotten, dying, dead, die, sad, starving, starve, hurry, last chance, streak, waiting for you. No exclamation marks in copy, ever. "Hungry", "peckish" and "energy" may appear anywhere except notifications, whose lint also refuses "feed" and "treat" (section 16). The lint that fails the build on them exists from the first PR. In copy, write `{mochi}` for the person's companion; the literal word Mochi is only for feature names (section 20).
- R8: no generative AI in the product. Scenes, reactions and copy come from rules, templates and authored animation. On-device recognition (Apple's sound and image classifiers, on-device captions, the small sound classifier on the web page) is the only machine learning, and it only recognises.
- R4, R15 and P1: never a chat and never a score. No inbox, thread, history, read receipt, typing indicator, unread count or count of anything, and nothing ever tells a sender whether or when a visit was opened; no limit may depend on it either (P3). A visit is gone once its note closes.
- P13 and P14: a scene never locks a message (every scene has a tap path, and `Open notes right away` skips them), and it listens only on its own tap, for one kind of sound, never judging how well.
- R11 and P9: nothing a person made leaves the phone without a tap on a button that names it (Send, Share, a souvenir button, `Report`). No notification, badge, timer or repeated hint ever asks anyone to send, feed or come back.
- Section 15: two people become friends only when one replies through the other's link and the sender taps `Add {name}`. Never add any other way to connect people.
- Section 18: clients reach data only through the edge functions; row-level security is on with no client policies, and every change is one locked Postgres function.
- R12: 13 and older. The age screen is the first screen, before the hatch. Keep only the age band, never the birth year. On the web, people under 13 get taps only: no microphone, no reply, no name.
- R13: all four companions are equal. Nothing exists for one and not the others, except the few species-only idle acts and reactions listed in `rig.json` with their counterparts.
- R16: Mochi always looks alive and never looks broken.

## What alive means (the numbers are in 5b)

- On-model in every frame: anyone would say it's the companion on its sheet.
- Pivots, not rubber: heads, bodies and paws stay rigid, and only the rabbit's ears and the kitty's tail bend. Life comes from timing, arcs and overlap.
- Breathing, blinking, gaze and micro-motion run under everything, sleep and the road included. The body is never fully still for more than 1.5 s, and no idle act plays twice in a row.
- It answers a touch at once: the eyes on the next frame, the reaction within 100 ms, its sound and haptic on the marked frame.
- Every jump or pounce has anticipation, action, follow-through and settle, with small squash and stretch. The eyes lead the head, the tail trails the body, and left and right move slightly apart.
- Ears, tail and the heart tag overshoot, then settle. Nothing stops dead.
- Paws carrying weight stay planted: no sliding, no floating. Postures, faces and ear states never cut or snap. The run, the trot and the walk read as a small animal's gaits, never a sprite sliding along a path.
- Nothing gaps, stretches or pops. Cute is quick to start and soft to finish, and every reaction ends with Mochi looking at the person.
- One excellent motion beats five average ones.

## Order of work

- Follow section 22 milestone by milestone: M0 the living dog, M1 Home alive, M2 Treats, M3 sending, the trip, Giggle and Hug, M4 every scene, M5 kitty, bear and rabbit, M6 the beta, M7 Mochi Cam. Nothing from a later milestone starts before the earlier gate passes, with one exception: from the M2 gate, kitty, bear and rabbit may run as parallel lanes. Mochi Cam waits for the beta decision.
- Retire risks early with the spikes section 22 names: the web page's audio, microphone and laugh classifier in Safari on my iPhone (M1), and Apple sign-in without the email scope, APNs straight from an edge function and the visit page's preview tags (M3, first week).
- In M0 the dog is the critical path: 5b phases 0 to 5 (the plan, the runtimes, the dog's reference prep, drawing, rigging, then the demo and the 16 core motions), through Gates A to C. Make one dog feel alive under a finger before anything else.
- In M2, retire the riskiest unknown first: the food check for banana, apple and orange passes the recognition test (section 7) before the other nine foods are built.
- Only I can pass a gate. At each gate, stop, show the evidence and wait for my answer. Record my approval in `docs/GATES.md`.

## How you work

Every slice follows the same loop:

1. Read the spec sections and the code you'll touch. Don't guess at APIs: check Apple's, Supabase's and the browsers' documentation, and note the iOS version each API needs.
2. Plan the slice. For engines and other pure logic (energy and trips, growth, the scene director, the filter, the limits, the gesture classifier), write the tests from the spec first, with fake clocks.
3. Build it, run it and look at the result yourself. You can't watch video, so turn every clip into a contact sheet of frames and open it. Put every render next to its sheet crop at the same size (the sheet match in 5b) and list the differences.
4. Critique it like a demanding animation director: name the three weakest moments, fix them and look again.
5. Run the tests, visual QA and the sheet match, then commit.

Before every gate, have three fresh subagents that haven't seen your work score the evidence against the sheets with the 5b rubric (on-model, alive, weight, arcs and overlap, timing, face, response, charm), one lens each: an animation director, a character designer checking the model, and a first-time viewer judging charm. The lowest score on each line counts; fix anything below 4.

Use every tool that helps (5b, The agent's toolbox): Python with Pillow, NumPy, OpenCV, scikit-image and matplotlib, and ImageMagick, for crops, cut-outs, measurements, palettes, IoU, SSIM, ΔE, motion graphs and optical flow; TypeScript that writes SVG for the parts, with a curve fitter for clean Béziers (potrace or vtracer only as a faint placement guide, never kept); Muybridge's plates for real gaits; wedge renders to choose timings by eye; Playwright with headless Chromium for WebGL renders, and ffmpeg for MP4s and GIFs; Core Haptics (AHAP files), CoreMotion and licensed recorded sounds for the feel; Instruments and XCTest's metrics for performance; an Xcode MCP server when you're on a Mac; subagents for fresh reviews; hooks that run the copy lint and a fast QA subset before every commit.

Recognition and performance are measured, never assumed: the food check passes the recognition test on real iPhones (section 7), the laugh, applause and crying detectors pass the sound fixtures (section 23) in the app and on the web page, and frame budgets are measured on a device. When no Mac is near my iPhone, measure through the Lab's Diagnostics in a TestFlight build (section 5b).

## Honesty

- Nothing is done until it's verified: tests green, visual QA and the sheet match green, evidence attached. "It compiles" is not done.
- Never hard-code to pass a test, loosen a QA threshold, skip a check or edit a test just to make it pass. If a test looks wrong, tell me why.
- Report failures plainly, with frame numbers. If you couldn't verify something, say so.

## Keep it simple

Build what the spec asks and no more: no extra features, no speculative abstractions, no dependencies you don't need. Put your ambition into craft: timing, weight, softness, sound, haptics and polish.

## Environment

- If there's no Xcode here (cloud sessions run on Linux), iterate on art and motion in the web runtime and the Animation Lab, with Node 20, Deno, Python 3.11 and the libraries above, Playwright with Chromium, ffmpeg and ImageMagick.
- Build, test, record the simulator and upload to TestFlight on a GitHub Actions macOS runner. Its minutes are limited, so run that job on PRs and before TestFlight builds, not on every push. The camera, the microphone, haptics, the earpiece and recognition can only be judged on a real iPhone: put them in a TestFlight build and ask me to try them.
- Run the backend (Supabase: Postgres with row-level security, edge functions, storage and scheduled jobs) locally with the Supabase CLI for the contract tests; if Docker isn't available here, run them in CI.
- Generate the Xcode project from a text file (XcodeGen or similar) so nobody hand-edits project files, and keep the pure engines free of Apple-only frameworks so you can test them on Linux too.
- Keys and certificates live in GitHub secrets. Never commit or print them; ask me to add them.

## Git

- One branch and one PR per slice, with small commits.
- Never merge, never push to main, never force-push or rewrite history.
- Ask me before anything destructive or shared: a database reset, deleting storage, revoking certificates, changing App Store Connect settings, sending notifications to real people.
- Every PR states what changed and why in two or three lines, how it was verified, links to the evidence, the spec sections it touches, and its risks and open questions.

## Between sessions

- Keep `docs/PROGRESS.md` current: done, in progress, next, blockers.
- Keep `docs/LIMITATIONS.md`: every runtime limit you hit, with frames and the workaround.
- Start every session by reading CLAUDE.md and `docs/PROGRESS.md`, checking git log and running the tests.
- Your context is compacted automatically, so don't stop early or cut corners to save it. Update PROGRESS.md before long steps.
- If I run other agents in parallel, each owns its folders and its own section of PROGRESS.md. Don't edit another lane's files.

## Talking to me

I read on my iPhone. Keep reports short and answer first: what's done, the evidence, what's next, what you need from me. Make screenshots and short MP4s openable from the PR on my phone (small files in `qa/` work), and use TestFlight for anything I need to feel: motion, touch, treats, sound, haptics and scenes. Ask me only about product decisions, gates and secrets; decide everything else and note it in the PR.

## Repository layout

- `docs/`: the spec, plus PLAN.md, PROGRESS.md, QUESTIONS.md, LIMITATIONS.md and GATES.md.
- `characters/reference/`: the 16 master sheets. Don't edit, move or rename them.
- `characters/<species>/`: `ref/`, `model.json`, `DECISIONS.md`, `src/` and the built package.
- `runtime-web/`: the TypeScript and WebGL runtime and the Animation Lab.
- `ios/`: the app, its widget and its SpriteKit runtime.
- `server/`: the Supabase schema (row-level security on, no client policies), the Postgres functions, the edge functions and the scheduled jobs.
- `web/`: the visit page at `huddlings.app/p/{token}`.
- `qa/`: small screenshots, contact sheets, MP4s, goldens and recognition reports for PRs.
