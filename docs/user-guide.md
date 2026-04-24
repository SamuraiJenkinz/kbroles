# KB Assistant — User Guide

**Audience:** Pilot cohort users — anyone who has been granted the `KbAssistant.User` Entra App Role.

**What it is:** A chat assistant for the MMC Colleague Technology Knowledge Base. Ask it questions about writing, managing, or finding articles in ServiceNow. Every answer cites the specific SOP section backing it.

**What it isn't:** A search engine for the whole internet, a ticket system, a general-purpose chatbot, or a replacement for the SOPs themselves. It only knows three sources: KB0020882, KB0022991, and the ServiceNow article form schema.

---

## Getting Access

You need to be added to the pilot. If the URL sends you to `/access-denied`, click the **"Request access"** link — it opens a pre-addressed email to the CTSS Knowledge team with your sign-in details included. Once you're added, sign in again and you'll land on the role-select screen.

If sign-in fails with a different error (e.g. "tenant not allowed"), that's an administrator-side issue — forward the error page to the Knowledge team.

---

## Picking a Role

On the first screen you'll see two cards:

- **Knowledge Consumer** — you're a Tier I analyst or general MMC Tech colleague trying to **find** an article or **flag** one you spotted is wrong. Pick this if your question is "where do I look for…?" or "how do I report that…?"
- **KB Author / SME** — you're a Tier II/III support group member, SME, or Knowledge team member trying to **write, edit, or publish** an article. Pick this if your question is "how do I fill in the Short description field?" or "what goes in Resolution?"

**Your role shapes the chip suggestions and the tone of answers.** It does not restrict what you can ask — a Consumer can still ask Author-style questions and get an answer. But the suggested-prompt chips will only show the 5 Consumer chips or the 8 Author chips based on your pick.

**Change role any time:** click the role pill in the header → **Change role**. This clears the current conversation and returns you to the role-select screen. (There's a confirm dialog first.)

---

## Asking a Question

Three ways to ask:

1. **Tap a suggested-prompt chip.** Fastest path. Chips are sourced from the KB team's most common questions — 5 for Consumers, 8 for Authors. One click and the question is sent.
2. **Type freeform.** Enter to send. Shift+Enter for a newline.
3. **Follow up.** Ask "and then what?" or "how does that compare to…" — the assistant sees the conversation history and can answer in context. It will often re-use or refine the current citation.

**While it's thinking:** a three-dot typing indicator appears. The answer streams in word-by-word. If you need to cancel, click **Stop response** and start a new question.

**What happens under the hood:** the entire question goes to Azure OpenAI via the MMC corporate ingress (MGTI). Your question is never stored server-side — only a salted SHA-256 hash of it, for measurement purposes (so we can count how many unique questions were asked without seeing them).

---

## Understanding Citations

**Every grounded answer has exactly one citation.** It looks like a chip at the end of the answer: e.g., `KB0022991 · Flagging Articles`.

**Click the citation chip** — the source panel opens on the right side to that exact section. You can read the SOP text yourself and verify the answer came from it.

**Document colour-coding:**

| Colour | Source |
|--------|--------|
| Blue | KB0020882 (Authoring SOP) |
| Amber | KB0022991 (Management SOP) |
| Purple | ServiceNow Form schema |
| Red | Flagging / Lifecycle sections |
| Green | Publishing / Approval sections |
| Purple (secondary) | Attachments sections |
| Amber (secondary) | Categories sections |

Each colour is always paired with an icon — the system never uses colour alone.

**Panel footer:** there's an **"Open in ServiceNow ↗"** link that takes you to the live article in ServiceNow (requires ServiceNow access; opens in a new tab). Use this if you want to bookmark the article or see recent revisions.

**Re-opening a past citation:** scroll back through the chat, click any earlier citation chip. The panel re-opens to that source. This is useful when comparing two answers side-by-side.

---

## When the Assistant Can't Answer

If your question is **outside the three sources**, the assistant won't guess. You'll see a visually-distinct **fallback card** with:

> *"That information isn't in the loaded documents yet. Flag the gap to the CTSS Knowledge team via KB0022991."*

The fallback card has a different border, icon, and wording than a grounded answer — this is deliberate so you don't mistake it for a real answer.

**Flag a gap:** the fallback card has a **"Flag this gap to the CTSS Knowledge team"** button. Click it — a pre-filled email opens (to the Content Steward mailbox) with your unanswered question in the body. Send it. The Knowledge team will add it to their "content-gaps" backlog.

**If you think the assistant *should* have answered but didn't:** that's also worth flagging. The nightly eval suite is specifically designed to catch cases where the assistant refuses a question it *should* have answered — your feedback helps expand the eval coverage (Pitfall 15 in the project notes).

---

## Giving Feedback on an Answer

Every assistant message has **thumbs-up / thumbs-down** buttons.

- **👍** — silent. Captured as `rating: "up"` in telemetry.
- **👎** — opens a fixed-option dropdown:
  - `hallucinated` — the assistant stated something that isn't in the cited source
  - `wrong citation` — the answer is correct but the cited section is wrong
  - `incomplete` — the answer is partial or missed a key point
  - `other` — none of the above fit

**Why no free-text field?** PII risk — free-text feedback could accidentally capture personal info. Once the privacy-scrubbing pipeline is hardened (v1.x), free-text will be enabled.

**What happens with your feedback:** it goes to App Insights with the message_id + role + citation info. The Knowledge team reviews thumbs-down patterns monthly — repeated `hallucinated` reasons on a specific section mean that section's content needs clearer grounding (or the assistant's prompt needs adjustment).

