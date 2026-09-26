import { useEffect, useMemo, useRef, useState } from "react";
import { validateSample } from "../api";
import { DEFAULT_VALIDATE_SAMPLE } from "../defaultSamples";
import HotspotPanel from "./HotspotPanel.jsx";

const TARGET_META = {
  infer: "按样本归纳出的契约校验",
  variant: "按事件变体契约（oneOf 分支）校验",
};

export default function ValidatePanel({ schema, variantSchema, target = "infer", onTargetChange }) {
  const [text, setText] = useState(DEFAULT_VALIDATE_SAMPLE);
  const [parseError, setParseError] = useState(null);
  const [busy, setBusy] = useState(false);
  // The outcome is stored together with a signature of the inputs it was
  // produced from (sample text + active contract), the same convention as
  // the contribution / variant analyses.
  const [outcome, setOutcome] = useState(null); // { signature, ok, data?, message? }
  // Monotonic id of the latest submitted request; bumped whenever the inputs
  // change so a late response from an outdated request is ignored.
  const requestSeq = useRef(0);

  // Fall back to the inferred contract when no variant contract is available.
  const activeTarget = target === "variant" && variantSchema ? "variant" : "infer";
  const activeSchema = activeTarget === "variant" ? variantSchema : schema;

  // Signature of the inputs a validation result applies to: the sample text
  // and the active contract. Editing the sample, re-inferring the schema or
  // switching the validate target changes it.
  const signature = useMemo(
    () => JSON.stringify([text, activeSchema]),
    [text, activeSchema]
  );

  // Inputs changed: any in-flight request is now outdated — bump the sequence
  // so its late response (success or failure) is dropped instead of
  // backfilling the panel, and reset the busy indicator.
  useEffect(() => {
    requestSeq.current += 1;
    setBusy(false);
  }, [signature]);

  // Derived invalidation: only the outcome whose signature matches the
  // current inputs is shown; a stale outcome stops rendering immediately and
  // an explicit hint asks for a re-run.
  const current = outcome && outcome.signature === signature ? outcome : null;
  const invalidated = outcome !== null && outcome.signature !== signature;
  const result = current && current.ok ? current.data : null;
  const error = current && !current.ok ? current.message : null;

  async function runValidate() {
    setParseError(null);
    let sample;
    try {
      sample = JSON.parse(text);
    } catch (e) {
      setParseError(e.message);
      return;
    }
    const seq = ++requestSeq.current;
    const runSignature = signature;
    setBusy(true);
    try {
      const data = await validateSample(activeSchema, sample);
      // Inputs changed or a newer request was submitted meanwhile: this
      // response no longer reflects the current inputs, so drop it.
      if (requestSeq.current !== seq) return;
      setOutcome({ signature: runSignature, ok: true, data });
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setOutcome({ signature: runSignature, ok: false, message: e.message });
    } finally {
      if (requestSeq.current === seq) setBusy(false);
    }
  }

  function handleTextChange(e) {
    setText(e.target.value);
    // The parse error describes the previously submitted text; clear it as
    // soon as the text is edited so it is not mistaken for the new content.
    setParseError(null);
  }

  if (!activeSchema) {
    return (
      <div className="empty-hint">
        请先在左侧归纳出 Schema，或在「⑤ 事件变体」生成变体契约，再校验新样本。
      </div>
    );
  }

  return (
    <div className="validate-panel">
      {variantSchema && onTargetChange && (
        <div className="validate-target">
          <span className="panel-label">校验目标</span>
          <div className="perspective-toggle">
            <button
              type="button"
              className={activeTarget === "infer" ? "active" : ""}
              onClick={() => onTargetChange("infer")}
            >
              归纳 Schema
            </button>
            <button
              type="button"
              className={activeTarget === "variant" ? "active" : ""}
              onClick={() => onTargetChange("variant")}
            >
              事件变体契约
            </button>
          </div>
          <span className="panel__meta">{TARGET_META[activeTarget]}</span>
        </div>
      )}

      <div className="validate-panel__editor">
        <div className="panel-label">待校验样本</div>
        <textarea
          className={`code-input ${parseError ? "code-input--err" : ""}`}
          value={text}
          onChange={handleTextChange}
          spellCheck={false}
          rows={12}
        />
        {parseError && <div className="parse-error">JSON 解析失败：{parseError}</div>}
        <button type="button" className="btn btn--primary" onClick={runValidate} disabled={busy}>
          {busy ? "校验中…" : "校验样本"}
        </button>
      </div>

      {invalidated && (
        <div className="alert alert--info">
          待检样本或校验契约已变化，上次校验结果已失效，请重新校验。
        </div>
      )}
      {error && <div className="alert alert--err">{error}</div>}

      {result && (
        <div className="validate-result">
          {result.valid ? (
            <div className="alert alert--ok">✓ 校验通过，样本符合契约。</div>
          ) : (
            <>
              <div className="alert alert--err">✗ 校验失败，共 {result.errors.length} 处问题：</div>
              <ul className="error-list">
                {result.errors.map((e, i) => (
                  <li key={i} className="error-item">
                    <div className="error-item__head">
                      <code className="error-pointer">{e.pointer}</code>
                      <span className="flag flag--keyword">{e.keyword}</span>
                    </div>
                    <div className="error-item__msg">{e.message}</div>
                    {e.params && Object.keys(e.params).length > 0 && (
                      <div className="error-item__params">
                        参数：<code>{JSON.stringify(e.params)}</code>
                      </div>
                    )}
                    <div className="error-item__schema">
                      规则：<code>{e.schemaPath}</code>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <HotspotPanel schema={activeSchema} target={activeTarget} />
    </div>
  );
}
