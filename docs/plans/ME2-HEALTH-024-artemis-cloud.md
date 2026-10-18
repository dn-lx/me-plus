# ME2-HEALTH-024 — Google Artemis cloud Android acceptance

User requested https://github.com/google/artemis on18October and cannot connect a USB phone. Gemini credential is configured locally on D: and provider model listing returnedHTTP200; credentials must never enter source, logs or chat.

Use the existing signed0.4.3/code9 artifact from run39119321617, source b27d1ea77321fd0aad1d43efa1ec59c910928253. Verify immutable APK bytes/provenance before cloud installation. Pinned Google Artemis351ca8422f7b5b54e80a9c1ce03a222e02415b6b runs with frozen Python dependencies. Ephemeral API35 Google APIs x86_64 emulator must actually advertise compatible ABIs and install the arm64 APK; installation failure is a real infrastructure limitation, not a pass.

Artemis explores actual screens before tests. Scope initially includes signed-out launch, layout, empty-form handling and background/reopen responsiveness. No real login credentials, personal health data or synthetic live health records. Pro strict verification requires machine-readable run_outcome and all four checks passed; exit status alone is insufficient. Capture screenshots, UI XML, install/device metadata, crash logs and traces as three-day artifacts. Model calls run only with an Actions secret and bounded600second task/35minute job.

Cloud runs require repository Actions secretGEMINI_API_KEY. The connector has no secret-management capability; user setup may be necessary. Do not move local secrets through chat or commit them. Signed-in Health Connect data, personal historical catch-up and real-phone periodic scheduling remain separate acceptance; a cloud smoke test cannot certify them.

Delivery: focused PR into dev, independent boundary review, actual hosted run and artifact inspection, honest evidence/handoff, merge after relevant checks. No production promotion or new paid device-farm provisioning.


## First real cloud result and correction
Run39122017585 installed the exact ARM64 signed phoneAPK on API35 x86_64 using advertised ARM translation. Actual launch crashed: SoLoaderDSONotFoundError libreactnative.so, with APKloader selecting lib/x86_64 while phoneartifact contains onlyarm64. Artemis observed repeated launch failure; no UI acceptance passed. Gemini3.8 also returned503/504 and timedout. Preserve this failed evidence rather than treating install success as launch success.

Cloud verification now builds a separately labeled x86_64 test-only APK from the SAME pinned b27d1ea77321fd0aad1d43efa1ec59c910928253 source using the approved hostedWindowsbuilder and frozen dependencies. Artifact hash passes from builder to emulator job; manifest/signer/bundle/ABI/source/version verified. This APK is never published as the ARM64 phone installer. Device screenshots/strictPro checks establish x86 test-variant behavior only; the phone download remains the verified ARM64artifact.
