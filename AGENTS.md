# Architecture Decisions

- Keep each major business area in its own route and store module so payroll rules and access controls remain isolated from existing ERP workflows.
- Persist shared, sensitive payroll data through the app’s existing authenticated database client with row-level policies; keep salary math in a pure shared calculation module so overview and cards agree.
