# Sarvam-105B vs gpt-5.4-mini@low

A test run on 2026-10-28 asked whether Sarvam's LLM, **sarvam-105b**, could replace **gpt-5.4-mini@low** for the AI steps. It measured accuracy, speed and cost.

**Result: stay on gpt-5.4-mini@low.** When Sarvam-105B returned an answer, the answer was right. But 37% of its calls never returned a usable answer. It was about 6× slower, and each call cost twice as much, even though its tokens are about 5× cheaper.

## Setup

- **Same prompt and output structure for both models:** the app's real mapper and analyzer instructions, with the same zod output schemas (`MappingResult`, `FormAnalysis`). Only the model changed.
- **How Sarvam was called:** through `https://api.sarvam.ai/v1/chat/completions` (OpenAI-compatible) with `response_format: json_schema`, `reasoning_effort: low` and the same output-token limits as the app (mapper 4,000, analyzer 16,000).
- **Mapper test data:** the 54 Tamil / English / Tanglish test sentences (`pnpm eval:mapping`), scored field by field against their answer key.
- **Analyzer test data:** 3 fixture forms with an answer key, plus the 5 most-used real forms, scored by agreement with their saved readings.
- **Token counts:** read from every API response, including failed calls, because those are billed too.
- **Cost:** list prices at ₹88/$.
  - gpt-5.4-mini: $0.75 input, $0.075 cached input, $4.50 output per 1M tokens.
  - sarvam-105b: ₹15 input, ₹5 cached input, ₹60 output per 1M tokens, excluding GST (Sarvam changelog, 2026-10-10).
- **Waits:** measured from a machine in India, so they include the network to each provider.

## Mapping (speech → fields)

| | gpt-5.4-mini@low | sarvam-105b@low |
|---|---|---|
| Runs | 54 cases × 3 = 162 calls | 54 cases × 1 = 54 calls |
| **Field accuracy** | **251/252 (99.6%)** | **57/84 (67.9%)** |
| Cases fully right | 161/162 | 34/54 |
| english | 100% | 70.0% |
| tanglish | 100% | 53.8% |
| tamil | 100% | 70.0% |
| field (single field) | 100% | 25.0% |
| can (government form) | 100% | 69.6% |
| corrections | 100% | 77.8% |
| commands | 93.3% (case #50 wrong once) | 100% |
| **Calls that failed** | **0** | **20/54 (37%)** |
| **Wait per case, median** | **1.9 s** | **11.5 s** |
| Wait per case, p90 / slowest | 2.5 s / 4.1 s | 21.2 s / 25.1 s |
| Input tokens per case (% cached) | 3,242 (88.5%) | 3,129 (85.5%) |
| Output tokens per case (of which reasoning) | 100 (34) | 2,426 (1,695) |
| **Cost per case** | **₹0.083** | **₹0.166** |
| Cost per case with no cache hits | ₹0.253 | ₹0.192 |

**Sarvam's successful calls only (34 of 54):** all 34 were fully right. Median wait 7.3 s, about 1,540 output tokens, of which about 1,480 were reasoning.

## Form analyzer

| | gpt-5.4-mini@low | sarvam-105b@low |
|---|---|---|
| Runs | (3 fixture + 5 real forms) × 3 = 24 calls | not finished |
| Answer key (fixture forms) | 161/168 (95.8%) | — |
| Agreement with saved readings (real forms) | 1,403/1,557 (90.1%) | — |
| Fields covered / valid Tamil labels | 402/402 / 402/402 | — |
| Wait per form, median / p90 | 7.9 s / 14.8 s | — |
| Tokens per form: input (cached) / output (reasoning) | 2,633 (66%) / 1,614 (225) | — |
| Cost per form | ₹0.709 | — |

The Sarvam analyzer run was stopped before it finished, because the mapping result had already settled the question. On the real forms, gpt-5.4-mini agreed with its own saved readings only 90.1% of the time. Most of the differences are label wording, admin-edited labels, and readings saved under an older prompt version. So 90% is the bar a second model would be measured against, not 100%.

## Why Sarvam failed

None of the failures were wrong values. In each case the call returned no usable answer. There were three kinds:

1. **The JSON was never finished (14 of 20).** The reply was correct up to a point, then turned into whitespace until the 4,000-token limit (`finish_reason: "length"`). Case #29 ("ramesh at gmail dot com") is an example:

   ```
   {"values":[{"field_key":"f2","value":"ramesh@gmail.com","confidence":0.95,"source_phrase":"ramesh at gmail dot com"        \n\n    \n   \n ...
   ```

   The likely cause is Sarvam's constrained decoding for `json_schema`. Whitespace is always allowed between JSON parts, so when the model wants a token the schema forbids, it loops on whitespace instead. In the sample, the reply broke just before the nullable array-of-objects field `number_parts`. That is one reply, not a tested cause. OpenAI never did this with the same schema.
2. **Reasoning used up the token limit (5 of 20).** These calls spent all 4,000 tokens on reasoning at effort `low` and returned no answer at all.
3. **A prompt rule was broken (1 of 20).** The answer used the label `city` as the field id instead of `f7`, and the guardrail rejected it, as it should.

Every failed call is still billed for its full 4,000 output tokens. Together with about 1,500 reasoning tokens on the successful calls, this makes Sarvam twice as expensive per case, although its token prices are lower. With no cache hits at all, Sarvam would be cheaper (₹0.192 vs ₹0.253), but only because of its lower token prices.

## If Sarvam is tried again

- **Non-strict JSON:** send `strict: false` or `json_object` and validate the reply with the same zod schema in our code. This should prevent the whitespace loop (failure kind 1). The output structure stays the same.
- **Reasoning off:** run with reasoning off (no `reasoning_effort`). This should prevent failure kind 2 and cut the wait and output tokens. Only effort `low` was tested here.
- **Lower output-token limit:** for example 1,000 for the mapper, so a runaway reply fails faster and costs less. Accuracy would not improve.
- **Report the bug to Sarvam:** the whitespace loop under `json_schema` belongs to them, and the captured request and reply above show it.
- **Decision rule:** re-test with a fix only if Sarvam reaches ≥ 99% field accuracy with 0 failed calls, a median wait ≤ 3 s, and a lower cost per case than ₹0.083 (the rule in [ai-model-plan.md](ai-model-plan.md)).

The test code (the Sarvam model adapter, the analyzer and compare scripts, and the eval changes) was removed after this run. The app is unchanged and still uses gpt-5.4-mini@low for every AI step.
