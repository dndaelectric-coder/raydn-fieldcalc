# Raydn FieldCalc

A guided electrical walkdown and load calculation tool for field crews, built
around the 2024 Canadian Electrical Code, Part I, 26th edition, and the Alberta
amendments in force since April 1, 2025.

Built and used by Raydn Renewables, Edmonton area.

## What it is for

An apprentice or a crew member walks a house with a phone, answers what is in
front of them, photographs the evidence, and hands a complete record to a Master
Electrician. The Master Electrician makes every technical call.

It exists because the same things kept going wrong on real jobs. A basement that
was never measured. A floor area that was guessed at 1,600 square feet when the
City record said 2,104. A Rule 8 calculation that never got filed before the
utility was told a service size. A signed agreement naming the wrong
municipality. Every one of those is a gate in this app now.

## What it is deliberately not

This is a field evidence and decision support tool. It does not, and is built so
that it cannot:

- declare a house code compliant
- prescribe a conductor size or an overcurrent device
- promise a service size
- issue a final electrical recommendation
- print an automatic FAIL that implies a mandatory 200 A upgrade

Nothing says code compliant until a Master Electrician has completed the review
inside the app. A missing value never silently becomes zero. It becomes a
visible Unknown, and it blocks the gate until somebody resolves it.

## How the data works

Everything stays on the device. Jobs and photos are written to the phone's own
storage, so they survive closing the app and restarting the phone. Nothing is
uploaded anywhere unless a person chooses to send it.

There are four ways to send a job out: the phone's share tray with the job file
attached, a prefilled email, a shared Google Sheet job log, or a plain file
download. The Google Sheet route is optional and runs on a free Apps Script in
the owner's own Drive. The web app URL and the pass phrase are typed into
Settings on the device and are not in this repository.

The app installs to the home screen and runs with no signal, which is the
normal condition in a mechanical room.

## Running it

Static files, no build step, no dependencies.

```
python3 -m http.server 8811
```

Then open `http://localhost:8811/index.html`.

## Tests

```
node audit/reference.js    # the standing reference case, must never move
node audit/holes2.js       # thirteen logic tests, each one a real defect found by running it
```

The reference case is the Carson Knittig job, 30 Westwyck Link, Spruce Grove.
The hand calculation and the engine have to agree at 25,250 W and 105.2 A on a
299.6 m2 living area. If that test fails, the engine moved and something is
wrong.

## Code references

Rule numbers and short rule excerpts are quoted for identification and
verification. The Canadian Electrical Code is a CSA standard and is copyright
CSA Group. Buy the book. This app is not a substitute for it, and no rule text
here should be relied on in place of the published standard.

## Who maintains it

Dmitry Naboka, Master Electrician, ME# 13824
Raydn Renewables, Edmonton area
info@raydnrenewables.com | raydnrenewables.com
