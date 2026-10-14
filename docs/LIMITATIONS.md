# Limitations

Every limit hit while building Huddlings, with the evidence and the workaround (spec section 5b). Runtime limits (SpriteKit, WebGL, the widget, devices) are added with the frames that show them; environment limits are listed first.

## Environment (Linux cloud session, Oct 14, 2026)

| Limit | Evidence | Workaround |
| --- | --- | --- |
| No Xcode, SpriteKit or simulator on Linux, and `download.swift.org` is blocked | the proxy answers 403 to CONNECT for `download.swift.org` | Swift itself runs here through Docker Hub's `swift` image (6.4.1): `docker run --rm -v "$PWD":/w -w /w swift:6.4.1 swift test --package-path ios/CompanionCore`, once `dockerd` is started. The pure Swift engine is also tested on GitHub's Ubuntu runner (Swift 6.4). SpriteKit code builds empty on Linux; the app, the SpriteKit renders and the simulator run on the GitHub Actions macOS runner (the `ios` workflow, on pull requests and by hand). |
| `deno.land` is blocked by the network policy | the proxy answered 403 to CONNECT `deno.land:443` | Deno 2.9.6 installed from its npm package (`deno@2.9.6`); the SessionStart hook does it. |
| ECR Public's image storage (`d2glxqk2uabbnd.cloudfront.net`) is blocked, so `public.ecr.aws/supabase/*` images cannot be pulled, although `public.ecr.aws` itself answers; Docker Hub works | `docker pull public.ecr.aws/supabase/postgres:...` fails with Forbidden on the CloudFront blob URL; `docker pull hello-world` works | To be proven in M3: point the Supabase CLI at the Docker Hub copies of its images, or run the contract tests in CI. |
| `commons.wikimedia.org` and `upload.wikimedia.org` are blocked | the proxy answers 403 to CONNECT | Muybridge's plates are needed in phase 4: the founder allows the hosts or uploads the plates (`PLAN.md`). |
| `cdn.jsdelivr.net` and `supabase.com` are blocked | the proxy answers 403 to CONNECT | MediaPipe Tasks Audio comes from npm and its YAMNet model from `storage.googleapis.com` (both reachable, checked); Supabase's documentation is read from its GitHub repository (`raw.githubusercontent.com`, reachable). |
| The Docker daemon is not running at session start | `docker info` cannot reach the socket | Start `dockerd` as a background task when a session needs it (the Swift tests, and the backend from M3). |
| Headless Chromium renders WebGL2 in software (SwiftShader) | `WebGL 2.0 (OpenGL ES 3.0 Chromium)`, max texture 8192 | Correct, deterministic frames for QA; frame rates measured here mean nothing, so performance is measured on the iPhone only. |
| No device here: touch, haptics, sound, camera, microphone and recognition cannot be judged in this session | none of them exist in a container | TestFlight builds and the Lab's Diagnostics on the founder's iPhone (`PLAN.md`). |

## Runtimes

Phase 1, with the test character (`characters/test/`). Simulator figures come from GitHub's macOS runner: Xcode 16.4 (16F6) driving an iPhone SE (3rd generation) simulator on iOS 26.2, which draws with the Mac's GPU, not an iPhone's.

| Limit or measurement | Evidence | Workaround or status |
| --- | --- | --- |
| Texture memory, computed from `atlas.json`: each set of the test character is one page. A 3x iPhone loads only the 3x set, 1024 × 1024 RGBA: 4 MiB, 5.3 MiB with mipmaps. Below 35% the small set's 512 × 512 page adds 1.3 MiB. The budget is 48 MB with a visitor (5b). | `build/characters/test/atlas.json`; the Lab's Diagnostics shows the same figure ("Atlas textures") beside all of the app's Metal memory | Measured on your iPhone with the first TestFlight build. |
| Frame time and rig time on your iPhone | none yet | Blocked on the TestFlight pieces in `PLAN.md` (What I need from you, items 2 to 4). The Lab's Diagnostics records both as histograms and exports JSON. |
| `SKRenderer` resizes a scene whose `scaleMode` is `.resizeFill` to the viewport measured in screen points, not pixels: on the 2x simulator a 400-pixel target gave a 200-point scene, so everything came out twice the size, from the bottom-left corner. | the parity job on d96758d: SSIM 0.715 (full) and 0.654 (small), the SpriteKit drawing at twice the web's size | Offscreen renders use `.fill`, which maps the scene exactly onto the target (d98bf8c); the app's own scene, shown by an `SKView`, keeps `.resizeFill`. |
| SpriteKit used no mipmaps, although asked for them, for a texture made from bytes and for a page decoded from PNG and drawn through a sub-texture | `RenderProbes.swift` on 9c9ea67 and d652a8e: at levels 0.30 and 0.69 SpriteKit blended 0.000 of level 1, and its pixels matched level 0 alone exactly (residual 0.00 of 255); with mipmaps on the web only, parity's small run fell to 0.947 on the character | WebGL samples linearly without mipmaps too (`QUESTIONS.md` E21), and the small run's minimum rose to 0.979 (`qa/phase1/parity/`); the small set below 35% of full size; to confirm on your iPhone with the first TestFlight build. |
| SpriteKit's warp grid, with `subdivisionLevels` 0, adds no vertices and splits each cell from bottom-left to top-right in texture space | `RenderProbes.swift` on 9c9ea67: mean error 0.0028 for that diagonal against 0.0719 for the other, over 32,640 pixels of a pulled cell | WebGL already splits the same way; nothing to change. |
| The first frame `SKRenderer` draws can come out blank | the parity job on 0d1e057: frame 0 had no drawn pixels | The parity render draws its first frame twice. |
