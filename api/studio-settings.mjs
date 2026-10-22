import { z } from "zod";
import { slicerSettingFields } from "../frontend-vue/src/utils/slicer-settings.mjs";
export const advancedSlicerSchema = z
  .object(
    Object.fromEntries(
      slicerSettingFields.map((field) => [
        field.id,
        (field.choices
          ? z.union(field.choices.map(([value]) => z.literal(value)))
          : field.step === 1
          ? z.number().int().min(field.min).max(field.max)
          : z.number().finite().min(field.min).max(field.max)
        ).optional(),
      ])
    )
  )
  .strict();
export function orcaAdvancedSettings(advanced = {}) {
  const parsed = advancedSlicerSchema.parse(advanced),
    process = {},
    machine = {};
  for (const field of slicerSettingFields) {
    if (parsed[field.id] === undefined) continue;
    const value =
      typeof parsed[field.id] === "boolean"
        ? parsed[field.id]
          ? "1"
          : "0"
        : String(parsed[field.id]);
    if (field.orca) process[field.orca] = value;
    if (field.machine) machine[field.machine] = [value];
  }
  if (parsed.brimWidth !== undefined)
    process.brim_type = parsed.brimWidth > 0 ? "outer_only" : "no_brim";
  return { process, machine };
}
