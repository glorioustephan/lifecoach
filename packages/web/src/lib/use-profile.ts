import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Reads the user's `name` from the profile table for personalization. Used
 * by chat greetings and the BriefingPanel. Returns undefined while loading
 * or if no name is set — callers should fall back to "friend" or omit the
 * name entirely.
 */
export const useProfileName = (): string | undefined => {
  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: api.profile,
    staleTime: 60_000,
  });
  // `init` stores the user's preferred name under `preferredName`; `name` is a
  // fallback for anyone who set it directly via the profile API.
  const findString = (key: string): string | undefined => {
    const entry = data?.profile.find((p) => p.key === key);
    return typeof entry?.value === "string" && entry.value.trim().length > 0
      ? (entry.value as string)
      : undefined;
  };
  return findString("preferredName") ?? findString("name");
};
