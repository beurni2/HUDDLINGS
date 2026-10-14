# Limitations

Every limit hit while building Huddlings, with the evidence and the workaround (spec section 5b). Runtime limits (SpriteKit, WebGL, the widget, devices) are added with the frames that show them; environment limits are listed first.

## Environment (Linux cloud session, Oct 14, 2026)

| Limit | Evidence | Workaround |
| --- | --- | --- |
| No Xcode, SpriteKit or simulator on Linux, and `download.swift.org` is blocked | the proxy answers 403 to CONNECT for `download.swift.org` | Swift itself runs here through Docker Hub's `swift` image (6.4.1): `docker run --rm -v "$PWD":/w -w /w swift:latest swift test --package-path ios/CompanionCore`, once `dockerd` is started. The pure Swift engine is also tested on GitHub's Ubuntu runner (Swift 6.4). SpriteKit code builds empty on Linux; the app, the SpriteKit renders and the simulator run on the GitHub Actions macOS runner (the `ios` workflow, on pull requests and by hand). |
| `deno.land` is blocked by the network policy | the proxy answered 403 to CONNECT `deno.land:443` | Deno 2.9.6 installed from its npm package (`deno@2.9.6`); the SessionStart hook does it. |
| ECR Public's image storage (`d2glxqk2uabbnd.cloudfront.net`) is blocked, so `public.ecr.aws/supabase/*` images cannot be pulled, although `public.ecr.aws` itself answers; Docker Hub works | `docker pull public.ecr.aws/supabase/postgres:...` fails with Forbidden on the CloudFront blob URL; `docker pull hello-world` works | To be proven in M3: point the Supabase CLI at the Docker Hub copies of its images, or run the contract tests in CI. |
| `commons.wikimedia.org` and `upload.wikimedia.org` are blocked | the proxy answers 403 to CONNECT | Muybridge's plates are needed in phase 4: the founder allows the hosts or uploads the plates (`PLAN.md`). |
| `cdn.jsdelivr.net` and `supabase.com` are blocked | the proxy answers 403 to CONNECT | MediaPipe Tasks Audio comes from npm and its YAMNet model from `storage.googleapis.com` (both reachable, checked); Supabase's documentation is read from its GitHub repository (`raw.githubusercontent.com`, reachable). |
| The Docker daemon is not running at session start | `docker info` cannot reach the socket | Start `dockerd` as a background task when a session needs it (the Swift tests, and the backend from M3). |
| Headless Chromium renders WebGL2 in software (SwiftShader) | `WebGL 2.0 (OpenGL ES 3.0 Chromium)`, max texture 8192 | Correct, deterministic frames for QA; frame rates measured here mean nothing, so performance is measured on the iPhone only. |
| No device here: touch, haptics, sound, camera, microphone and recognition cannot be judged in this session | none of them exist in a container | TestFlight builds and the Lab's Diagnostics on the founder's iPhone (`PLAN.md`). |

## Runtimes

None measured yet. Phase 1 records here: texture memory with the test character, rig and frame times on the founder's iPhone, SpriteKit's warp-grid behaviour against the WebGL mesh, and any parity difference between the two runtimes, with frames.
