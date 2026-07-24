# For Supervisors

As the Supervisor, you own the appraisal process itself — someone has to configure each cycle, keep it moving, and bring it to a close, and that someone is you. You're also an Employee like everyone else, and very possibly a Manager too, since most Supervisors also manage part of the organization — both of those chapters apply to you as well. This chapter covers what's yours alone: setting up and locking a cycle, recovering stalled evaluations, scheduling and closing interviews, closing the cycle itself, and reading the analytics that cover the whole organization.

## The process owner

You run the appraisal cycle end to end: you create it and decide what it covers, you keep stalled evaluations from staying stuck, you schedule interviews, you formally close evaluations once their interviews are done, and you close the cycle itself once the appraisal period is over.

Most Supervisors hold the role structurally, simply by where they sit in the organization: the organization's top manager always holds it, and so does any of the top manager's direct reports whose own part of the organization runs at least two further management levels deep — someone managing managers of managers, not just individual contributors. A structural Supervisor can also grant the role to someone else from **People**; a granted Supervisor gets the same powers but can't manage anyone else's roles, and the grant only takes effect the next time that person signs in. A structural Supervisor, by contrast, can't be stripped of the role — it comes from where they sit in the organization, not from a setting anyone can turn off.

## Creating and configuring a cycle

Open **Cycles** to start a new one: give it an ID (something like 2026-H2), a name, and its key dates — when it starts, the manager-review deadline, and when it closes. It begins in Planning, and stays there until you lock it.

While it's in Planning, use **Cycle Setup** to decide which competencies apply to whom. For each role family and each of its specializations, you choose the Active Competency Set from a picker that only ever offers that family's own competency pool — there's no reaching outside it. Whatever baseline you choose for a family has to cover all nine subcategories, and every resolved set — the baseline plus whatever a specialization adds on top — is capped at 30 competencies by default. If a specialization genuinely needs nothing beyond the baseline, mark it as intentionally having no extra competencies, rather than leaving it looking unfinished. A family that isn't ready for this cycle at all — no competency content yet, for instance — can be excluded outright, and included again later once it is ready; an excluded family is skipped by validation and hidden from the tree while it's out.

> **Tip:** Cloning a selection from another node is usually faster than building one from scratch, especially when two specializations should end up nearly identical — clone first, then adjust just the differences.

## Locking a cycle

Locking is what turns a Planning cycle into the live one. It validates everything at once: that every baseline covers all nine subcategories, that no resolved set exceeds the cap, that every referenced competency actually exists, that every competency comes from its own family's pool, that a family with specialization selections also has a non-empty baseline, and that every family you've included is actually configured. If anything fails, you'll see the errors grouped by family rather than one long undifferentiated list. Once it passes, the cycle becomes Active — only one cycle can be Active at a time — and evaluations can finally be started against it.

## Keeping evaluations moving (Oversight)

**Oversight** lists every in-progress evaluation in the active cycle, flagging the ones whose self or manager deadline has passed while that round is still incomplete. Three actions live here, and all three require you to record a reason — and are permanently audited:

| Action | Available when | What it does |
|---|---|---|
| Advance without self | The self-assessment deadline has passed and the round is still incomplete | Waives the stalled self round — those grades are excluded from scoring, never treated as a zero — and moves the evaluation on once the team round is also done |
| Complete manager review | The manager round is incomplete | Opens the evaluation in proxy mode so you can grade and submit it on the manager's behalf |
| Withdraw | Any evaluation listed here, whatever its status | Cancels it outright and irreversibly, releasing any booked interview slot and immediately freeing the employee for a brand-new evaluation |

> **Warning:** Withdrawing is irreversible, and it immediately frees the employee for a brand-new evaluation. Reserve it for genuine mistakes or evaluations that are hopelessly stalled, not routine cleanup.

Overdue self- and manager-rounds also surface as their own dashboard tasks, so you don't need to keep Oversight open just to notice them.

## Scheduling interviews

Once an evaluation's results are Ready, it needs a closing interview. Open **Interviews**, pick the Ready evaluation, and book any manager's available slot from the weekly picker — whichever manager owns that slot becomes the conducting manager for that interview, even when it isn't the employee's own manager, and both the employee and that manager are notified once the booking is made. Change your mind, and cancelling releases the slot and clears the interview date, putting the evaluation right back where it started.

## Recording outcomes and closing evaluations

Once the interview date has passed, recording the outcome isn't limited to you — the conducting manager and any org-line superior manager can enter it too: written feedback, up to five next-period goals, and an optional Performance Improvement Plan.

Closing the evaluation, though, is yours alone. It becomes available once the interview has been held and at least some outcome has actually been recorded — feedback, a goal, or both — and confirming it shows you the employee, their score, how many goals were set, and whether a Performance Improvement Plan is attached. Closing is irreversible, and it's also the moment the employee gets to see all of it — the interview feedback, the goals, and the Performance Improvement Plan — on their Scores screen.

## Closing the cycle

When the appraisal period is over, closing the cycle from **Cycles** warns you how many evaluations aren't yet Closed, broken down by status.

> **Note:** That warning never blocks you. Closing prevents new evaluations from starting against this cycle, but anything already in progress carries on to completion untouched.

Closing is also the moment an anonymized statistical snapshot of the whole cycle gets written — permanent, and the thing that powers cross-cycle **Trends** from here on.

## Analytics

**Cycle analytics**, under Insights, covers six reports for the entire cycle: coverage, interview timing, self vs manager alignment, the competence heatmap, score distribution by level, and performance drivers. **Team analytics** gives you the same reports scoped to your own reporting line, plus a seventh — grader calibration — since comparing individual graders only makes sense within a team; the For Managers chapter covers all seven in more detail. **Trends**, which only you can see, looks across cycles rather than within one: an overall score trend, gap-closure, ladder movement, and cohort comparison, all built from the anonymized snapshot each cycle close leaves behind. Beyond that aggregate view, you can also open the score-history line for any individual you're authorized to see, on their own Scores screen. Across every one of these, a group smaller than three people is always suppressed, never shown.
