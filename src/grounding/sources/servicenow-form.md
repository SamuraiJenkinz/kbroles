<source id="SNOW_FORM" title="ServiceNow Technical Knowledge Article Form" version="live" url="https://mmcnow.service-now.com/kb_view.do?sysparm_article=KB18801781">

<!-- section:required-fields -->
## Required Fields

The ServiceNow Technical Knowledge article form enforces the following required fields. Field status is classified as `SNOW_REQUIRED` (ServiceNow enforces — form will not save without it), `ORG_REQUESTED` (required by MMC Knowledge team practice, not enforced by ServiceNow), `AUTO` (auto-populated), or `OPTIONAL`.

- **Knowledge base** (SNOW_REQUIRED + AUTO) — Pre-filled as "Colleague Technology". Do not change.
- **Short description** (SNOW_REQUIRED) — Article title. Must follow the 4-part naming convention. Hard limit: 160 characters.
- **Summary** (SNOW_REQUIRED) — HTML field. 1–2 sentences on what the article covers and when it applies.
- **Problem** (SNOW_REQUIRED) — HTML field. The specific issue, scenario, or question the article addresses.
- **Resolution** (SNOW_REQUIRED) — HTML field. Solution and steps. Must include Configuration Item, SME, assignment group, OPCO, region. No passwords or external download links.
- **Category** (ORG_REQUESTED) — Not enforced by ServiceNow but required by the org. Mostly "Software"; own sections for Operating Systems, ServiceNow, and Procedure/SOP articles.
- **Subject matter expert** (ORG_REQUESTED) — Lookup field for named SME individual. If blank, defaults to author.
- **SME Group** (ORG_REQUESTED) — Team or group the SME belongs to. Required alongside the individual SME.

<!-- section:short-description -->
## Short Description Field

The Short description field (SNOW_REQUIRED) is the article title. It is the primary searchable heading shown in ServiceNow search results and in any linked references to the article.

Rules:

- Hard limit: 160 characters — abbreviate if needed (e.g. "management" → "mgmt").
- Must follow the 4-part naming convention: `[Application/Topic] - [Type Descriptor] - [OPCO or Line of Business] - [Region]`.
- Region options: EMEA, NASA, APAC, Global.
- OPCO: specific operating company name, or "All LoBs" if global.
- Refer to KB0020882 and KB0022991 for the full naming convention SOP.

<!-- section:article-body -->
## Article Body Field

The article body is composed of three HTML fields that appear in sequence on every Technical Knowledge article:

- **Summary** — 1–2 sentence description of what the article covers and when it applies.
- **Problem** — the specific issue, scenario, or question the article addresses.
- **Resolution** — solution and steps; see the Resolution Field section below.

All three fields support rich HTML including images, links, tables, and collapsible sections (via `<details>`/`<summary>` HTML or the Insert Accordion option in the rich-text editor).

<!-- section:resolution-field -->
## Resolution Field

The Resolution field (SNOW_REQUIRED) contains the solution and steps for the problem the article addresses. Content requirements differ between Software articles and Support Process articles.

For Software articles, Resolution must contain 11 items: name of software, SME, OPCO/region, one or two sentence summary, software description, access method, error messages/common issues, screenshots, support processes, Configuration Item as listed in ServiceNow, and support information (assignment group names, email addresses, individual names for on-call/escalation).

For Support Process articles, Resolution must contain 7 items: name of process, SME, OPCO/region, one or two sentence summary, relevant information (process summary, screenshots, web addresses, links to resources), most relevant Configuration Item, and support information (assignment group names, email addresses, escalation contacts).

Both types must comply with security rules: no external download links, no passwords or credentials to specific systems. Refer to KB0020882 for the full Resolution field content requirements.

<!-- section:configuration-item -->
## Configuration Item Field

The Configuration Item (CI) reference must appear in the Resolution field of every Technical Knowledge article. The CI value must match an entry in the ServiceNow CMDB for the application, service, or product the article covers.

For Software articles, the CI is the specific software product entry. For Support Process articles, the CI is the most relevant entry for the process (for example, the ticketing system or the service the process operates against).

If the correct CI cannot be identified, consult the SME or the CTSS Knowledge team before publishing.

<!-- section:optional-fields -->
## Optional Fields

The following ServiceNow form fields are optional for standard Technical Knowledge article submissions and are only needed in specific circumstances:

- **Can Read** (OPTIONAL) — Access control for who can view the article. Set by Workday functional code. Leave as default unless instructed.
- **Cannot Read** (OPTIONAL) — Explicit deny list for viewing. Leave blank in standard submissions.
- **Source task** (OPTIONAL) — Links the article to an originating ticket or task. Leave blank unless the article was created in response to a specific task.
- **Attachment link** (OPTIONAL) — Checkbox that adds an attachment link in the article header. Use only when a top-level attachment link is needed immediately.
- **Display attachments** (OPTIONAL) — Checkbox that shows all attachments at the bottom of the article. Only tick if the article has documents only, no images. Mixed attachments (images and documents) look messy — embed links in the Resolution field instead.

<!-- section:workflow-fields -->
## Workflow State Fields

The ServiceNow form also contains workflow state fields that track the article through its lifecycle. These fields are auto-populated and not directly authored.

- **Number** (AUTO) — Auto-generated KB article ID (e.g. KB18801781).
- **Author** (AUTO) — Auto-filled with the logged-in user's name.
- **Version** (AUTO) — Auto-incremented by ServiceNow on each approved revision.
- **Workflow** (AUTO) — Read-only. States: Draft → (under review) → Published → Retired.
- **Valid to** (AUTO) — Auto-set to 1 year (365 days) from publication date. Do not manually change.
- **Language** (AUTO) — Defaults to English. Change only for translated versions.

</source>
