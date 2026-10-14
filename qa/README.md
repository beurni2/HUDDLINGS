# QA evidence

Small files a pull request links to, readable on a phone: screenshots, contact sheets, short MP4s and GIFs, motion graphs, sheet-match comparisons and recognition reports (spec section 5b, Visual QA).

- `goldens/`: the contact sheet of every motion the founder approved; Visual QA fails when an approved motion changes (SSIM below 0.98) without a new approval.
- Keep files small; large renders stay out of git.
