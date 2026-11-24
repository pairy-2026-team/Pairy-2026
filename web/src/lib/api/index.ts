import { IS_DEMO } from "@/lib/supabase/client";
import { demoApi } from "./demo";
import { supabaseApi } from "./supabase";
import type { PairyApi } from "./types";

export const api: PairyApi = IS_DEMO ? demoApi : supabaseApi;
export { demoApi };
export type { PairyApi, CreateFamInput } from "./types";
