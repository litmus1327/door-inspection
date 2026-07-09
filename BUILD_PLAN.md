# Build plan: door inspection tool

## The goal

Turn the app from an expert-only prototype into a tool where a less-experienced hire can capture a fire-door inspection in the field, a senior person reviews and signs off, and the client gets a clean report. The expertise moves to a review step instead of living in every field tech's head, which is what lets you hire cheaper and train faster. Everything below serves that. Two things must be true before it can work: the data has to be safe (not one browser away from gone), and the inspection has to produce a real deliverable. We build those first, then the pieces that make field capture novice-friendly. The interactive diagram is paused until this is done.

## The work, in order

1. Make data durable and synced. Wire the existing Supabase code so inspections, pins, and project data actually save to the cloud, not just localStorage. Add a manual export/backup of all records to a file. Done when: an inspection done on one device shows up on another, and clearing the browser loses nothing.

2. Build the report generator. Turn a completed inspection into a clean PDF: door ID, classification, each deficiency in plain language, photos, and inspector/date. This is the deliverable you sell and the thing Fieldwire doesn't do your way. Done when: finishing an inspection produces a client-ready PDF in one click.

3. Add required photos. Let the inspector attach photos to a door and to each flagged deficiency, stored in the cloud with the record. Done when: no inspection completes without at least one photo, and photos appear in the report.

4. Add the expert review step. After a novice completes an inspection, it goes to a "needs review" queue; a senior person opens it, sees the photos and flags, edits or approves, and only then is the report final. Done when: a reviewer can approve or send back any inspection before it's issued.

5. Make classification novice-proof. Replace the jargon dropdowns (assembly type, ratings, hardware) with plain-language questions and reference photos: "Which of these does the door look like?" Add a sanity check that warns on impossible combinations. Done when: someone untrained can classify a door correctly by matching pictures, not by knowing terms.

## Where to start

Do 1 and 2 first, in that order. Without durable data and a real report, nothing else is worth scaling. Once those are solid, 3 through 5 are what actually let you put a new hire in the field. Tell me which one to begin and I'll scope just that milestone into concrete steps.
