# Website booking API — for himalhealthclinic.com.np

This is how the clinic's website asks for a doctor's appointment in ClinicNP, the software the clinic runs on. The website shows the doctors and their free times. A visitor picks one and fills in their details. The request then waits in ClinicNP until the front desk confirms it or declines it.

**A request is not a confirmed appointment.** Tell the visitor that the clinic will confirm it. The clinic may text them when it is confirmed, if it has switched that on.

---

## 1. The basics

| | |
|---|---|
| Base URL | `https://clinicnp-hhc.infobytesnepal.com/api/public/v1` |
| Format | JSON in, JSON out (`Content-Type: application/json`) |
| Auth | `Authorization: Bearer <WEBSITE_API_KEY>` on every call |
| Time zone | Every date and time is Nepal time (`Asia/Kathmandu`, UTC+5:45) |
| Dates | `YYYY-MM-DD`, English (AD). Every answer also gives the Nepali date as `dateBs` |
| Times | `HH:MM`, 24-hour, for example `"21:00"`. Answers also give `"timeLabel": "9:00 PM"` |

### Keep the key on your server

The clinic gives you the key privately. **Call this API only from your server**: a Next.js Route Handler, a Server Action or `getServerSideProps`. Never call it from browser code. Never put the key in a `NEXT_PUBLIC_*` variable or send it to the browser in any other way. Anyone holding the key can create requests.

```ts
// app/api/book/route.ts on the website (example)
const CLINIC = "https://clinicnp-hhc.infobytesnepal.com/api/public/v1";

export async function POST(req: Request) {
  const form = await req.json();
  const res = await fetch(`${CLINIC}/bookings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLINICNP_API_KEY}`,
      "Content-Type": "application/json",
      // the visitor's address, so the clinic can limit abuse per visitor
      "X-Visitor-IP": req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    },
    body: JSON.stringify(form),
    cache: "no-store",
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
```

Use `cache: "no-store"` (or `export const dynamic = "force-dynamic"`) on every call. Free times change by the minute.

---

## 2. The booking rules

ClinicNP checks all of these. Your date and time pickers should follow them too, so visitors are not refused after filling in the form.

- **Hours:** 6:00 AM to 10:00 PM, every day. A visit is 15 minutes, so the last start time is **9:45 PM**.
- **Slots:** every quarter hour only: `06:00`, `06:15` … `21:45`.
- **Notice:** at least **3 hours from now**. At 6:00 PM the first time on offer is 9:00 PM. At 8:00 PM nothing is left today, so the first time is 6:00 AM tomorrow.
- **How far ahead:** up to **30 days**.
- **One person per slot per doctor.** A slot already booked, or held by another request, is not offered.

You don't have to work these out yourself. `GET /doctors` returns them in `window`, and `GET /doctors/{id}/slots` returns only times that can actually be booked.

---

## 3. Endpoints

### `GET /doctors`

Every doctor currently seeing patients, plus the booking window.

```json
{
  "ok": true,
  "accepting": true,
  "window": {
    "opensAt": "06:00",
    "closesAt": "22:00",
    "slotMinutes": 15,
    "leadHours": 3,
    "horizonDays": 30,
    "earliest": { "date": "2026-11-28", "dateBs": "2083-08-12", "time": "06:00" },
    "lastDate": { "date": "2026-12-27", "dateBs": "2083-09-12" },
    "timeZone": "Asia/Kathmandu"
  },
  "doctors": [
    { "id": "01J…", "name": "Dr. …", "qualification": "MBBS, MD", "specialty": "General Medicine" }
  ]
}
```

- `accepting: false` means the clinic has paused online booking. Show "Online booking is paused — please phone the clinic" instead of the form.
- Use `id` in the other calls. Photos and biographies stay on the website. This API has none.

### `GET /doctors/{id}/slots?date=YYYY-MM-DD`

The free times with one doctor on one day. You can send `?dateBs=YYYY-MM-DD` instead of `date`.

```json
{
  "ok": true,
  "doctorId": "01J…",
  "date": "2026-11-28",
  "dateBs": "2083-08-12",
  "slots": [
    { "time": "06:00", "label": "6:00 AM" },
    { "time": "06:15", "label": "6:15 AM" }
  ]
}
```

An empty `slots` list means nothing is free that day: it's fully booked, too soon, or more than 30 days away. Offer another day.

### `POST /bookings`

The visitor asks for an appointment.

```json
{
  "requestId": "3f1c2a9e-5b7d-4c1e-9a0b-2d6f8e4c1a77",
  "doctorId": "01J…",
  "date": "2026-11-28",
  "time": "10:00",
  "patient": {
    "name": "Sita Sharma",
    "phone": "9841234567",
    "sex": "female",
    "age": { "value": 34, "unit": "y" },
    "address": "Bhaktapur"
  },
  "reason": "Fever since Monday"
}
```

