# RITM: personal interface

User steering: premium visual design, choose a name, remove editing JSON from the ordinary nutrition workflow. This is an extension of the authorized personal fork. Routine design choices are delegated; no extra approval gate is needed.

Name: **RITM**. Training, food and recovery follow one rhythm. Preserve upstream attribution and the existing versioned exchange formats, so files already produced remain compatible.

Revised after owner feedback: the restrained sage/beige treatment felt dull. Use an ink-black athletic visual direction with electric lime, atmospheric light and fine trajectory lines, darker contrasting feature panels in both themes, stronger typography and locally bundled Manrope (OFL). Keep existing accent/language/theme controls. No runtime font or background network request.

The Start/Resume control floats independently above the bottom bar and is centred on the viewport at every width. The five navigation destinations share equal slots. Preserve start/resume/picker behavior and all existing tabs. Reserve enough bottom clearance for the raised button.

Real loading states use a branded animated mark, orbit and pulse; no artificial waits. Honour reduced motion. Buttons expose aria-busy and cannot double submit while busy.

Device privacy is optional and disabled by default. Settings → App protection lets the owner set/change/remove a local password and opt into Android system biometrics where available. Password verifiers use random salts and PBKDF2-HMAC-SHA-256 at 600,000 iterations; plaintext never persists or enters profile sync/exports. Wrong attempts have persisted throttling. A cancelled/failed biometric prompt never unlocks. Browser offers password only; Android uses BiometricPrompt. Configure/disable/reconfigure requires current password when protection is already enabled. Protect immediately on cold start and when explicitly locked, and relock after 30 seconds away. Corrupt configuration fails closed with retry, without silently resetting protection. This is an interface privacy lock, not encryption of existing workout files/backups; say so in setup. The agent implements controls but does not select or enter the owner's real password or enable biometrics for them.

Implementation order for this extension: visual tokens/background and centered Start; real loading UI; password service with failure/recovery tests; Android biometric bridge and privacy screen/gate; responsive/browser verification, frontend suite, production/native build. Task 5 Health Connect changes remain a separate in-progress part of the full project.

Nutrition has two views: Diary and Meal plan. Diary leads with the actual energy total and three macronutrients; progress is shown only against a known positive target. Unknown values remain explicit, incomplete totals never imply a complete day. Date navigation and meal logging stay visible. Meal cards retain grams, time and provenance.

Meal plan uses a normal form: name, notes, optional date range and targets, day chips (Every day / Monday–Sunday / dated exceptions), meal cards, add/edit/remove. New days are created when adding a meal. Saving preserves IDs and food provenance; planned food never becomes actual intake until confirmed. File import has a human-readable preview. Sharing and AI template actions live in a secondary exchange section, without code on the normal screen.

Apply shared tokens to all existing views and sheets without changing original workout behavior. Retain all six navigation destinations. Verify a narrow phone layout and both themes in the browser, functional editing/import/sharing tests, the full frontend suite and production build. Native branding and APK checks remain part of the full project.
