# Fimmick Total CRM + AI Ops Platform Roadmap

Status: working product direction for `ui-delight-maker`  
Audience: product, engineering, operations, sales, client success, finance, and leadership  
Last reviewed: 2026-08-26

## 1. Executive assessment

The repository is already substantially beyond a UI prototype. It has a credible ClientOps core:

- lead capture, qualification, pipeline movement, quotes, approvals, and quote-to-job-sheet handoff;
- account, contact, campaign, relationship, client-success, renewal, and task workspaces;
- five n8n-backed AI workflows with run records, tool-call records, confidence, and human review;
- Neon Postgres, Neon Auth, server-side capability checks, audit history, teams, invitations, and scoped administration;
- database contract tests, route/read-model tests, linting, type checking, and migration verification.

The product should therefore not be rebuilt as another generic CRM. Its strongest position is:

> **Fimmick Total CRM is the operating system for acquiring, converting, delivering, retaining, and growing client relationships—with an observable and governable AI workforce embedded in every stage.**

The immediate product gap is not a lack of screens. It is the absence of a complete operating and governance layer that makes the existing CRM domains and AI workflows feel like one dependable system.

## 2. Current maturity scorecard

| Area | Current score | What is already strong | Main gap to close |
| --- | ---: | --- | --- |
| CRM data foundation | 8/10 | Accounts, contacts, leads, quotes, clients, engagements, tasks, campaigns, relationships | Finish one canonical entity model and remove dual-database ambiguity |
| Revenue operations | 8/10 | Revenue Desk, pipeline, quote approval, versions, job sheets | Add forecast governance, deal objects, communication capture, and closed-loop attribution |
| Client success / retention | 7/10 | Health, renewals, touchpoints, risk scoring, relationship signals | Add success plans, service outcomes, adoption, expansion, and playbook execution |
| Delivery / finance handoff | 6/10 | Accepted quote versions, job sheets, billing portions, Xero references | Add project delivery, resourcing, time/cost, invoice sync, margin, and revenue recognition |
| AI workflow execution | 7/10 | Run ledger, tool calls, confidence, approvals, n8n callbacks | Add enforced configuration, retries, replay, budgets, prompt/model versions, evaluations, and incidents |
| AI observability | 5/10 before this tranche | Recent runs and basic confidence | Add fleet health, failures, stuck runs, approval backlog, cost, quality, and SLA monitoring |
| Security / administration | 8/10 | Capability model, scoped management, overrides, audit, invitation flow | Make all product navigation capability-aware and test policy coverage continuously |
| Analytics | 6/10 | Revenue, pipeline, conversion, agent, and task reports | Add semantic metrics, cohorts, attribution, forecast accuracy, profitability, exports, and scheduled reports |
| Product integrity | 6/10 | Many server-backed actions and strong correctness work | Remove or complete every control that currently changes only local UI state |
| Platform readiness | 6/10 | Vercel, Neon, tests, migrations, modular server/read-model layers | Add tenancy, integration management, operational SLOs, data contracts, and release controls |

## 3. Product principles

### 3.1 One relationship graph, not separate mini-CRMs

Accounts and contacts are the durable identities. Leads, deals, quotes, campaigns, projects, engagements, invoices, tasks, touchpoints, and AI runs attach to that graph rather than duplicating company/contact data.

### 3.2 Every AI action has an owner, policy, evidence, and outcome

An AI run is not complete merely because a model returned text. Each run needs:

- trigger and requesting user;
- subject and account context;
- prompt/policy/model version;
- tools and data accessed;
- confidence and evaluation outcome;
- human decision where required;
- downstream action and business outcome;
- cost, duration, retry history, and audit event.

### 3.3 Human approval is a policy, not a hard-coded page

Approval behavior should be decided by action risk, confidence, client tier, financial impact, data sensitivity, and role—not only by the workflow name.

### 3.4 No decorative controls

A button, switch, slider, export, replay, or automation state must either:

1. perform a real server-side action and record its result; or
2. be clearly presented as read-only or unavailable.

### 3.5 Work is organized by outcomes

The primary navigation remains lifecycle-oriented:

- **Today** — prioritized work and exceptions;
- **Acquire** — marketing, inbound, qualification, and prospecting;
- **Convert** — opportunity, quote, approval, commercial, and handoff;
- **Deliver** — onboarding, project, service, billing, and margin;
- **Retain & Grow** — relationship, success, renewal, expansion, and advocacy;
- **Operate** — AI Ops, automation, analytics, integrations, data quality, and administration.

## 4. Target platform architecture

### Layer A — Customer and relationship system of record

Canonical entities:

- tenant / business unit;
- account;
- contact and identity/channel endpoints;
- lead;
- deal / opportunity;
- quote and quote version;
- contract / order;
- project / engagement / service subscription;
- invoice / payment / revenue schedule;
- campaign and attribution touch;
- interaction / message / meeting / note;
- task / approval / playbook step;
- product / service / pricing rule.

### Layer B — Lifecycle workspaces

Each workspace should share the same account timeline, permissions, search, saved views, activity model, and command patterns.

