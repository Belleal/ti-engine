# For Administrators

Being an Administrator is unlike every other capacity in this guide — it has nothing to do with grading, managing, or overseeing evaluations. It's about configuring the application itself: the competency dictionary, the relevancy model behind scoring, and the shape of the organization's role families. This chapter covers the Administration screens — who reaches them, what each one lets you change, when your changes actually take effect, and the safety rails that keep every edit recoverable.

## Who is an administrator

Administrator status doesn't come from the organization chart the way your other capacities do. Being an Employee, Manager, or Supervisor is worked out automatically from where you sit in the organization, and being a Team Member comes from being picked for a specific evaluation's feedback team — but Administrator is different: it's a separate list of trusted accounts, kept directly by your operations team, and it isn't derived from anything else you hold.

If your account is on that list, an **Administration** section appears in your sidebar, giving you access to everything covered in this chapter. If it isn't, that section doesn't appear at all — Administrator status is entirely independent of whatever else you can already do in the application.

## The Configuration screen

**Configuration** is the landing screen for Administration, and it works more like a control center than an editor of its own. It shows a running feed of every configuration change that's been made, each one kept as its own version, with the option to restore any earlier one. It also offers an export: a bundle of the current configuration that you hand off to the development team, who commit it into source control as part of a release.

## What you can edit

Four editor screens, reached from Configuration, cover the parts of the application that are meant to be tuned rather than hard-coded.

### Competency Texts

**Competency Texts** is where you edit each competency's name, description, and per-level scope anchors, in both English and Bulgarian side by side. This screen was built specifically for the Bulgarian-translation review pass, so both languages are always visible together instead of being handled on separate screens.

### Archetype Assignment

**Archetype Assignment** is where you choose which relevancy archetype — which curve of importance across the stage-levels — each competency uses. A preview of the curve appears alongside the picker, so you can see its shape before you commit to it.

### Archetype Curve Editor

**Archetype Curve Editor** is where the archetypes themselves live. For each one, you can edit its name, its description, and the twelve individual weights — one per stage-level — that make up its curve.

### Role Families

**Role Families** is where you edit each role family's name and description, and manage the specializations available within it.

## When changes take effect

This is the one thing worth understanding clearly before you make any edit here: not everything you save takes effect the same way.

Competency texts, and an archetype's name and description, are stored as translation labels rather than as live data. Editing them versions the change and makes it exportable, but it only becomes visible to everyone once that export has been committed and the application redeployed — it will not appear in the running application right away.

Archetype assignments, an archetype's own twelve weights, role-family structure, and active competency sets work differently: they're stored data, not translation labels, so a save takes effect live — immediately, for evaluations that start from that point on.

> **Note:** Either way, an evaluation already in progress is never touched. Every evaluation carries its own frozen snapshot from the moment it starts, so nothing you change here — live or not — reaches back into one that's already under way.

## Safety rails

Every save is checked twice before it's accepted: once for format, and once against the application's own business rules — for example, a reference to a competency or an archetype has to actually exist. A save that fails either check is rejected outright, with the specific problem reported back to you.

Every change that does get accepted is versioned, which is what makes the change feed and the restore option on Configuration possible.

> **Note:** A restore isn't exempt from any of this — reapplying an older version runs it through the same validation as a brand-new save, so a version that no longer fits the application's current rules is rejected rather than silently reapplied.
