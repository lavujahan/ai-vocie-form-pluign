# AI model choice: comparison plan and implementation plan

How the AI model and the way recordings are mapped were chosen in October 2026, and what was changed in the app as a result.

## 1. Comparison plan

### Why
The AI cost per recording was high. Three things drove it:

- **Every AI step ran on gpt-4o:** form analysis, mapping speech to fields, and dropdown matching.
- **The `validate_value` round trip:** the mapping agent checked each value with a tool, and every tool call re-sent the whole prompt, about 2 requests per mapping.
- **Re-mapping:** a long recording is cut into 28-second pieces (Sarvam's limit is 30 s), and the server mapped *all speech so far* after every piece. A 2-minute recording meant about 5 mappings of growing length.

### Goal
Cut the cost without losing accuracy or speed.

### Test data
- **A real form:** nicforms "Community asset maintenance". Its fields come from its latest scan: labels, 50 villages, 10 sub-districts, and so on.
- **Real recordings:** each one is the whole form spoken once, as an operator would say it, in English and in Tamil.
- **An answer key per recording:**
  1. The first run writes a draft.
  2. It is corrected by hand once.
  3. Every later run is scored against it.

### Method
- **Same text for every model:**
  - Each recording is cut into 28 s pieces exactly like the phone does.
  - Each piece is transcribed by Sarvam **once** and saved, so every model gets the same text and speech-to-text can't skew the comparison.
  - The Sarvam time is recorded too, because it is part of the wait on the phone.
- **Replay like the server:** the server's mapping is replayed for each variant, and **every** request is counted: input, cached and output tokens.
- **Repeats:** each combination runs 3 times, because model answers vary from run to run.
- **Reported per variant and model:**
  - accuracy (fields right out of fields checked);
  - mappings and requests per recording;
  - tokens;
  - $ and ₹ per recording;
  - the wait after Stop (median and slowest).

### Variants (how one recording is mapped)

| Variant | What changes | Question it answers |
|---|---|---|
| A | validate_value, all speech so far after every piece (the old setup) | Baseline |
| B | No validate_value; the server still checks every value | Is the round trip worth its cost? |
| C1 | B, but each mapping reads only this piece plus the one before | Smaller requests with the same accuracy? |
| C2 | B, but the recording is mapped **once, after Stop** | Cheapest; fields fill only after Stop |

### Models compared
- gpt-4o
- gpt-4.1-mini
- gpt-4o-mini
- gpt-5-mini@minimal
- gpt-5.4-mini at reasoning effort none, low, medium and high
- gpt-5.4-nano
- gpt-5.6-luna

The 54 Tamil, English and Tanglish test sentences (`pnpm eval:mapping`) were also run on the main candidates. They cover corrections and spoken commands.

**Form analysis:** compared on the same form, checking field types, required fields and Tamil labels against gpt-4o, plus cost and time.

### Choice rule
1. **Accuracy:**
   - no worse than the old setup;
   - no mistakes on the mobile number, the cost, or village / sub-district;
   - Tamil speech translated to English, which the form needs.
2. **Wait:** no slower than the old setup.
3. **Then the cheapest** variant and model that pass.

### Decision
- **C2** (map once, after Stop).
- **gpt-5.4-mini at low reasoning effort** for every AI step.
- **validate_value off.**

Why not the others:
- **gpt-5.4-mini at effort none** sometimes left Tamil words untranslated.
- **gpt-4.1-mini** sometimes produced a runaway reply that ran until the output limit.
- **Higher efforts** cost more and took longer, with no gain in accuracy.

## 2. Implementation plan (as built)

1. **The phone marks the last piece.**
   - [use-recorder.ts](../apps/web/app/s/[code]/use-recorder.ts) reports `last` for the piece that ended the recording: Stop, a screen lock, a call or an app switch. A 28 s cut is not last.
   - [use-voice-session.ts](../apps/web/app/s/[code]/use-voice-session.ts) sends `last=1` with that piece. A retry is always sent as last, so it re-maps the whole recording.
2. **The server maps once.**
   - In [utterances/route.ts](../apps/web/app/api/utterances/route.ts), pieces before the last one are only transcribed, with no AI call.
   - The last piece (or a retry) waits for the earlier pieces' transcripts, joins **every** piece in order ([recordings.ts](../apps/web/lib/recordings.ts)), and maps once.
   - **Edge cases:**
     - A page that sends no mark (an older phone page) maps as before.
     - A tiny last piece (Stop just after a cut) is not sent to Sarvam; it only marks the end.
     - A last piece that caught only silence still maps the pieces before it.
3. **One model for all AI steps, with limits.**
   - In [usage.ts](../apps/web/lib/agents/usage.ts), `DEFAULT_AGENT_MODEL = 'gpt-5.4-mini@low'`.
   - `AGENT_MODEL`, `MAPPER_MODEL`, `ANALYZER_MODEL` and `RESOLVER_MODEL` still override it.
   - Each step has an output-token limit and a timeout, so a runaway reply fails fast:

     | Step | Output-token limit | Timeout |
     |---|---|---|
     | Mapping | 4,000 | 30 s |
     | Form analysis | 16,000 | 90 s |
     | Dropdown matching | 2,000 | 20 s |

   - validate_value is off by default in [fieldMapper.ts](../apps/web/lib/agents/fieldMapper.ts). The server still checks every value afterwards.
4. **Wait messages after Stop.**
   - Until the answers arrive, the phone shows messages that change every 1.8 s, with a spinner: "Please wait…", "Thinking…", "Planning…", "Matching your answers to the fields…", "Filling the form…", "Don't close this page…", "Loading…". The list then repeats.
   - While recording, the hint says the fields fill when you tap Stop.
   - Both texts are in English and Tamil ([i18n.ts](../apps/web/lib/i18n.ts), [voice-session.tsx](../apps/web/app/s/[code]/voice-session.tsx)).
5. **Steps left after the code change:**
   - Remove `AGENT_MODEL=gpt-4o` from `apps/web/.env.local` and from Vercel, or set it to `gpt-5.4-mini@low`. Otherwise it overrides the new default.
   - Check on the phone:
     - a recording longer than 30 s;
     - a short recording;
     - a row-mic recording;
     - a retry;
     - a dropdown the computer couldn't match.
   - In Admin → Usage, set the token prices to gpt-5.4-mini's: $0.75 input and $4.50 output per 1M tokens.
6. **Read each form once.**
   - A form's reading is saved (migration `0012_form_cache.sql`, [formCache.ts](../apps/web/lib/agents/formCache.ts)) and reused by every later scan of the same form, by any user, for 30 days.
   - The form is recognised by a fingerprint of the page path and its fields. It is read again sooner when its fields change, or when the model or the analyzer's instructions change.
   - Admin → Forms lists the saved readings, with search, sort, **Edit labels** (English, Tamil, required) and **Read again**.
7. **Cheaper requests.**
   - **Cache hits:** every AI request carries a cache key per step and form (`prompt_cache_key`), and GPT-5.x models keep the cached instructions up to 24 h (`prompt_cache_retention`), so the fixed instructions are billed at 10% more often.
   - **Shorter answers:** the mapper no longer writes the list of required fields still empty (`missing_required`) or the speech it couldn't place (`unmapped_speech`). Nothing in the app used them; the phone works out what is missing itself.
   - **Short field ids:** the mapper sees the fields as `f1, f2, …` (numbered over the whole form, so a field keeps its id with the row mic too) instead of the site's long keys; the server turns the ids back into the keys.
   - **Short "what was said":** `source_phrase` holds only the spoken words of the value, without the field's label (it is still shown on the phone as "Heard: …" when it differs from the value).
8. **Row mics only for corrections.** Filling field by field (14 row-mic recordings) measured ₹1.30 and about 26 s of AI waiting against ₹0.73 and about 5 s for one whole-form recording, so each row's mic appears only once 70% of the voice fields are filled ([voice-session.tsx](../apps/web/app/s/[code]/voice-session.tsx), `ROW_MIC_AT`). It hides again when fewer are filled (e.g. after Start over).
9. **No spoken commands.** "Start over", "send it" and "what is left?" by voice were removed (the rule, the answer's `command` slot and the phone's handling); the buttons do these. Command-like speech now fills nothing, which the test sentences check.