1. **Revenue Desk** — pipeline, next best action, forecast, and manager inspection.
2. **Account 360** — stakeholders, relationship map, commercial history, delivery, finance, risk, and opportunities.
3. **Deal Room** — qualification, mutual action plan, quote, approval, communication, and close plan.
4. **Delivery Desk** — onboarding, projects, milestones, blockers, capacity, costs, and client updates.
5. **Customer Success Desk** — health, outcomes, adoption, touchpoints, renewal, expansion, and advocacy.
6. **Finance Desk** — job sheet, billing plan, invoice status, collections, gross margin, and revenue recognition.
7. **Campaign Desk** — audience, consent, campaign execution, follow-up, attribution, and conversion.

### Layer C — AI Ops control plane

Required components:

- agent catalogue and ownership;
- versioned prompts, tools, schemas, and models;
- environment-aware configuration;
- enable/disable and emergency kill switch;
- confidence, risk, approval, and escalation policy;
- queue, concurrency, timeout, retry, and idempotency policy;
- token and monetary budgets;
- run, step, tool, and callback traces;
- evaluation datasets and quality scores;
- incident, regression, and drift detection;
- replay from an immutable input snapshot;
- release, canary, rollback, and audit history.

### Layer D — Automation and integration fabric

n8n can remain the initial workflow runtime, but ClientOps must own the policy and record of truth.

Priority integrations:

- Gmail / Microsoft 365 mail and calendar;
- WhatsApp Business and messaging channels;
- website forms and chat;
- advertising and analytics platforms;
- Xero or another accounting platform;
- CMS, ecommerce, and customer data sources;
- Google Drive / SharePoint document context;
- Slack / Microsoft Teams operational notifications;
- Fimmick AEO/GEO, social listening, and AI marketing products.

Each integration needs connection health, credential ownership, scopes, last sync, failure queue, replay, and audit.

### Layer E — Data, intelligence, and governance

- semantic metric definitions;
- event and attribution model;
- data quality rules and ownership;
- consent, retention, deletion, and access policy;
- operational and business SLOs;
- cohort, funnel, forecast, margin, retention, and expansion analytics;
- AI cost-to-outcome and human-time-saved analytics.

## 5. Delivery roadmap

## Phase 0 — Integrity and canonical data (now)

Goal: users can trust every control and every cross-workspace number.

Required work:

1. Merge or supersede the Company Workspace invalidation fix and close all related stale-cache paths.
2. Populate `quotes.account_id` at creation and backfill existing quotes so account commercial history is real.
3. Complete the measured Supabase-to-Neon migration decision for every remaining repository.
4. Remove or clearly mark all local-only controls, including agent configuration, replay, timeline summary, and report export.
5. Add capability-aware navigation rather than allowing users to enter routes they cannot access.
6. Define canonical account/contact matching and duplicate merge rules.
7. Add migration, query, and write-path checks that enforce account linkage.

Exit gates:

- no fake write controls;
- no active dual-write without reconciliation;
- account timelines reconcile with source tables;
- all protected actions have server-side capability checks and audit records;
- database contract, type, lint, and full test suites pass.

## Phase 1 — AI Ops Control Tower (first implementation tranche)

This repository change introduces the first truthful operational view using the existing run ledger:

- fleet-wide runs, success rate, failures, approvals, stuck work, tokens, and confidence;
- per-agent run health and recent activity;
- bounded attention queue for stuck runs, recent failures, and pending approvals;
- direct review/inspection paths;
- removal of local-only pause, replay, model, threshold, and approval controls;
- clear distinction between code-defined catalogue state and enforceable runtime policy.

Next additions within this phase:

- run-detail trace with tool calls and callback history;
- failure classification and resolution state;
- real retry and replay with idempotency protection;
- approval age, owner, SLA, and escalation;
- webhook/configuration health checks;
- latency percentiles, error rate, cost estimate, and queue depth;
- alert rules and an AI Ops incident inbox.

Exit gates:

- every failed/stuck run can be investigated from one screen;
- retry/replay is safe, authorized, idempotent, and audited;
- approval backlog has owners and SLAs;
- operations can distinguish workflow failure, model failure, tool failure, callback failure, and policy rejection.

## Phase 2 — Enforced AI governance

Add a versioned policy model rather than editable browser state.

Suggested tables:

- `agent_policies` — effective configuration by tenant/environment/workflow;
- `agent_policy_versions` — immutable change history and rollback target;
- `prompt_versions` — prompt, schema, owner, test status, release state;
- `model_policies` — allowed providers/models, fallback, region, and data classification;
- `agent_budgets` — daily/monthly token, cost, and run budgets;
- `agent_evaluations` and `evaluation_cases` — offline and production quality results;
- `agent_incidents` — severity, owner, affected versions, resolution, and postmortem;
- `agent_run_attempts` — retry lineage and effective policy snapshot.

All dispatch paths must:

1. resolve the effective policy;
2. reject disabled or over-budget work before creating an external job;
3. persist an immutable input and policy snapshot;
4. enforce timeout, retry, and approval rules;
5. write an audit event for policy-sensitive actions.

