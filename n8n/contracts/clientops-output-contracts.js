// Native JavaScript embedded in Code nodes. No app TypeScript or external imports.
// Server/worker parity is exercised with identical fixtures, including exact decimal rounding.
const CURRENCY_MINOR_UNITS = {
  HKD: 2,
  USD: 2,
  CNY: 2,
  EUR: 2,
  GBP: 2,
  SGD: 2,
  MYR: 2,
  JPY: 0,
  KRW: 0,
};
function contractError(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function contractNumber(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    contractError("INVALID_AI_OUTPUT");
  return value;
}
function contractText(value, nonempty = true) {
  if (typeof value !== "string" || (nonempty && !value.trim())) contractError("INVALID_AI_OUTPUT");
  return nonempty ? value.trim() : value;
}
function fraction(value) {
  const [base, exponent = "0"] = value.toString().toLowerCase().split("e");
  const digits = base.replace(".", ""),
    scale = (base.split(".")[1]?.length ?? 0) - Number(exponent);
  return scale < 0
    ? { n: BigInt(digits) * 10n ** BigInt(-scale), d: 1n }
    : { n: BigInt(digits), d: 10n ** BigInt(scale) };
}
function computeQuoteTotal(items, minorUnits) {
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 4)
    contractError("QUOTE_CURRENCY_UNSUPPORTED");
  const factor = 10n ** BigInt(minorUnits);
  let total = 0n;
  for (const item of items) {
    if (
      typeof item.qty !== "number" ||
      !Number.isFinite(item.qty) ||
      item.qty <= 0 ||
      typeof item.unit_price !== "number" ||
      !Number.isFinite(item.unit_price) ||
      item.unit_price < 0
    )
      contractError("INVALID_QUOTE_ITEM");
    const q = fraction(item.qty),
      p = fraction(item.unit_price),
      d = q.d * p.d;
    total += (q.n * p.n * factor * 2n + d) / (2n * d);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) contractError("QUOTE_TOTAL_OVERFLOW");
  }
  return Number(total) / Number(factor);
}
function validateQuoteDraft(input, context) {
  if (
    !isPlainObject(input) ||
    typeof input.currency !== "string" ||
    typeof input.total_value !== "number" ||
    !Number.isFinite(input.total_value) ||
    input.total_value < 0 ||
    !Array.isArray(input.line_items) ||
    input.line_items.length < 1 ||
    input.line_items.length > 20
  )
    contractError("INVALID_QUOTE_OUTPUT");
  const currency = input.currency.trim(),
    precision = context.minorUnitsByCurrency[currency];
  if (!context.allowedCurrencies.includes(currency) || precision === undefined)
    contractError("QUOTE_CURRENCY_UNSUPPORTED");
  if (
    input.number !== undefined &&
    input.number !== null &&
    (typeof input.number !== "string" || !input.number.trim())
  )
    contractError("INVALID_QUOTE_OUTPUT");
  if (input.valid_until !== undefined && input.valid_until !== null) {
    if (typeof input.valid_until !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.valid_until))
      contractError("INVALID_QUOTE_OUTPUT");
    const d = new Date(input.valid_until + "T00:00:00.000Z");
    if (!Number.isFinite(d.valueOf()) || d.toISOString().slice(0, 10) !== input.valid_until)
      contractError("INVALID_QUOTE_OUTPUT");
  }
  const items = input.line_items.map((item) => {
    if (
      !isPlainObject(item) ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      typeof item.service !== "string" ||
      !item.service.trim() ||
      typeof item.description !== "string" ||
      typeof item.qty !== "number" ||
      !Number.isFinite(item.qty) ||
      item.qty <= 0 ||
      typeof item.unit_price !== "number" ||
      !Number.isFinite(item.unit_price) ||
      item.unit_price < 0
    )
      contractError("INVALID_QUOTE_OUTPUT");
    return {
      id: item.id.trim(),
      service: item.service.trim(),
      description: item.description,
      qty: item.qty,
      unit_price: item.unit_price,
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length)
    contractError("QUOTE_DUPLICATE_ITEM");
  const computed = computeQuoteTotal(items, precision),
    supplied = fraction(input.total_value),
    authoritative = fraction(computed);
  if (supplied.n * authoritative.d !== authoritative.n * supplied.d)
    contractError("QUOTE_TOTAL_MISMATCH");
  return {
    ...(input.number !== undefined
      ? { number: input.number === null ? null : input.number.trim() }
      : {}),
    currency,
    total_value: computed,
    ...(input.valid_until !== undefined ? { valid_until: input.valid_until } : {}),
    line_items: items,
  };
}
function extractExplicitBudget(text) {
  if (
    /\b(no|not|without|unknown|unconfirmed|monthly|per\s+month)\b|沒有|未定|不確定|並非|不是|每月|月費|[-–—~至]\s*\d|\d\s*(?:to|到)\s*\d|\d\s*(?:[km]\b|萬|千|million\b|thousand\b)/i.test(
      text,
    )
  )
    return null;
  const matches = [
    ...text.matchAll(
      /\b(HKD|USD|CNY|EUR|GBP|SGD|MYR|JPY|KRW)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(?![0-9.,])|(?:港幣|港元|HK\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(?![0-9.,])/gi,
    ),
  ];
  if (matches.length !== 1) return null;
  const match = matches[0],
    amount = Number((match[2] ?? match[3]).replaceAll(",", "")),
    currency = (match[1] ?? "HKD").toUpperCase(),
    remainder = text.slice(0, match.index) + text.slice(match.index + match[0].length);
  if (
    /\d|\$|\b(HKD|USD|CNY|EUR|GBP|SGD|MYR|JPY|KRW)\b/i.test(remainder) ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(Math.round(amount * 100))
  )
    return null;
  return { amount, currency, evidence: text };
}
function validateWorkerOutput(workflow, value, context) {
  if (!isPlainObject(value)) contractError("INVALID_AI_OUTPUT");
  if (workflow === "score_renewal_risk") {
    contractNumber(value.confidence, 0, 1);
    contractNumber(value.health_score, 0, 100);
    if (!["low", "medium", "high"].includes(value.renewal_risk)) contractError("INVALID_AI_OUTPUT");
    return {
      health_score: value.health_score,
      renewal_risk: value.renewal_risk,
      risk_reasoning: contractText(value.risk_reasoning),
      suggested_next_action: contractText(value.suggested_next_action),
      confidence: value.confidence,
      output_summary: contractText(value.output_summary),
    };
  }
  contractNumber(value.confidence_score, 0, 1);
  if (workflow === "qualify_lead") {
    contractNumber(value.lead_score, 0, 100);
    const q = value.qualification_data;
    if (!isPlainObject(q)) contractError("INVALID_AI_OUTPUT");
    contractNumber(q.urgency_score, 0, 10);
    contractNumber(q.fit_score, 0, 10);
    contractNumber(q.qualification_score, 0, 100);
    contractNumber(q.confidence, 0, 1);
    if (
      !Array.isArray(q.service_interest) ||
      q.service_interest.length > 20 ||
      q.service_interest.some((item) => typeof item !== "string" || !item.trim()) ||
      !["Schedule discovery call", "Send intro deck", "Request more info", "Disqualify"].includes(
        q.next_action,
      ) ||
      typeof q.human_review_required !== "boolean"
    )
      contractError("INVALID_AI_OUTPUT");
    return {
      lead_score: value.lead_score,
      qualification_data: {
        urgency_score: q.urgency_score,
        fit_score: q.fit_score,
        qualification_score: q.qualification_score,
        service_interest: q.service_interest.map((item) => item.trim()),
        budget_range: contractText(q.budget_range),
        next_action: q.next_action,
        reason: contractText(q.reason, false),
        confidence: q.confidence,
        human_review_required: q.human_review_required,
      },
      output_summary: contractText(value.output_summary),
      confidence_score: value.confidence_score,
    };
  }
  if (workflow === "draft_reply") {
    if (
      value.risk_notes !== undefined &&
      (!Array.isArray(value.risk_notes) ||
        value.risk_notes.some((note) => typeof note !== "string"))
    )
      contractError("INVALID_AI_OUTPUT");
    return {
      draft_message: contractText(value.draft_message),
      context_summary: contractText(value.context_summary),
      confidence_score: value.confidence_score,
      ...(value.risk_notes !== undefined ? { risk_notes: value.risk_notes } : {}),
    };
  }
  if (workflow === "draft_quote") {
    if (
      typeof value.create_send_approval !== "boolean" ||
      (value.context_summary !== undefined &&
        value.context_summary !== null &&
        typeof value.context_summary !== "string")
    )
      contractError("INVALID_AI_OUTPUT");
    return {
      quote: validateQuoteDraft(value.quote, {
        allowedCurrencies: (context.pricing_templates ?? []).map((item) => item.currency),
        minorUnitsByCurrency: CURRENCY_MINOR_UNITS,
      }),
      create_send_approval: value.create_send_approval,
      ...(value.context_summary !== undefined ? { context_summary: value.context_summary } : {}),
      confidence_score: value.confidence_score,
    };
  }
  if (workflow === "relationship_intelligence") {
    if (value.next_action !== null && typeof value.next_action !== "string")
      contractError("INVALID_AI_OUTPUT");
    if (!Array.isArray(value.signals) || value.signals.length > 50)
      contractError("INVALID_AI_OUTPUT");
    const signals = value.signals.map((signal) => {
      if (
        !isPlainObject(signal) ||
        ![
          "missing_decision_maker",
          "missing_champion",
          "stale_touchpoint",
          "post_event_follow_up_due",
          "stale_quote",
          "coverage_gap",
          "high_risk_engagement",
          "negative_sentiment",
          "unowned_account",
          "cross_sell_opportunity",
        ].includes(signal.signal_type) ||
        !["low", "medium", "high"].includes(signal.severity) ||
        (signal.suggested_action !== null && typeof signal.suggested_action !== "string")
      )
        contractError("INVALID_AI_OUTPUT");
      return {
        signal_type: signal.signal_type,
        severity: signal.severity,
        title: contractText(signal.title),
        reason: contractText(signal.reason),
        suggested_action: signal.suggested_action,
        dedupe_key: contractText(signal.dedupe_key),
      };
    });
    return {
      output_summary: contractText(value.output_summary),
      next_action: value.next_action,
      signals,
      confidence_score: value.confidence_score,
    };
  }
  contractError("INVALID_AI_OUTPUT");
}
function trustedWorkerFallback(workflow, prepared) {
  const fallback = JSON.parse(JSON.stringify(prepared.fallback)),
    context = prepared.context ?? {};
  if (workflow === "qualify_lead") {
    const budget = extractExplicitBudget(context.lead?.enquiry_text ?? "");
    fallback.qualification_data.budget_range = budget
      ? `${budget.currency} ${budget.amount}`
      : "unknown";
  }
  if (workflow === "draft_quote") {
    const prices = context.pricing_templates ?? [];
    const selected = (
      prices.filter((price) =>
        fallback.quote?.line_items?.some((item) => item.service === price.service),
      ).length
        ? prices.filter((price) =>
            fallback.quote?.line_items?.some((item) => item.service === price.service),
          )
        : prices.slice(0, 1)
    ).slice(0, 20);
    if (
      !selected.length ||
      selected.some(
        (price) =>
          price.unit_price === null ||
          price.unit_price === undefined ||
          price.unit_price === "" ||
          !Number.isFinite(Number(price.unit_price)) ||
          Number(price.unit_price) < 0 ||
          price.currency !== selected[0].currency,
      ) ||
      CURRENCY_MINOR_UNITS[selected[0].currency] === undefined
    )
      contractError("QUOTE_PRICING_UNAVAILABLE");
    const items = selected.map((price, index) => ({
      id: `line-${index + 1}`,
      service: price.service,
      description: price.description ?? `${price.service} support package`,
      qty: 1,
      unit_price: Number(price.unit_price),
    }));
    fallback.quote = {
      number: fallback.quote?.number ?? null,
      currency: selected[0].currency,
      total_value: computeQuoteTotal(items, CURRENCY_MINOR_UNITS[selected[0].currency]),
      valid_until: fallback.quote?.valid_until ?? null,
      line_items: items,
    };
  }
  return validateWorkerOutput(workflow, fallback, context);
}
