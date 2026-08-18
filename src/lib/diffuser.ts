import { supabase } from "@/integrations/supabase/client";

export type Intensity = "low" | "medium" | "high";

export type Diffuser = {
  id: string;
  user_id: string;
  name: string;
  device_id: string | null;
  intensity: Intensity;
  schedule_days: number[];
  start_time: string;
  end_time: string;
  schedule_active: boolean;
};

export const DAYS = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
];

export const INTENSITIES: { value: Intensity; label: string; blurb: string }[] = [
  { value: "low", label: "Low", blurb: "A whisper of scent. Best for bedrooms and small rooms." },
  { value: "medium", label: "Medium", blurb: "Balanced diffusion for living rooms and offices." },
  { value: "high", label: "High", blurb: "Full strength for open spaces and entryways." },
];

/** Formats "14:30:00" as "2:30 PM" (US format). */
export function formatTime(value: string) {
  const [h = "0", m = "00"] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${suffix}`;
}

export function formatDays(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  if (sorted.join(",") === "1,2,3,4,5") return "Weekdays";
  if (sorted.join(",") === "0,6") return "Weekends";
  return sorted.map((d) => DAYS[d]?.short).filter(Boolean).join(" · ");
}

export async function fetchMyDiffusers(): Promise<Diffuser[]> {
  const { data, error } = await supabase
    .from("diffusers")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Diffuser[];
}
