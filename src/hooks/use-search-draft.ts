import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * The text in a search box whose committed value lives in the URL.
 *
 * Routes commit the trimmed draft to the URL after a short pause, and the URL can also change
 * from elsewhere (Back, Clear, a saved view). The draft follows those outside changes, but not
 * the draft's own commit coming back trimmed: replacing "renewal " with "renewal" while the
 * person is still typing turned their next keystroke into "renewalc".
 */
export function useSearchDraft(committed: string): [string, Dispatch<SetStateAction<string>>] {
  const [draft, setDraft] = useState(committed);

  useEffect(() => {
    setDraft((current) => (current.trim() === committed ? current : committed));
  }, [committed]);

  return [draft, setDraft];
}
