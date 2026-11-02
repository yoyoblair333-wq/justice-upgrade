# Lantern quick-start guide

Lantern is a small command-line tool that turns any terminal into a status lamp.
This page is the delivery for milestone 1 of the MilestoneJudge live run.

## Install

Install Lantern with a single command:

    pip install lantern-cli

## Minimal example

Save this as `demo.py` and run it with `python demo.py`:

    from lantern import Lamp
    lamp = Lamp("build-status")
    lamp.light(color="green")
    lamp.blink(times=3)

## Configuration options

Lantern reads `lantern.toml` from the current folder. Options:

- `brightness`: a number from 0 to 100 that sets how bright the lamp is (default 70).
- `color`: the default lamp color, any CSS color name such as `green` or `orange`.
- `timeout`: seconds of inactivity before the lamp dims to half brightness.
- `sound`: `on` or `off`, plays a short chime when the lamp changes color.
