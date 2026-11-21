import { createContext, useContext } from 'react';
import type { SlotColours } from './colourCss';

// The held Colour Set's colours, for the slot pickers to show. Provided by the
// Show view; none elsewhere, and a picker then shows no sample.
export const SlotColoursContext = createContext<SlotColours>(undefined);

export function useSlotColours(): SlotColours {
  return useContext(SlotColoursContext);
}
