# Entered-header task actions

Corrects the action placement.

Final UI rule:
- Auto Fill appears only once, inside the Entered/Calculated section header.
- Clear data is beside Auto Fill in that same header.
- Hide/show arrow remains at the far right.
- No Auto Fill / Clear buttons remain in the top task header.
- No separate bottom/footer action card.

Reusable component:
`frontend_next/src/components/bun-nsw-act/tasks/EnteredTaskActions.jsx`

Applied to result headers for:
Frame Hardware, Flooring, Hebel Flooring, Insulation, Eaves, Cladding,
Lockup, Shelving, Beams & Posts, Power Truss, FOW Plumbing, Fixout.

Database safety:
Clear data still clears only current in-memory/form state. It does not issue DB DELETE/UPDATE.
