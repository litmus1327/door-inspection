# Honest assessment: where the door-inspection app should go

Written against your stated goal: a tool a person with no fire-door knowledge can use to run inspections, so you can hire less-experienced people and shorten the learning curve. Also: replacing Fieldwire.

## Bottom line

Your inspection decision engine is genuinely good and worth protecting. But the app around it is built for an expert, and the thing that blocks a novice is not the checklist screen we've been polishing. It's the two ends: classifying the door up front, and judging pass/fail in the field. On top of that, the app is a single-device prototype with no working backend, no backup, and no client report, so it isn't safe to scale to a team yet regardless of usability. The interactive diagram is a nice navigation aid, but it does not move the novice goal. I'd pause it and redirect effort.

## What you have that's valuable

The branch logic in `InspectionWizard.tsx` (the `getApplicableItems` tables, the `x1`–`x14` follow-up trees, the blocking prompts) is real, defensible IP. It encodes NFPA-style rules that most competitors bury in a static checklist. Keep it, protect it, and build around it. The documentation discipline (HANDOFF, the multi-project plan) is also better than most solo projects have.

## The core problem for your goal

Expertise in this app lives in two places, and neither is the checklist UI.

First, classification. Before any checks appear, the user must pick the assembly type (3-Hour Fire Barrier, Smoke Partition, Suite Perimeter, and so on), the door and frame ratings, the swing type, and toggle which of 20 hardware types are present (mortise vs cylindrical lockset, coordinator, astragal, automatic vs manual flush bolts). This is done with bare dropdowns and text toggles, no definitions, no reference images, no help. A novice cannot tell a smoke barrier from a smoke partition from the screen. Worse, a wrong pick is silent: choosing "Smoke Partition" quietly deletes the entire rating section, and a wrong assembly type produces a confidently wrong checklist with no warning. Garbage in, garbage out, and the novice has no way to know.

Second, judgment. The checklist items are written as code conclusions ("Gap: Hinge edge gap is in excess of 1/8 ± 1/16\"", "Fire pin missing in absence of bottom latching point"), and the only control is a Flag button. There is no measurement capture, no reference photo of what a deficiency looks like, no examples. To decide, the inspector must already know the component, know the threshold, and eyeball it. The branch questions go further and assume code fluency (occupant-load math, "horizontal exit", "area of refuge").

So the honest read: the diagram helps someone navigate checks they already understand. It does nothing for someone who can't classify the door or doesn't know what "deficient" looks like. We've been improving a part that wasn't the bottleneck.

## The plumbing reality (blocks scaling either way)

Independent of usability, the app is not yet something a team can rely on:

- It is 100% client-side. All inspection data lives in one browser's localStorage. A cache eviction, cleared site data, or a new device wipes everything. There is no backup and no export of the inspection records.
- Supabase code exists but is never called. "Cloud sync" is inert; `synced` is hard-coded false. There is no real sync and no multi-inspector story.
- Photos are stubbed. The upload control stores file names and throws the images away. Nothing is attached to a record.
- There is no client report. The only output is a localStorage JSON record and a raw CSV dump. Your own notes call the report generator "the actual product differentiator," and it doesn't exist.
- Multi-project is designed but not built. Known issues: multi-PDF plans don't survive reload, the zoom-to-cursor bug is unsolved after five attempts, and there are no tests.

None of this is a criticism of the effort. It's a prototype that got the hard domain part right first. But scaling to less-experienced hires across projects means trusting the data and the deliverable, and today neither is safe.

## What actually moves the novice needle

Be clear-eyed: software cannot fully remove the need to physically find a label, identify hardware, and measure a gap. A novice will still need some training. But you can shorten that curve a lot, and the highest-leverage items are not the ones we've been building:

1. Guided classification. Replace the jargon dropdowns with plain-language questions and reference photos ("Which of these does the door look like?"). This is the single biggest unlock, because it removes the highest-stakes guess and prevents silent wrong checklists.
2. Expert remote review. Let novices do the field capture, then have a senior person review and sign off before the report goes out. This is what actually lets you hire less-experienced people, because it puts the expertise at the review step instead of requiring it in the field. It also creates a training feedback loop.
3. Per-item reference images and measurement capture. Show what each deficiency looks like, and capture the measured gap (with the threshold shown inline) instead of a bare Flag. This turns judgment calls into guided comparisons and produces defensible evidence.
4. Required photos. Needed for the deliverable and for review to work at all.

Items 1 and 2 are the ones that address your actual goal. Items 3 and 4 support them.

## Recommended sequence

1. Make the data durable and real: wire Supabase (it's already scaffolded), sync inspections, and add export/backup. This is also the prerequisite for multi-project and for review. Highest priority, because everything else sits on top of it and today one browser wipe loses the business's work.
2. Build the report generator. It's your deliverable and your differentiator, and it's currently missing.
3. Add photo capture, then the expert review/sign-off workflow.
4. Add guided classification with reference images.
5. Then, and only then, per-item reference images and measurement capture.
6. Diagram polish (pairs, states) as UX sugar, last.

## On the diagram specifically

What we built is solid and worth keeping: it's wired into the wizard, colors by findings, and reflects the door's hardware. But it's a convenience layer for people who already know the domain. I'd stop here on it, not invest in the pairs drawing yet, and come back to it after the items above.

## One honest caution

You're a small team building a data-critical field tool, and the history shows a prior tool wiped the repo once. Before you put less-experienced people on this daily, the backup, sync, and review pieces aren't optional polish, they're what keeps a bad day from erasing a project. The domain engine is the crown jewel; the engineering around durability and the deliverable is what turns it into a product.
