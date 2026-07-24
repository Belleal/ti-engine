# Overview & Key Concepts

This chapter introduces the ideas you'll run into everywhere else in this guide — what the application does, who does what, how a competency-based evaluation is put together, and how a final score comes out the other end. Later chapters walk through the screens themselves and cover each person's day-to-day steps in detail.

## What this application does

This application manages **competency-based performance appraisals** — a structured way of assessing how someone is doing in their role, built around a defined set of competencies rather than a single overall impression.

An evaluation is collaborative by design. The employee completes a self-assessment, a small group of peers can optionally add team feedback, and the employee's manager reviews everything and adds a grade and comment of their own. Once the manager's review is in, all of that input combines into a weighted performance score, which is then read against a set of defined performance thresholds — so "how did this evaluation turn out" always has a consistent, comparable answer.

Appraisals don't run continuously — they run in **cycles**, typically annual or twice a year. Every evaluation belongs to exactly one cycle, and it can only be started while that cycle is open for business.

## Who does what

| Capacity | Who has it | What it's for |
|---|---|---|
| Employee | Everyone | Complete your self-assessment and see your own results. Every person is an Employee — including managers and supervisors. |
| Team Member | Whoever is picked to give peer feedback on a specific evaluation | Give peer feedback on a colleague's evaluation. It isn't a standing role — you hold it only for the evaluations you're picked for. |
| Manager | Whoever manages an organizational unit | Manage your people: start their evaluations, complete manager reviews, keep an availability calendar, and conduct interviews. |
| Supervisor | The appraisal process owner (typically HR leadership) | Own the process end to end: create and lock cycles, schedule interviews, keep stalled evaluations moving, and formally close evaluations. |
| Administrator | A separate, operations-managed list of trusted accounts | Configure the application itself — things like the competency dictionary and scoring settings. |

