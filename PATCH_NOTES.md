# Wall mixed-segment split v2

Fixes the case where a wall run contains a short exterior overrun, causing the
whole run to inherit `exterior_wall`.

Changes:
- mixed-wall split can occur much farther from an endpoint (up to 49% of the run);
- one proper crossing: shorter side = exterior, longer side = interior;
- two proper crossings: end tails may be exterior, middle stays interior;
- exact endpoint T-junctions remain untouched;
- no DB, .env, .git, model, or frontend changes.