| Field | Required | Notes |
|---|---|---|
| `requestId` | **yes** | Your own unique id for this submission, 8–100 characters. A UUID from `crypto.randomUUID()` works. Create it **once** when the form opens, and send the same one again on a retry or a double-click. It is one request either way. |
| `doctorId` | **yes** | From `GET /doctors` |
| `date` **or** `dateBs` | **yes** (one of them) | Send one, not both |
| `time` | **yes** | One of the slots, for example `"10:00"` |
| `patient.name` | **yes** | Up to 100 characters |
| `patient.phone` | **yes** | A Nepali mobile number: 10 digits starting with 9. Spaces, dashes and a leading `+977` are accepted. Landlines are refused, because the clinic may text this number. |
| `patient.sex` | **yes** | `female` / `male` / `other` (or `f` / `m` / `o`) |
| `patient.age` | no | `{ "value": 34, "unit": "y" }`. `unit` is `y` (years), `m` (months) or `d` (days), and defaults to `y`. Send `null` or leave it out if not asked. |
| `patient.address` | no | Up to 200 characters |
| `reason` | no | Up to 300 characters |

Please don't collect anything else for this. The clinic stores only these fields.

**`201 Created`**: a new request.
**`200 OK`** with `"existing": true`: this `requestId` was already received. This is the same request, not a second one.

```json
{
  "ok": true,
  "existing": false,
  "booking": {
    "ref": "W7K3Q9DX",
    "status": "pending",
    "doctor": { "id": "01J…", "name": "Dr. …" },
    "date": "2026-11-28",
    "dateBs": "2083-08-12",
    "time": "10:00",
    "timeLabel": "10:00 AM",
    "timeChanged": false,
    "requestedAt": "2026-11-27T13:29:24.600Z"
  }
}
```

Show the visitor the `ref`. It's the code they quote if they phone the clinic. For example: *"Request received — your code is W7K3Q9DX. The clinic will confirm it."*

### `GET /bookings/{ref}`

Where a request has got to. Same `booking` shape as above.

| `status` | Meaning |
|---|---|
| `pending` | Waiting for the clinic |
| `confirmed` | Booked. `date` / `time` are the **confirmed** time. If the clinic agreed a different time with the patient, `timeChanged` is `true`. |
| `declined` | The clinic said no. The time is free again. |
| `expired` | Nobody answered before the time came |

The answer never includes the patient's name or phone number.

---

## 4. Errors

Every error looks like this:

```json
{ "ok": false, "code": "slot_taken", "message": "That time has just been taken. Please choose another.", "field": "time" }
```

`message` is written so it can be shown to the visitor as it is. `field`, when present, names the form field to highlight: `time`, `date`, `patient.phone` and so on.

| HTTP | `code` | What to do |
|---|---|---|
| 400 | `invalid` | A field is missing or wrong. Show `message` next to `field`. |
| 400 | `bad_date`, `bad_phone`, `bad_age` | As above |
| 401 | `unauthorized` | The key is missing or wrong. This is a setup problem; don't show it to visitors. |
| 404 | `doctor_not_found` | The doctor is no longer taking bookings. Reload the doctor list. |
| 404 | `not_found` | No booking has that `ref` |
| 409 | `slot_taken` | Somebody took the time a moment ago. Reload the slots and ask the visitor to pick again. |
| 422 | `too_soon` | Less than 3 hours from now |
| 422 | `outside_hours` | Not between 6 AM and 9:45 PM on a quarter hour |
| 422 | `too_far` | More than 30 days ahead |
| 429 | `too_many_pending` | This mobile number already has 3 requests waiting |
| 429 | `too_many`, `too_busy` | Too many requests in a short time. Ask the visitor to try later. Honour `Retry-After` if present. |
| 503 | `not_accepting` | Online booking is paused. Ask the visitor to phone the clinic. |

## 5. Limits

- 240 calls a minute in total from the website.
- 10 booking requests an hour per visitor. This is why `X-Visitor-IP` matters: without it, every visitor counts as the website itself.
- 5 booking requests a day, and 3 waiting at once, per mobile number.

## 6. Checklist before going live

- [ ] The key is in the website's server environment only. Search the browser bundle for it: it must not be there.
- [ ] `requestId` is created once per form, and the same value is re-sent on retry.
- [ ] The slot list is fetched fresh, never cached or built at build time.
- [ ] A `409` reloads the slots instead of just showing an error.
- [ ] `accepting: false` hides the form.
- [ ] The visitor is shown the `ref` and told the clinic will confirm.
- [ ] `X-Visitor-IP` is forwarded.

Questions about the clinic side go to the clinic. ClinicNP's own records of this feature are in `prod-docs/Memory.md` (C-029).
