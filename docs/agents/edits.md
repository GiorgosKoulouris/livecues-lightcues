# Show and Venue Patch edits

Every change to the open Show or Venue Patch is an edit.

- `ShowEdit` and `applyShowEdit`: `src/shared/show-edit.ts`.
- `VenueEdit` and `applyVenueEdit`: `src/shared/venue-edit.ts`.

The apply function is the only place edit bodies and their existence checks live. Callers:

- The engine sessions: `src/engine/show-session.ts`, `src/engine/venue-session.ts`.
- The renderer fakes in tests: `ShowView.test.tsx`, `VenuePatchView.test.tsx`.

## Adding an edit type

1. Add the variant to the edit union, and its body to the apply function.
2. Test it in `show-edit.test.ts` or `venue-edit.test.ts`.
3. Send it from the renderer through the existing hook (`useShow`, `useVenuePatch`).

Sessions and fakes need no change: they already call the apply function.