> **Note:** Your Employee, Manager, and Supervisor standing is worked out automatically the moment you sign in, based on your place in the organization chart, while Team Member is conferred when you're picked for a specific evaluation's feedback team — you can hold more than one at a time (everyone is always an Employee, and you might also be a Manager, and a Team Member on a colleague's evaluation this cycle). A Supervisor can additionally grant the Supervisor capacity to someone else. Being an Administrator is different: it's a fixed list kept by your operations team, not something derived from the org chart.

## Appraisal cycles

Every evaluation happens inside an appraisal cycle, and a cycle moves through three stages, in one direction only:

1. **Planning** — the cycle exists and is being configured (which competencies apply to which parts of the organization), but no evaluations can start yet.
2. **Active** — the cycle is open for business. Evaluations can only be started while a cycle is Active, and only one cycle can be Active at any time.
3. **Closed** — the cycle is finished. No new evaluations can start against it, but closing a cycle never deletes or cancels evaluations that are still in progress — they carry on to completion normally.

## Competencies — what you are graded on

Every evaluation grades a set of **competencies** — specific, observable skills and behaviors — organized into three categories, each split into three subcategories, nine in total:

| Category | Subcategory | What it covers |
|---|---|---|
| Expertise | Theoretical Knowledge | Core concepts, principles, and domain theory |
| Expertise | Applied Skills | Technical abilities applied to real tasks |
| Expertise | Practical Experience | Cumulative hands-on professional experience |
| Insight | Processes | Adherence to organizational workflows and standards |
| Insight | Planning | Personal workflow and time management |
| Insight | Estimation | Task and resource estimation accuracy |
| Commitment | Responsibility | Work ethics, professional development, best practices |
| Commitment | Communication | Professional communication at all levels |
| Commitment | Mentorship | Knowledge sharing and colleague support |

Which of these competencies actually appear on your evaluation depends on three things about you: your **role family** (your broad discipline — for example Software Engineering or Business Analysis), an optional **specialization** within that family (if you don't have one set, you're treated as a generalist within your family), and your **stage-level** (your seniority). Every competency also shows a **scope** description — a short statement of what mastery looks like at your specific level — so grading has a concrete point of reference instead of relying on a grader's gut feeling.

> **Note:** The competency set on your evaluation is fixed the moment the evaluation starts. If the competency configuration changes afterward — new competencies added, definitions edited, and so on — it never reaches back into an evaluation that's already in progress.

## Grades

Each competency is graded on a four-point scale:

| Grade | Stands for | What it means |
|---|---|---|
| S | Superior | Performance significantly exceeds expectations at this level |
| R | Regular | Performance meets expectations at this level |
| U | Unsatisfactory | Performance falls short of expectations at this level |
| N | Not Utilized | The competency doesn't apply, or wasn't demonstrated, at this level |

Depending on how far an evaluation has progressed, up to three separate grades exist for each competency — one from the employee (self), one combined from the team (if peer feedback was requested), and one from the manager. See Scores and what they mean below for how these combine into an overall result, and Privacy at a glance for who can see which grade, and from when.

## Scores and what they mean

Once the manager submits their review, the application calculates a score for each category (Expertise, Insight, Commitment) plus a single final score for the whole evaluation.

Not every grade counts equally. Self-grades count for 20% of the score, team feedback for 30%, and the manager's grades for 50% — so the manager's assessment carries the most weight, followed by the team, then the employee's own self-assessment.

> **Note:** If a round didn't happen at all — no team feedback was requested, or a stalled self-round was waived by a Supervisor — it's left out of the calculation entirely, and the remaining rounds are rebalanced to cover the full 100% between them. A missing round is never treated as a zero, so it never drags the score down.

As a rule of thumb, if every grade that did participate came back Regular, the final score lands around 100. The score is then read against five bands:

| Score | Level | What it means |
|---|---|---|
| Up to 76 | Weak | Performance is significantly below expectations. A formal improvement plan is required. |
| Up to 89 | Insufficient | Performance is below standard. Active guidance from the manager is needed. |
| Up to 105 | Expected | Performance meets standard expectations for the current level. |
| Up to 119 | Good | Performance exceeds expectations. Eligible for a bonus or formal recognition. |
| Up to 150 | Outstanding | Performance consistently exceeds expectations. Promotion is strongly recommended. |

## The life of an evaluation

Every evaluation moves through a fixed sequence of stages, driven by people submitting their input rather than by a calendar — there's no automatic time-based advance; a stage only changes because someone completed an action.

- **Open** — the employee's self-assessment and (if requested) peer team feedback both happen in this stage.
- **In Review** — once the self-assessment is done, and team feedback is either done or wasn't requested, the evaluation moves here for the manager's review.
- **Ready** — once the manager submits, scores are calculated and become visible; this is also the stage where the interview gets scheduled and held.
- **Closed** — the final stage, reached once the interview's outcome has been recorded and a Supervisor formally closes it. Grades and scores were already visible from Ready; Closed additionally reveals the interview's written feedback and any next-period goals.

A Supervisor can also withdraw an evaluation that's stuck at any of these active stages — for example, one started for the wrong person, or one nobody has responded to for far too long — rather than leaving it stalled indefinitely.

Each grading round has its own relationship with its deadline:

> **Warning:** The self-assessment deadline is strict — a late draft save or a late submission is rejected outright, so don't leave your self-assessment until the last day.

The team deadline works differently: it doesn't reject a late peer submission the same way, but it does gate when the round can be wrapped up — once it passes, the manager (or a Supervisor) may finalize the round even if not every teammate has responded, so the evaluation isn't held up by one non-responder. The manager deadline is different again — it's a reminder rather than a block; a late manager submission is never rejected, since it's the single most influential input in the score.

## Privacy at a glance

- **Individual peer grades are never shown to anyone but the person who gave them** — not the employee, not the manager. Only the combined (cumulative) team grade is ever shown to anyone else.
- The employee sees the manager's grades, the team's cumulative grade, and the manager's written feedback only once the evaluation reaches Ready — never before.
- Written peer feedback is anonymous and goes to the manager only; the employee never sees it, individually or combined.
- Reports and analytics screens never display a group smaller than three people — a small group is hidden rather than shown, so nobody can be identified by working backward from a tiny statistic.
