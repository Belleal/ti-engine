# The Appraisal Process

Every evaluation follows the same eight steps on its way from start to close. The earlier chapters cover those steps one role at a time — this chapter instead follows a single evaluation straight through, naming who acts at each point, which screen they act on, and what changes as a result. It closes with the status lifecycle those steps drive, and where to look for more detail on any one part.

## Step 1 — Appraisal Cycle Start

Every evaluation belongs to an appraisal cycle, and the cycle comes first. The Supervisor creates it on the Cycle Management screen — an ID, a name, and its key dates — where it starts out in Planning. While it's in Planning, the Supervisor uses Cycle Setup to decide which competencies apply to each role family and specialization, excluding any family that isn't ready for this cycle yet.

Once every included family passes validation, the Supervisor locks the cycle, and it moves from Planning to Active. Only one cycle can be Active at a time, and no evaluation can start against it before this point.

## Step 2 — Evaluation Start

An evaluation begins when an authorized Manager — or, standing in for one, a Supervisor — starts it for a specific employee on the New Evaluation screen, after the system confirms the employee has no other evaluation already in progress. At this point the Manager may also name between three and five eligible colleagues to give peer feedback.

The evaluation is created at Open status, carrying a snapshot of the competency set resolved from the employee's role family and specialization for the active cycle. Whatever changes later in the configuration, this evaluation keeps the set — and the relevancy weights behind it — it started with.

## Step 3 — Self-Evaluation

The Employee completes the self-assessment on the evaluation form, grading every competency and adding a written comment, and may save drafts freely until a strict deadline; a draft or submission after that point is rejected outright. Submitting requires every competency to be graded.

If the Employee cannot finish in time, the Supervisor may waive the round from Oversight once the deadline has passed, recording a reason. Waiving moves the evaluation on to In Review without the self-grades, which are then excluded from scoring rather than counted against the Employee.

## Step 4 — Team Evaluation *(optional)*

If team members were named at Step 2, each grades the evaluation form before a separate, cycle-level deadline — by subcategory in the default collective mode, or competency by competency if collective mode is switched off. Each team member submits once, and once every one of them has, the system averages the individual grades into a single cumulative grade per competency.

This round is skipped entirely when an evaluation starts without team members. Its deadline behaves differently from the self-round's: a late submission isn't rejected, but once the deadline passes, the Manager — or a Supervisor acting as a read-only facilitator — may finalize the round with whatever was actually submitted, so one non-responder can't hold up the rest.

## Step 5 — Status Transition: Open → In Review

No one takes a direct action for this step — it happens on its own. As soon as the Employee's self-assessment is submitted, and the team round is either complete or was never requested, the evaluation's status changes from Open to In Review automatically, and the Manager is notified that it's waiting on them.

## Step 6 — Manager Review

The Manager reviews the submitted self and team grades on the evaluation form, adds a grade for every competency plus a written comment, and may save drafts freely. The Manager's own deadline works differently from the Employee's: it's a reminder rather than a block, so a late manager submission is never rejected.

Once the deadline passes, it surfaces as an overdue task for the Supervisor, who may complete the manager grades from Oversight on the Manager's behalf, recording a reason — a manager further up the same reporting line may also step in directly, without needing to record one, since they'd be acting as a manager rather than standing in for someone. Once the manager review is submitted, by whichever of them does it, the system calculates the evaluation's performance scores and its status changes to Ready, and the Supervisor is notified.

## Step 7 — Interview Scheduling

Before scheduling can happen, every Manager keeps their own interview availability current on the Availability calendar, marking slots available or busy for the current cycle. Once slots exist, the Supervisor opens Interviews, selects a Ready evaluation, and books one of the available slots from the weekly picker.

Booking sets the evaluation's interview date and hands the interview to whichever Manager owns that slot — its conducting manager, even when that isn't the employee's own manager — and notifies both the Employee and that Manager. The evaluation's status doesn't change at this step; it stays Ready until the interview itself is recorded and closed. The Supervisor may cancel a booking at any time, which clears the interview date and reopens the slot.

## Step 8 — Interview Meeting and Closure

During the interview meeting, whoever conducts it — the conducting manager, an org-line superior manager, or the Supervisor — records its outcome on Interviews: written feedback, up to five concrete goals for the Employee's next period, and, if the conversation calls for one, a formal Performance Improvement Plan. Grades already submitted are never changed at this point.

Once the interview date has passed and at least some outcome has been recorded, the Supervisor formally closes the evaluation from the same screen — an irreversible change from Ready to Closed. Closing doesn't change any grade or score; those were already visible to the Employee at Ready. What it does add is visibility: the interview's feedback, goals, and any Performance Improvement Plan appear to the Employee on My Scores only from this point on.

## The status lifecycle

The eight steps above drive a fixed sequence of statuses. Nothing here advances on a timer — every arrow below is the result of someone submitting, waiving, finalizing, or closing something:

```
NOT STARTED → OPEN → IN REVIEW → READY → CLOSED
                └────────┴──────────┴──► WITHDRAWN (Supervisor action, any active status)
```

- **Not Started** — no evaluation exists yet for the employee.
- **Open** — the self-assessment, and any team feedback, are in progress.
- **In Review** — both of those are done, and the manager review is in progress.
- **Ready** — the manager has submitted; scores are calculated and visible, and the interview gets scheduled and held from here.
- **Closed** — the interview's outcome is recorded and the Supervisor has formally closed the evaluation; nothing more happens after this.
- **Withdrawn** — the Supervisor cancelled the evaluation outright, from Open, In Review, or Ready; irreversible, and it immediately frees the employee for a new evaluation.

## Where to read more

For the detail behind any one step, the earlier chapters cover it from that role's own side:

- **For Employees** covers the self-assessment, the results screen, and what stays private, from the employee's side.
- **For Team Members** covers being picked for peer feedback, how it's graded, and how anonymous it stays.
- **For Managers** covers starting evaluations, the manager review, the availability calendar, and conducting interviews.
- **For Supervisors** covers configuring and locking a cycle, recovering stalled evaluations, scheduling interviews, and closing both evaluations and the cycle itself.
- **For Administrators** covers the configuration screens — the competency dictionary, the relevancy model behind scoring, and role families — and when each kind of change takes effect.
