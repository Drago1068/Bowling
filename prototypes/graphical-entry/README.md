# Graphical entry prototype (isolated)

**Status:** fictional interactive preview (historical metric range filter).  
**Not** imported by the production app. Does **not** prove production scoring or persistence.

## Open the preview

`prototypes/graphical-entry/index.html`

```powershell
Start-Process (Resolve-Path .\prototypes\graphical-entry\index.html)
```

## Home metrics range filter

Selector on Home:

- Week  
- Month  
- Year  
- All time  

When the range changes, displayed values recalculate from **completed games only**, using each game’s persisted date and final score (no invented history):

| Metric | Behavior |
| --- | --- |
| Overall Average | Mean of completed finals in range |
| Average by Date | Per-date rows: `<Date> — Average score: <date avg> — Week average: <week avg>` (calendar week = Sun–Sat; always visible) |
| History date headers | `<Date>` + `Average: <completed avg for that date>` (Active/incomplete excluded; week avg not shown here) |
| Rolling Average | Mean of up to last 5 completed games in range |
| Qualifying Games | Count of completed games in range |
| PBA Handicap Score | Display-only **Formula not defined** (no invented formula) |

Empty / insufficient ranges show **“Not enough games yet.”** for averages.

## Other preserved behavior

Tenth-frame legality and live scoring, sequential entry, X / G / / / ✓, completed-game status, Start New Game / Done for the Day.

## Proposed capture default (pending approval)

Rack-first / selected = standing. ADR-007 U2 pinfall-first is **not** rewritten as approved.