---

## Utility Actions

**Copy answer:** the copy icon on each assistant message copies the full text **plus** the citation string appended — e.g., "...your answer text... (Source: KB0022991 · Flagging Articles)". Useful for pasting into tickets, emails, or your own notes with the source already tagged.

**Stop response:** cancels an in-flight streaming answer. Useful if you realise mid-stream you asked the wrong question, or the answer is clearly going off-track. Your question stays in the chat history but no answer is recorded.

**New conversation:** clears the chat but keeps your role. Same chips, same greeting, fresh context. Use when switching topics.

**Change role:** clears the chat **and** returns to the role-select screen. A confirm dialog appears first. Use when you're switching from "I'm looking for articles" mode to "I'm writing articles" mode (or vice versa).

**Sign out:** click the role pill in the header → **Sign out**. Clears your session cookie. If you have an unsent draft or an in-flight response, a confirm dialog appears first (so you don't lose work by accident).

---

## Session Expiry

Sessions last **8 hours**. If you leave the tab open past that, your next message will fail with **"Your sign-in has expired"** and a **Sign back in** button in the error card. Clicking it redirects to Entra for a fresh sign-in; you come back to the role-select screen (conversation history doesn't persist across sessions — by design, no server-side storage).

---

## Freshness Indicator

The chat header shows what the assistant is grounded in:

> *Grounded in KB0022991 v13.0 · KB0020882 v9.0 · Form schema 2026-04-15*

If the KB version number changes (e.g., KB0022991 v14), the Knowledge team has re-embedded the new source. Answers from that point forward reflect the new SOP.

**First-run "About this assistant" tooltip:** the first time you use the app, a small popover appears in the header explaining what the assistant can and can't answer. Click **"Got it"** to dismiss; it won't auto-open again on the same device.

---

## Troubleshooting

| Symptom | What to do |
|---------|-----------|
| Stuck on `/access-denied` | Click "Request access" — emails the Knowledge team |
| "Your sign-in has expired" | Click **Sign back in** in the error card |
| Typing indicator hangs >30s | Click **Stop response**, refresh the page, try again. If it happens repeatedly, flag it to the Knowledge team — could be an ingress issue. |
| "Our knowledge source is temporarily unavailable" (5xx) | Retry via the button in the error card. If it persists >5 minutes, it's an infrastructure issue — Ops is automatically alerted via the P1 alert rule. |
| Source panel shows wrong section | Click the citation chip again; if still wrong, thumbs-down with reason "wrong citation" |
| Assistant refuses a question you're sure it should know | Thumbs-down with "incomplete" + send the question via **Flag this gap** — helps expand eval coverage |

---

## Privacy

- **Your question text is never stored.** Only a salted SHA-256 hash is captured (so we can count unique questions without seeing them).
- **Your email / Entra OID** is captured as a one-way hash (same salt) — lets us measure session counts per user without storing identifiers.
- **No conversation history persists server-side.** When you close the tab or sign out, your chat is gone. Refreshing the page loses the chat too (by design).
- **Thumbs feedback** captures: message ID, role, rating, citation info, dropdown reason. No free text in v1.
- **Telemetry** is sent to MMC's App Insights tenant only. No third-party trackers.

The full telemetry schema is documented in `src/obs/eventSchema.ts` (code) and `docs/measurement-plan.md` (prose).

---

## Questions?

- **Content questions** ("why doesn't it know X?", "is the answer to Y correct?") → CTSS Knowledge team (see Content Steward runbook for named contact)
- **Access / sign-in questions** → same Knowledge team email, or your local IT helpdesk for Entra issues
- **Bug reports / UI weirdness** → file a GitHub issue with the label `user-report` (if you have repo access), or email the Knowledge team

---

*Updated: 2026-04-24 for v1 Pilot Release.*
