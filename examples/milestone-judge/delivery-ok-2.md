# Lantern troubleshooting

This page is the revised delivery for milestone 2 of the MilestoneJudge live run.

## Common error messages

**Error: LampNotFound**
You used a lamp name that does not exist.
Fix: run `lantern list` and copy the exact lamp name.

**Error: BrightnessOutOfRange**
The `brightness` value in `lantern.toml` is below 0 or above 100.
Fix: set `brightness` to a whole number between 0 and 100.

**Error: ConfigParseError at line N**
`lantern.toml` has a syntax mistake, usually a missing quote.
Fix: open the file, go to line N and close the quote, then run `lantern check`.

## Still stuck?

Get further help by opening an issue at https://github.com/yoyoblair333-wq/justiceupgrade-app/issues
