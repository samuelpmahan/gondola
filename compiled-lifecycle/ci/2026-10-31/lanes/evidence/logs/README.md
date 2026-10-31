# GitHub Actions job logs

Each `*.log` is the decoded UTF-8 text returned by GitHub Actions for the named job. The adjacent `job-log-index.json` records the run/job IDs, terminal status where available, exact byte count, and SHA-256 for each archived log.

The 2026-10-31 source-head capture at 07:26:45Z contains 13 of 14 terminal pull-request logs and the primary push log. PR run 41178477290 was still `in_progress` at capture time, so GitHub had not made a terminal decoded job log available. Its status and steps are in the dated `pr-job-statuses-20261031T072645Z.json` snapshot.
