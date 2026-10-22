# Design — An application time zone for calendar days, on the server, the screens and the jobs

| | |
| --- | --- |
| **Date** | 2026-10-22 |
| **Packages** | `packages/core`, `packages/web-framework` |
| **Status** | Decided by Boris on 2026-10-22 (§3); the rules in §4 follow from the decision and the measurements in §6. |
| **Version target** | core `1.20.0`, web-framework `1.59.0` |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-550`](https://belleal.youtrack.cloud/issue/CA-550), under [`CA-11`](https://belleal.youtrack.cloud/issue/CA-11); competence's [`CA-549`](https://belleal.youtrack.cloud/issue/CA-549) depends on it |

---

## 1. Why

An application has days: "today", a deadline, "overdue", an interview's date. People use it in a place, so its days
turn over at that place's midnight. The framework has no idea where that is.

- **The server reads the UTC date.** Its day turns over at 02:00 or 03:00 in Sofia, so for those hours each night
  "today" is still yesterday.
- **A screen reads the device's clock.** That is a day either side of the server's for anyone in another zone, and it
  differs between two people looking at the same record.
- **A daily job runs at a UTC hour**, so "at 06:00" means 08:00 or 09:00 in Sofia and moves by an hour twice a year.
- **E-mail notice intervals count from UTC midnight**, so a daily summary goes at 02:00 or 03:00 local time.

Competence met all of this (CA-546 to CA-549). It built its own answer: `COMPETENCE_TIME_ZONE`, a module that reads
today in it, and screen helpers that read a day and an hour in it. Nothing in that answer is competence's except the
name of the setting.

## 2. What exists

- **core.** Settings are loaded from `bin/settings.json`, overridden by `TI_*` variables and then frozen (`utils/config.js`).
  `localization.language` is the deployment's language, and `localization.getSystemLanguage()` reads it.
  `tools.getUTCDateString()` exists and is UTC by name.
- **web-framework.**
  - `/app/config` sends what the browser needs before anything else, built in `TiWebAppManager.processDataRequest`.
    The client keeps it as `tiApplication.configuration`.
  - `tiToolbox.formatDate( value )` writes a `YYYY-MM-DD` as that day. It writes a timestamp's day on the device's
    clock. The Feedback inbox ("submitted") and What's new ("Updated on") pass it timestamps.
  - `JobScheduler.periodStart()` begins an hourly period on the UTC hour and a daily one at `at` in UTC.
  - `NotificationService.intervalStart()` begins an interval of `hours` from UTC midnight. `nextUTCMidnight()` pauses
    sending after a provider's daily limit until the provider's day turns over.
- **competence** (consumer). `application/time-zone.js` holds `resolveTimeZone`, `instantOf`, `dateIn`,
  `wallClockIn`, `today`. Its screen script holds `organizationClock`, `organizationDate`, `organizationDay` and
  `formatInstant`. These are the shapes this design takes over.

## 3. Decided (Boris, 2026-10-22)

1. Every calendar-day rule uses the organization's zone, on the server and on every screen. Instants (submitted, sent,
   a job's run) stay UTC timestamps. Everyone sees the same "today", whatever zone their device is in. (CA-549.)
2. That belongs in ti-engine, not in the application: "Yes, we should build it into ti-engine."

## 4. The rules

### 4.1 The setting

- **`localization.timeZone`**, overridden by **`TI_LOCALIZATION_TIME_ZONE`**: an IANA name such as `Europe/Sofia`. It
  sits beside `localization.language` because the two together say where the deployment is.
- **Unset means what happens today**: the server reads UTC, and a screen keeps the device's clock. No existing
  deployment changes behaviour by upgrading.
- **A name the runtime does not know fails the start** (`E_GEN_INVALID_ARGUMENT_TYPE`, reason `invalid-time-zone`).
  Read as UTC instead, it would move every deadline by hours without a word.
  - `start-instance` checks it before it constructs the service, and logs the zone it will use.
  - `TiWebServer` checks it again when built, for a host that builds the server itself. Unchecked, every
    `/app/config` and every job tick would fail instead (the review pass, §9).
- **A fixed offset is refused too.** Node accepts `+02:00` (measured on 24.22), but it is no place's zone and keeps
  no daylight-saving rule. A browser whose `Intl` lacks offset zones would read the device's clock while the server
  read the offset. `Etc/GMT-2` is the IANA name of a fixed zone, and is accepted.
- **The name is canonicalised** through `Intl` (`europe/sofia` → `Europe/Sofia`). That is the one form the browser
  receives, which compares, logs and caches as one zone. It is the runtime's own name, which ICU may keep as a legacy
  alias: Node 24.22 writes `Asia/Kolkata` as `Asia/Calcutta`. Every `Intl`, the browser's included, reads either as the
  same zone.

### 4.2 core: `@ti-engine/core/time-zone`

| Function | Answers |
| --- | --- |
| `getTimeZone()` | The zone, canonical; `"UTC"` when unset. |
| `isTimeZoneSet()` | Whether the deployment named one. The browser is sent a zone only then. |
| `verifyTimeZone()` | Resolves the setting now and returns the zone; throws on an unknown name. |
| `resolveTimeZone( name )` | `name` canonical, `"UTC"` for blank; throws on an unknown name. |
| `today( now?, zone? )` | `YYYY-MM-DD` in the zone at `now` (a `Date` or milliseconds). |
| `dateIn( instant, zone? )` | `YYYY-MM-DD` the zone shows at an instant. |
| `wallClockIn( instant, zone? )` | `YYYY-MM-DDTHH:MM` the zone shows at an instant. It compares with a stored `date` + `T` + `time` as text. |
| `instantsOf( date, time, zone? )` | Every instant the zone's clock shows that date and time, earliest first: two in a repeated hour, one otherwise, none for anything that is not a date and time. |
| `instantOf( date, time, zone? )` | The first of them; `NaN` for anything that is not one. |

Every `zone?` defaults to `getTimeZone()`. Formatters are kept one per zone, so a hot path formats instead of
building one each time.

**Daylight-saving changes** (§6.2 has the measurements):
- **A time the clock repeats** (03:30 on Sofia's autumn night) is its **first** occurrence. A period that starts
  there has started by the time either reading of that time is shown.
- **A time the clock skips** (03:30 on Sofia's spring night) is the instant the clock jumps to, read in the offset
  before the change. In Sofia that is 04:30 EEST.

### 4.3 web-framework: the browser

- **`/app/config` carries `timeZone`**: the zone when the deployment set one, else `null`.
- **`tiToolbox` reads it** from `tiApplication.configuration.timeZone`:

  | Helper | Answers |
  | --- | --- |
  | `getTimeZone()` | The zone, or `undefined` before the configuration arrives, when none was set, or for a zone this browser's `Intl` does not know. `Intl` reads `undefined` as the device's own zone, so `{ timeZone: tiToolbox.getTimeZone() }` is always safe to pass. |
  | `clock( at? )` | `{ date: "YYYY-MM-DD", minutes }` on the zone's wall clock, or the device's when there is no zone. |
  | `today( at? )` | `clock( at ).date`. |
  | `dayOf( value )` | A timestamp's day in the zone, as `YYYY-MM-DD`. A timestamp is a string with a time and an offset (`Z` or `±hh:mm`). A calendar date, a `Date`, a time without an offset, and anything `Date.parse` cannot read pass through unchanged. So does every value while there is no zone. |
- **`formatDate( value )` writes `dayOf( value )`.** The Feedback inbox's "submitted" and What's new's "Updated on"
  become the zone's day with no change of their own.
- **Calendar dates stay calendar dates.** A `YYYY-MM-DD` is formatted as that day at local midnight, as now. Giving it
  a `timeZone` would name the day before for a device west of the zone.
- **One formatter per zone, and the last answer kept** by instant and zone. A week grid asks for the clock once per
  cell, all at one `now`.

### 4.4 web-framework: jobs and notices

- **A daily job's `at` is read in the zone.** `"06:00"` means 06:00 where the organization is, and stays there across
  daylight-saving changes. The period begins at today's `at`, or yesterday's while today's is still ahead.
- **An hourly job's period begins on the zone's hour**: the instant `now` less what the zone's clock shows past the
  hour. That is the UTC hour for every whole-hour zone. In a half-hour zone (India) it is the half past.
- **A notice interval of `hours` counts from the zone's midnight.** A daily summary goes at local midnight, and a
  6-hour interval begins at 00:00, 06:00, 12:00 and 18:00 local time.
- **A boundary the clock shows twice begins an interval at each showing**, the latest one passed. In Sofia's repeated
  hour, an hourly interval is each real hour. Counted from the first showing alone, the second hour had no pass (the
  review pass). A job keeps the first showing, so it runs once; a notice pass may run twice, which is harmless, since
  delivery is at least once anyway.
- **A provider's daily limit stays on UTC** (`nextUTCMidnight`). It is the provider's day, not the organization's.
- **`periodStart( job, now, zone? )` and `intervalStart( hours, now, zone? )`** take the zone as an optional last
  argument, as the core helpers do, so a test or a caller can ask about any zone.

### 4.5 What an application does

- **Set `TI_LOCALIZATION_TIME_ZONE`.** Read every calendar day with `timeZone.today()` on the server and
  `tiToolbox.today()` on a screen. Pass a timestamp to `tiToolbox.formatDate`.
- **A job registered `at: "04:00"` runs at 04:00 local time** once the zone is set. Before, it ran at 04:00 UTC. An
  application that sets the zone states the hour it means.
- **The framework names no application's setting.** Competence's `COMPETENCE_TIME_ZONE` becomes
  `TI_LOCALIZATION_TIME_ZONE` in competence's own change: a deployment variable renamed in `wrangler.jsonc`, with
  INSTALL updated.

## 5. Rejected

- **A setter, `timeZone.setTimeZone( zone )`, for an application to state its own.** Settings are frozen once read,
  and a zone that changed at run time would change today under a request already reading it. The deployment states
  it, like the language.
- **The device's zone when none is set, sent as `null`, versus UTC.** Sending `"UTC"` when unset would move every
  screen of every existing deployment onto UTC dates on upgrade. `null` keeps them as they are.
- **The zone in `web-framework` alone.** Applications read today in modules that have nothing to do with the web
  (competence's evaluation rules), so the server half belongs with the settings in core.
- **`timeZone` on every `Intl` call in the toolbox.** A calendar date's local midnight, read in a zone west of the
  device's, names the day before (§4.3).

## 6. Measurements

### 6.1 The day at Sofia's midnight

Measured on Node 24.22.0 at 2026-10-21T21:30:00Z, which is 00:30 on the 22nd in Sofia (EEST, UTC+3):

| Reading | Result |
| --- | --- |
| `new Date().toISOString().slice( 0, 10 )` | `2026-10-21` |
| `dateIn( …, "Europe/Sofia" )` | `2026-10-22` |
| `toLocaleDateString()` on a device in Los Angeles | `10/21/2026` |

### 6.2 Daylight-saving changes, Europe/Sofia, 2026

- **Spring** (29 March, 03:00 EET → 04:00 EEST at 01:00Z):
  - `instantOf( "2026-03-29", "03:30" )` → `01:30Z`, which shows 04:30 EEST;
  - `instantOf( "2026-03-29", "06:00" )` → `03:00Z`.
- **Autumn** (25 October, 04:00 EEST → 03:00 EET at 01:00Z):
  - `instantOf( "2026-10-25", "03:30" )` → `00:30Z`, the first occurrence;
  - `instantOf( "2026-10-25", "06:00" )` → `04:00Z`.

The tests in §7 pin these values.

## 7. Verification

- **core:** `test/time-zone.test.js` covers:
  - today either side of Sofia's midnight;
  - canonical names;
  - an unknown name refused;
  - `instantOf` on both daylight-saving nights and on dates and times that are not ones;
  - `start-instance` refusing to start on an unknown zone.
- **web-framework:**
  - `/app/config` with and without a zone;
  - a daily job at 06:00 in Sofia on ordinary, spring and autumn days;
  - an hourly job in Kolkata;
  - a 6-hour and a 24-hour notice interval from Sofia's midnight;
  - the toolbox's `clock`, `today`, `dayOf` and `formatDate` with a zone, without one, and with one `Intl` does not know;
  - the Feedback inbox's date at 00:30 in Sofia.
- **Types** regenerated, and `check:types` clean.

## 8. Not in this change

- **`tools.getUTCDateString()`** stays as it is: it says UTC in its name, and callers that want UTC use it.
- **Competence's adoption** is competence's own PR (CA-549, competence#193), after both versions are on npm.
- **web-content's server-rendered dates** ([`CA-552`](https://belleal.youtrack.cloud/issue/CA-552)).
  `render/context.js` writes a timestamp in the process's zone. A date-only value parsed as UTC midnight is a day
  early west of UTC, which is a defect of its own. Passing the zone alone would fix the first and worsen the second,
  so the fix treats the two apart, in a web-content patch.

## 9. The review pass

`code-review` at high on `origin/master...HEAD` raised 8 findings. 6 were fixed, each with a test that fails without
the fix; 2 were declined.

**Fixed:**
1. **The feedback e-mail** dated an item by its timestamp's first ten characters, while the inbox showed the zone's
   day. It now uses `dateIn`.
2. **An hourly notice interval** left the second showing of the repeated hour without a pass (§4.4).
3. **`tiToolbox.clock()`** threw on an instant no clock can read once a zone was set, and did not without one. It
   now reads such an instant on the device's clock, as it would with no zone.
4. **`TiWebServer`** did not check the zone, so a host other than `start-instance` failed at every `/app/config`
   (§4.1).
5. **A fixed offset** was accepted (§4.1). Separately, the browser now warns once that it lacks the zone it was sent.
6. **JSDoc:** `DEFAULT_ZONE` lacked `@public`, and `clock()`'s shape is now the `TiClockReading` typedef.

**Declined:**
- **Exporting the wall clock as parts, to save slicing `wallClockIn`'s text.** The format, `YYYY-MM-DDTHH:MM`, is
  pinned by core's own tests. Every position read from it is exercised: the hour by the interval tests, the minutes
  by the hourly job in Kolkata, and the date by the daily jobs.
- **web-content** is named in §8 and filed as CA-552.
