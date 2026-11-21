# Coding standards

Read during review. Mechanical rules live in ESLint and `npm run check`, not here.

## Test fakes

A test fake of an engine command calls the shared apply function (`applyShowEdit`, `applyVenueEdit`). It does not re-implement the edit.