Exit gates:

- UI state and runtime behavior cannot diverge;
- every production prompt/model change is versioned and reversible;
- release requires evaluation thresholds;
- cost and quality can be attributed to workflow, version, account, and business outcome.

## Phase 3 — Total CRM operating model

### 3.1 Deal and forecast management

- first-class deal/opportunity object;
- amount, probability, stage history, expected close, competitors, products, and next step;
- manager forecast categories and commit review;
- AI-assisted risk and next-best-action with explainable evidence;
- forecast accuracy and stage-conversion analytics.

### 3.2 Omnichannel relationship timeline

- email, calendar, WhatsApp, form, campaign, call, note, quote, task, project, invoice, and AI activity;
- threading and participant resolution;
- consent and communication preference enforcement;
- AI summaries linked back to source interactions.

### 3.3 Delivery and profitability

- project templates, milestones, dependencies, owners, capacity, and status;
- scope/change-order linkage to accepted quote versions;
- planned versus actual time and cost;
- billing milestones, invoice sync, collections, gross margin, and profitability;
- client-facing update workflow.

### 3.4 Customer outcomes and growth

- success plan, goals, measurable outcomes, adoption signals, and executive sponsor;
- onboarding plan and time-to-value;
- health model with transparent factors;
- renewal plan, expansion whitespace, advocacy, and reference readiness;
- coordinated sales and client-success ownership.

Exit gates:

- one account view reconciles pipeline, delivery, finance, relationship, and AI activity;
- quote-to-cash and renewal workflows are closed-loop;
- leadership can forecast revenue, capacity, margin, retention, and AI operating cost from governed metrics.

## Phase 4 — Fimmick intelligence network

Use the platform as the orchestration layer across Fimmick products and client data:

- AEO/GEO opportunities become account signals, tasks, campaigns, and measurable outcomes;
- social listening creates service, risk, and content opportunities;
- campaign and commerce systems feed revenue attribution;
- reusable industry playbooks package Fimmick expertise into governed AI workflows;
- benchmark models compare account performance without exposing client-confidential data.

## 6. Priority backlog

### P0 — correctness and trust

- populate and backfill quote-account linkage;
- finish Company Workspace invalidation coverage;
- complete Supabase/Neon source-of-truth decisions;
- remove remaining fake controls and exports;
- add capability-aware navigation;
- add account/contact deduplication and merge audit.

### P1 — operational AI

- run detail and tool-call trace;
- failure taxonomy and incident state;
- retry/replay with immutable inputs and idempotency;
- approval SLA and escalation;
- webhook/integration health;
- per-workflow cost and quality metrics.

### P1 — total CRM

- first-class deals and stage history;
- interaction/message timeline;
- forecast and manager review;
- delivery/project workspace;
- invoice/payment sync and margin;
- client outcome and expansion plans.

### P2 — scale

- tenant and business-unit isolation;
- data residency and retention controls;
- integration marketplace and connection administration;
- configurable objects/fields and workflow builder;
- scheduled reports, exports, APIs, and webhooks;
- mobile and field-work experience.

## 7. KPI framework

### CRM business KPIs

- lead response time and qualification SLA;
- stage conversion and sales cycle;
- weighted pipeline and forecast accuracy;
- quote approval/acceptance cycle;
- onboarding time-to-value;
- project delivery variance and gross margin;
- renewal rate, net revenue retention, expansion, and churn;
- relationship coverage and stakeholder risk;
- campaign-sourced pipeline and revenue.

### AI Ops KPIs

- run success rate and p50/p95 latency;
- stuck, retry, and callback failure rate;
- approval rate, rejection rate, and approval age;
- confidence calibration and evaluation pass rate;
- production regression and incident rate;
- token/cost per successful outcome;
- human minutes saved versus review minutes added;
- downstream acceptance, conversion, retention, or revenue impact;
- percentage of runs with complete trace, policy version, and outcome linkage.

## 8. Definition of done for any AI-powered feature

An AI feature is production-ready only when it has:

- an explicit owner and user outcome;
- typed input/output and validation;
- source permissions and data classification;
- prompt/model/tool version capture;
- timeout, retry, idempotency, and failure behavior;
- confidence and risk policy;
- human approval where required;
- audit log and run trace;
- offline evaluation cases and release threshold;
- production quality, latency, and cost metrics;
- rollback and incident procedure;
- downstream business outcome measurement.

## 9. Recommended next engineering sequence

1. Land Phase 0 data-linkage and invalidation fixes.
2. Land the AI Ops Control Tower read model and truthful UI.
3. Add run detail, tool-call trace, failure resolution, and safe replay.
4. Introduce versioned agent policies and enforce them in dispatch.
5. Complete Supabase-to-Neon migration and remove legacy repositories.
6. Build first-class deals and omnichannel interactions.
7. Add delivery/project and finance integration.
8. Add governed evaluations, budgets, incidents, and release management.
9. Expand from ClientOps into the Fimmick cross-product intelligence network.
