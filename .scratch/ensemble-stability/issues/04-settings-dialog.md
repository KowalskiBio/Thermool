# 04: Settings dialog and header

Status: resolved

Gear button in the header next to the theme toggle; `SettingsDialog.tsx`
(native dialog) with Engine tab (structure engine + equilibrium split
two-way / three-way) and IDT tab (form extracted from `IdtDialog.tsx`,
which is then deleted; secretStore untouched). ConditionsBar loses the
Structure engine segment. Connect IDT pill replaced by the gear with a
status dot.

Blocked by: 03

## Answer

Done. `SettingsDialog.tsx` (Engine + IDT tabs), `IdtCredentialsForm.tsx` extracted from the deleted `IdtDialog.tsx`; gear button with IDT status dot next to the theme toggle; ConditionsBar lost the engine segment; `thermool-equilibrium-split` persisted.
