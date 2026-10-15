# Web runtime and Animation Lab

The TypeScript and WebGL character runtime (spec section 5b), shared by the visit page (`web/`) and the Animation Lab in the browser. It reads the same character packages as the SpriteKit runtime and must render the same frames (the parity check in Visual QA).

Built in section 5b phase 1, with a test character made of plain shapes, before any companion art exists.

The Lab's scripts drive the runtime in headless Chromium on SwiftShader, on the deterministic clock:

- `lab/render.ts`: a clip frame by frame, with a contact sheet and an MP4; `lab/render-all.ts` renders every clip of every built package.
- `lab/still.ts`: a named still (a clip that sets the body and head views, at t = 0) for the sheet match: the frame on white and on black, a part-ID pass, and `still.json` to read them by.
- `lab/look.ts`: the drawing loop of phase 3: build the package, render each view's still and run the sheet match, again on every change with `--watch`.
