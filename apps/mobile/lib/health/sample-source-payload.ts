// Each sample retains its provider context and raw value without duplicating
// the entire interval's samples in every reading (quadratic upload growth).
export function sampleSourcePayload(
  record: Record<string, unknown>,
  sample: Record<string, unknown>,
  sampleIndex: number,
): Readonly<Record<string, unknown>> {
  return {
    recordType: record.recordType ?? "HeartRate",
    startTime: record.startTime ?? null,
    endTime: record.endTime ?? null,
    metadata: record.metadata ?? null,
    sampleIndex,
    sample,
    sourceRecord: { ...record, samples: [sample] },
  };
}
