# Visit page

The page at `https://huddlings.app/p/{token}`: an edge worker that writes each link's preview tags, the universal-link association file, the `/h/{token}` redirect, and the static page that plays a visit on the web runtime (spec sections 11 and 18). No cookies, no trackers.

A spike of its audio, microphone and laugh classifier in Safari runs in M1; the page itself is built in M3.

Every user-visible string on the page, its preview tags included, comes from `copy/catalogue.json`, never written inline, so the copy lint covers it (rule R7).
